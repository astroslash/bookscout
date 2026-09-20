import type { Connector } from "@/platform/connector";
import { MemoryCache } from "@/platform/cache";
import { createGoogleBooksProviderFromEnv } from "@/providers/google-books/provider";
import { bookScoutManifest } from "./manifest";
import type { BookProvider } from "./provider";
import { BookScoutRecommendationService } from "./service";
import { createBookScoutTools } from "./tools";

const cache = new MemoryCache();

export function createBookScoutConnector(provider?: BookProvider): Connector {
  const getService = () => new BookScoutRecommendationService(
    provider ?? createGoogleBooksProviderFromEnv({ cache }),
  );
  return {
    manifest: bookScoutManifest,
    tools: createBookScoutTools(getService),
    async healthCheck() {
      return provider !== undefined || Boolean(process.env.GOOGLE_BOOKS_API_KEY?.trim());
    },
  };
}

export const bookScoutConnector = createBookScoutConnector();
