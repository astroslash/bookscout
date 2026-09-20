import type { Book } from "./book";

// A catalog adapter returns normalized books, never a provider's native schema.
export interface BookProvider {
  search(query: string): Promise<Book[]>;
  getByISBN(isbn: string): Promise<Book | null>;
  getByTitle(title: string, author?: string): Promise<Book | null>;
}
