import runtimeCatalog from "@/data/books/catalog.json";
import { catalogWords, type CuratedCatalogRepository } from "./repository";
import { runtimeCatalogSchema, type CuratedBookProfile } from "./schemas";

// Static JSON import keeps the generated catalog in the Vercel server bundle.
export class FileCuratedCatalogRepository implements CuratedCatalogRepository {
  private readonly approved: CuratedBookProfile[];

  constructor(data: unknown = runtimeCatalog) {
    this.approved = runtimeCatalogSchema.parse(data).books;
  }

  async getById(id: string): Promise<CuratedBookProfile | null> {
    return this.copy(this.approved.find((item) => item.id === id));
  }

  async getByIsbn(isbn: string): Promise<CuratedBookProfile | null> {
    const value = isbn.replace(/[\s-]/g, "").toUpperCase();
    return this.copy(this.approved.find((item) => item.book.isbn13 === value || item.book.isbn10 === value));
  }

  async findByTitleAuthor(title: string, author?: string): Promise<CuratedBookProfile | null> {
    const normalizedTitle = catalogWords(title);
    const normalizedAuthor = author ? catalogWords(author) : undefined;
    return this.copy(this.approved.find((item) => catalogWords(item.book.title) === normalizedTitle &&
      (!normalizedAuthor || item.book.authors.some((name) => catalogWords(name) === normalizedAuthor))));
  }

  async listApproved(): Promise<CuratedBookProfile[]> {
    return structuredClone(this.approved);
  }

  private copy(item: CuratedBookProfile | undefined): CuratedBookProfile | null {
    return item ? structuredClone(item) : null;
  }
}
