import { describe, expect, it, vi } from "vitest";
import type { Book } from "../connectors/book-scout/book";
import { bookProduct, getBookCommerceLink } from "../connectors/book-scout/commerce";
import { AmazonCommerceProvider } from "../providers/amazon/commerce";

const book: Book = {
  id: "google-books:abc123",
  title: "Greek Myths",
  authors: ["Example Author"],
  subjects: [],
  isbn13: "9781234567897",
};

describe("commerce boundary", () => {
  it("turns a book into a generic product without guessing an Amazon ASIN", () => {
    expect(bookProduct(book)).toEqual({ id: book.id, title: book.title, searchQuery: book.isbn13 });
    expect(bookProduct({ ...book, isbn13: undefined, isbn10: undefined }).searchQuery)
      .toBe("Greek Myths Example Author");
  });

  it("builds a tagged Amazon book-search link and accepts another commerce provider", async () => {
    const amazonLink = new URL(await getBookCommerceLink(book, new AmazonCommerceProvider("example-20")) ?? "");
    expect(amazonLink.origin).toBe("https://www.amazon.com");
    expect(amazonLink.pathname).toBe("/s/");
    expect(amazonLink.searchParams.get("field-keywords")).toBe(book.isbn13);
    expect(amazonLink.searchParams.get("search-alias")).toBe("stripbooks");
    expect(amazonLink.searchParams.get("tag")).toBe("example-20");
    const otherProvider = { createLink: vi.fn(async () => "https://example.org/item") };
    expect(await getBookCommerceLink(book, otherProvider)).toBe("https://example.org/item");
    expect(otherProvider.createLink).toHaveBeenCalledWith(bookProduct(book));
  });

  it("hides commerce links when no provider is configured", async () => {
    expect(await getBookCommerceLink(book, null)).toBeNull();
    expect(() => new AmazonCommerceProvider("bad tag&value")).toThrow(/invalid/);
  });
});
