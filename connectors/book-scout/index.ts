import type { Connector } from "@/platform/connector";
import { bookScoutManifest } from "./manifest";
import { createBookScoutCatalog } from "./catalog";
import { BookScoutDetailsService } from "./details";
import type { BookProvider } from "./provider";
import { BookScoutRecommendationService } from "./service";
import { createBookScoutTools } from "./tools";
import { FileCuratedCatalogRepository } from "./curation/file-repository";
import type { CuratedCatalogRepository } from "./curation/repository";
import { createHash } from "node:crypto";
import runtimeCatalog from "@/data/books/catalog.json";

export function createBookScoutConnector(curatedRepository: CuratedCatalogRepository = new FileCuratedCatalogRepository()): Connector {
  const getService = () => new BookScoutRecommendationService(
    undefined,
    curatedRepository,
  );
  return {
    manifest: bookScoutManifest,
    tools: createBookScoutTools(getService),
    async healthCheck() {
      return (await curatedRepository.listApproved()).length > 0;
    },
    async diagnostics() {
      const approved = await curatedRepository.listApproved();
      return {
        catalogSchemaVersion: runtimeCatalog.schemaVersion,
        approvedCuratedBooks: approved.length,
        catalogChecksum: createHash("sha256").update(JSON.stringify(approved)).digest("hex").slice(0, 16),
        recommendationMode: "CURATED_ONLY",
      };
    },
  };
}

export const bookScoutConnector = createBookScoutConnector();

export function createBookScoutDetailsService(provider?: BookProvider): BookScoutDetailsService {
  return new BookScoutDetailsService(provider ?? createBookScoutCatalog());
}
