import type { Book } from "@/connectors/book-scout/book";
import type { BookProvider } from "@/connectors/book-scout/provider";
import type { Cache } from "@/platform/cache";
import { InvalidInputError, ProviderError, RateLimitError } from "@/platform/errors";
import { normalizeGoogleVolume } from "./normalize";
import { googleVolumesResponseSchema } from "./schemas";

const BASE_URL = "https://www.googleapis.com/books/v1/volumes";
const SEARCH_TTL_SECONDS = 24 * 60 * 60;
const LOOKUP_TTL_SECONDS = 7 * 24 * 60 * 60;

export type GoogleBooksProviderOptions = {
  apiKey: string;
  fetcher?: typeof fetch;
  cache?: Cache;
};

function boundedText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) {
    throw new InvalidInputError(`${label} must contain 1 to 200 characters.`);
  }
  return trimmed;
}

function matchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function quotedSearchTerm(value: string): string {
  return `"${value.replace(/["\\]/g, " ")}"`;
}

export class GoogleBooksProvider implements BookProvider {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly cache?: Cache;

  constructor(options: GoogleBooksProviderOptions) {
    if (!options.apiKey.trim()) throw new Error("GOOGLE_BOOKS_API_KEY is required for live catalog access.");
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
    this.cache = options.cache;
  }

  async search(query: string): Promise<Book[]> {
    const term = boundedText(query, "Search query");
    return this.cached(`search:${term}`, SEARCH_TTL_SECONDS, () => this.queryVolumes(term, 20));
  }

  async getByISBN(isbn: string): Promise<Book | null> {
    const normalized = isbn.replace(/[\s-]/g, "").toUpperCase();
    if (!/^\d{13}$|^\d{9}[\dX]$/.test(normalized)) {
      throw new InvalidInputError("ISBN must contain 10 or 13 valid-format characters.");
    }
    return this.cached(`isbn:${normalized}`, LOOKUP_TTL_SECONDS, async () => {
      const books = await this.queryVolumes(`isbn:${normalized}`, 10);
      return books.find((book) => book.isbn10 === normalized || book.isbn13 === normalized) ?? null;
    });
  }

  async getByTitle(title: string, author?: string): Promise<Book | null> {
    const searchTitle = boundedText(title, "Title");
    const searchAuthor = author === undefined ? undefined : boundedText(author, "Author");
    const query = `intitle:${quotedSearchTerm(searchTitle)}` +
      (searchAuthor ? ` inauthor:${quotedSearchTerm(searchAuthor)}` : "");
    return this.cached(`title:${matchText(searchTitle)}:author:${matchText(searchAuthor ?? "")}`, LOOKUP_TTL_SECONDS, async () => {
      const books = await this.queryVolumes(query, 10);
      return books.find((book) => matchText(book.title) === matchText(searchTitle) &&
        (!searchAuthor || book.authors.some((name) => matchText(name) === matchText(searchAuthor)))) ?? null;
    });
  }

  private async cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    return this.cache ? this.cache.wrap(`google-books:${key}`, ttlSeconds, load) : load();
  }

  private async queryVolumes(query: string, maxResults: number): Promise<Book[]> {
    const url = new URL(BASE_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("printType", "books");
    url.searchParams.set("projection", "full");
    url.searchParams.set("key", this.apiKey);

    let response: Response;
    try {
      response = await this.fetcher(url);
    } catch {
      throw new ProviderError("Google Books is unavailable.");
    }
    if (response.status === 429) throw new RateLimitError("Google Books rate limit exceeded.");
    if (!response.ok) throw new ProviderError("Google Books is unavailable.");

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ProviderError("Google Books returned an invalid response.");
    }
    const parsed = googleVolumesResponseSchema.safeParse(data);
    if (!parsed.success) throw new ProviderError("Google Books returned an invalid response.");
    return (parsed.data.items ?? [])
      .map(normalizeGoogleVolume)
      .filter((book): book is Book => book !== null);
  }
}

export function createGoogleBooksProviderFromEnv(options: Omit<GoogleBooksProviderOptions, "apiKey"> = {}): GoogleBooksProvider {
  return new GoogleBooksProvider({ ...options, apiKey: process.env.GOOGLE_BOOKS_API_KEY ?? "" });
}
