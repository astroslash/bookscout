import { MemoryCache } from "@/platform/cache";
import { createGoogleBooksProviderFromEnv } from "@/providers/google-books/provider";
import type { BookProvider } from "./provider";

const cache = new MemoryCache();

export function createBookScoutCatalog(): BookProvider {
  return createGoogleBooksProviderFromEnv({ cache });
}
