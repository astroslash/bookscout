import type { CommerceProvider, Product } from "@/platform/commerce";
import { createAmazonCommerceProviderFromEnv } from "@/providers/amazon/commerce";
import type { Book } from "./book";

export function bookProduct(book: Book): Product {
  return {
    id: book.id,
    title: book.title,
    searchQuery: book.isbn13 ?? book.isbn10 ?? [book.title, ...book.authors].join(" "),
  };
}

export async function getBookCommerceLink(
  book: Book,
  provider: CommerceProvider | null = createAmazonCommerceProviderFromEnv(),
): Promise<string | null> {
  return provider ? provider.createLink(bookProduct(book)) : null;
}
