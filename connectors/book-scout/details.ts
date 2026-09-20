import type { Book } from "./book";
import { parseBookSlug } from "./links";
import type { BookProvider } from "./provider";

export class BookScoutDetailsService {
  constructor(private readonly provider: BookProvider) {}

  async getBySlug(slug: string): Promise<Book | null> {
    const locator = parseBookSlug(slug);
    if (!locator) return null;
    return locator.kind === "isbn"
      ? this.provider.getByISBN(locator.value)
      : this.provider.getById(locator.value);
  }
}
