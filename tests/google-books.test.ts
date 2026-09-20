import { describe, expect, it, vi } from "vitest";
import { bookSchema } from "../connectors/book-scout/book";
import { MemoryCache } from "../platform/cache";
import { normalizeGoogleVolume } from "../providers/google-books/normalize";
import { GoogleBooksProvider } from "../providers/google-books/provider";

const completeVolume = {
  id: "abc123",
  volumeInfo: {
    title: "The Lightning Thief",
    subtitle: "Percy Jackson and the Olympians",
    authors: [" Rick Riordan ", "Rick Riordan"],
    industryIdentifiers: [
      { type: "ISBN_10", identifier: "0786838655" },
      { type: "ISBN_13", identifier: "978-0-7868-3865-3" },
    ],
    description: "<p>A <b>kid</b> &amp; his friends.</p>",
    categories: ["Juvenile Fiction", "Mythology"],
    publishedDate: "2005-07-01",
    pageCount: 377,
    language: "EN",
    imageLinks: { thumbnail: "http://books.google.com/books/content?id=abc123" },
  },
};

function volumeResponse(items: unknown[] = [completeVolume]): Response {
  return Response.json({ kind: "books#volumes", totalItems: items.length, items });
}

function providerWith(response: Response | Promise<Response>) {
  const fetcher = vi.fn().mockResolvedValue(response);
  const provider = new GoogleBooksProvider({ apiKey: "test-key", fetcher: fetcher as unknown as typeof fetch });
  return { provider, fetcher };
}

describe("Google Books normalization", () => {
  it("maps public metadata to our Book model and removes provider HTML", () => {
    const book = normalizeGoogleVolume(completeVolume);
    expect(book).toMatchObject({
      id: "google-books:abc123",
      title: "The Lightning Thief",
      authors: ["Rick Riordan"],
      isbn10: "0786838655",
      isbn13: "9780786838653",
      description: "A kid & his friends.",
      subjects: ["Juvenile Fiction", "Mythology"],
      publicationYear: 2005,
      pageCount: 377,
      language: "en",
      coverUrl: "https://books.google.com/books/content?id=abc123",
    });
    expect(bookSchema.safeParse(book).success).toBe(true);
    expect(book).not.toHaveProperty("volumeInfo");
    expect(book).not.toHaveProperty("readingLevel");
    expect(book).not.toHaveProperty("content");
    expect(book).not.toHaveProperty("popularity");
  });

  it("keeps missing or unreliable metadata unknown", () => {
    const book = normalizeGoogleVolume({ id: "sparse", volumeInfo: {
      title: "Sparse", publishedDate: "unknown", pageCount: 0,
      industryIdentifiers: [{ type: "ISBN_13", identifier: "bad" }],
      imageLinks: { thumbnail: "javascript:alert(1)" },
    } });
    expect(book).toEqual({ id: "google-books:sparse", title: "Sparse", authors: [], subjects: [] });
    expect(normalizeGoogleVolume({ id: "untitled", volumeInfo: {} })).toBeNull();
    expect(normalizeGoogleVolume({ id: "broken", volumeInfo: { title: 42 } })).toBeNull();
  });
});

describe("GoogleBooksProvider", () => {
  it("searches with a fixed Google URL and returns normalized results", async () => {
    const { provider, fetcher } = providerWith(volumeResponse());
    const books = await provider.search(" Greek mythology ");
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe("The Lightning Thief");
    const url = new URL(fetcher.mock.calls[0][0] as URL);
    expect(url.origin).toBe("https://www.googleapis.com");
    expect(url.pathname).toBe("/books/v1/volumes");
    expect(url.searchParams.get("q")).toBe("Greek mythology");
    expect(url.searchParams.get("maxResults")).toBe("20");
    expect(url.searchParams.get("printType")).toBe("books");
    expect(url.searchParams.get("key")).toBe("test-key");
  });

  it("returns no books for an empty catalog result and skips malformed items", async () => {
    expect(await providerWith(volumeResponse([])).provider.search("rare query")).toEqual([]);
    const { provider } = providerWith(volumeResponse([{ id: "broken" }, completeVolume]));
    expect((await provider.search("mythology")).map((book) => book.title)).toEqual(["The Lightning Thief"]);
  });

  it("matches ISBN and title conservatively", async () => {
    const unrelated = { ...completeVolume, id: "other", volumeInfo: {
      ...completeVolume.volumeInfo,
      title: "Other Book",
      industryIdentifiers: [{ type: "ISBN_13", identifier: "9780000000000" }],
    } };
    const fetcher = vi.fn().mockImplementation(async () => volumeResponse([unrelated, completeVolume]));
    const provider = new GoogleBooksProvider({ apiKey: "test-key", fetcher: fetcher as unknown as typeof fetch });
    expect((await provider.getByISBN("978-0-7868-3865-3"))?.id).toBe("google-books:abc123");
    expect(new URL(fetcher.mock.calls[0][0] as URL).searchParams.get("q")).toBe("isbn:9780786838653");
    expect((await provider.getByTitle("The Lightning Thief", "Rick Riordan"))?.id).toBe("google-books:abc123");
    expect(await provider.getByTitle("A Different Book")).toBeNull();
  });

  it("fetches a volume by its normalized ID and handles missing volumes", async () => {
    const { provider, fetcher } = providerWith(Response.json(completeVolume));
    expect((await provider.getById("google-books:abc123"))?.title).toBe("The Lightning Thief");
    expect(new URL(fetcher.mock.calls[0][0] as URL).pathname).toBe("/books/v1/volumes/abc123");
    expect(await providerWith(new Response("", { status: 404 })).provider.getById("google-books:missing")).toBeNull();
  });

  it("validates inputs before calling Google", async () => {
    const { provider, fetcher } = providerWith(volumeResponse());
    await expect(provider.search("  ")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(provider.getByISBN("123")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(provider.getByTitle(" ")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(provider.getById("other:abc123")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps HTTP, network, and malformed response failures to typed errors", async () => {
    await expect(providerWith(new Response("", { status: 503 })).provider.search("books"))
      .rejects.toMatchObject({ code: "PROVIDER_ERROR", retryable: true });
    await expect(providerWith(new Response("", { status: 429 })).provider.search("books"))
      .rejects.toMatchObject({ code: "RATE_LIMITED", retryable: true });
    await expect(providerWith(Response.json({ error: { message: "private provider detail" } })).provider.search("books"))
      .rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    const fetcher = vi.fn().mockRejectedValue(new Error("secret network detail"));
    const provider = new GoogleBooksProvider({ apiKey: "test-key", fetcher: fetcher as unknown as typeof fetch });
    await expect(provider.search("books")).rejects.toThrow("Google Books is unavailable.");
  });

  it("uses the generic cache when supplied", async () => {
    const fetcher = vi.fn().mockResolvedValue(volumeResponse());
    const provider = new GoogleBooksProvider({ apiKey: "test-key", fetcher: fetcher as unknown as typeof fetch, cache: new MemoryCache() });
    await provider.search("mythology");
    await provider.search("mythology");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});




// Opt in with LIVE_GOOGLE_BOOKS=1 and GOOGLE_BOOKS_API_KEY set in the shell.
// This is intentionally excluded from the normal offline test run.
it.skipIf(process.env.LIVE_GOOGLE_BOOKS !== "1")("searches the live Google Books catalog", async () => {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) throw new Error("Set GOOGLE_BOOKS_API_KEY before running the live catalog check.");
  const books = await new GoogleBooksProvider({ apiKey }).search("Percy Jackson");
  expect(books.some((book) => /percy jackson/i.test(book.title))).toBe(true);
});
