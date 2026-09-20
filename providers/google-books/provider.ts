import type { Book } from "@/connectors/book-scout/book";
import type { BookProvider } from "@/connectors/book-scout/provider";
import type { Cache } from "@/platform/cache";
import { InvalidInputError, ProviderError, RateLimitError } from "@/platform/errors";
import { normalizeGoogleVolume } from "./normalize";
import { googleVolumeSchema, googleVolumesResponseSchema } from "./schemas";

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

  async getById(id: string): Promise<Book | null> {
    const volumeId = id.startsWith("google-books:") ? id.slice("google-books:".length) : "";
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(volumeId)) {
      throw new InvalidInputError("Book ID is invalid.");
    }
    return this.cached(`id:${volumeId}`, LOOKUP_TTL_SECONDS, async () => {
      const url = new URL(`${BASE_URL}/${encodeURIComponent(volumeId)}`);
      url.searchParams.set("key", this.apiKey);
      const response = await this.fetchResponse(url);
      if (response.status === 404) return null;
      if (!response.ok) throw new ProviderError("Google Books is unavailable.");
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new ProviderError("Google Books returned an invalid response.");
      }
      const parsed = googleVolumeSchema.safeParse(data);
      if (!parsed.success || parsed.data.id !== volumeId) {
        throw new ProviderError("Google Books returned an invalid response.");
      }
      return normalizeGoogleVolume(parsed.data);
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

    const response = await this.fetchResponse(url);
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

  private async fetchResponse(url: URL): Promise<Response> {
    try {
      const response = await this.fetcher(url);
      if (response.status === 429) throw new RateLimitError("Google Books rate limit exceeded.");
      return response;
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      throw new ProviderError("Google Books is unavailable.");
    }
  }
}

export function createGoogleBooksProviderFromEnv(options: Omit<GoogleBooksProviderOptions, "apiKey"> = {}): GoogleBooksProvider {
  return new GoogleBooksProvider({ ...options, apiKey: process.env.GOOGLE_BOOKS_API_KEY ?? "" });
}
