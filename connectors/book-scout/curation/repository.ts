import type { CuratedBookProfile } from "./schemas";

export interface CuratedCatalogRepository {
  getById(id: string): Promise<CuratedBookProfile | null>;
  getByIsbn(isbn: string): Promise<CuratedBookProfile | null>;
  findByTitleAuthor(title: string, author?: string): Promise<CuratedBookProfile | null>;
  listApproved(): Promise<CuratedBookProfile[]>;
}

export function catalogWords(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
