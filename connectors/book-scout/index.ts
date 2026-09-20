import type { Connector } from "@/platform/connector";
import { bookScoutManifest } from "./manifest";
import { createBookScoutCatalog } from "./catalog";
import { BookScoutDetailsService } from "./details";
import type { BookProvider } from "./provider";
import { BookScoutRecommendationService } from "./service";
import { createBookScoutTools } from "./tools";

export function createBookScoutConnector(provider?: BookProvider): Connector {
  const getService = () => new BookScoutRecommendationService(
    provider ?? createBookScoutCatalog(),
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

export function createBookScoutDetailsService(provider?: BookProvider): BookScoutDetailsService {
  return new BookScoutDetailsService(provider ?? createBookScoutCatalog());
}
