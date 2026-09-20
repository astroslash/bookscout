import { describe, expect, it, vi } from "vitest";
import type { Book } from "../connectors/book-scout/book";
import { BookScoutDetailsService } from "../connectors/book-scout/details";
import { bookPath, bookScoutUrl, parseBookSlug } from "../connectors/book-scout/links";
import type { BookProvider } from "../connectors/book-scout/provider";

const book: Book = { id: "google-books:abc123", title: "A Book", authors: [], subjects: [] };

describe("Book Scout links and details", () => {
  it("prefers ISBN-13, then ISBN-10, then an encoded provider ID", () => {
    expect(bookPath({ ...book, isbn13: "9780786838653", isbn10: "0786838655" })).toBe("/book/9780786838653");
    expect(bookPath({ ...book, isbn10: "0786838655" })).toBe("/book/0786838655");
    const fallback = bookPath(book);
    expect(fallback.startsWith("/book/id-")).toBe(true);
    expect(parseBookSlug(fallback.slice(6))).toEqual({ kind: "id", value: book.id });
    expect(bookScoutUrl(book, "https://example.org")).toBe(`https://example.org${fallback}`);
  });

  it("resolves both forms through the provider and rejects malformed slugs", async () => {
    const getByISBN = vi.fn(async () => ({ ...book, isbn13: "9780786838653" }));
    const getById = vi.fn(async () => book);
    const provider: BookProvider = { search: vi.fn(), getByISBN, getById, getByTitle: vi.fn() };
    const service = new BookScoutDetailsService(provider);
    expect(await service.getBySlug("9780786838653")).toMatchObject({ title: "A Book" });
    expect(getByISBN).toHaveBeenCalledWith("9780786838653");
    expect(await service.getBySlug(bookPath(book).slice(6))).toEqual(book);
    expect(getById).toHaveBeenCalledWith(book.id);
    expect(await service.getBySlug("id-!invalid")).toBeNull();
    expect(await service.getBySlug("not-a-book")).toBeNull();
  });
});
