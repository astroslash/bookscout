import type { Connector } from "@/platform/connector";
import { bookScoutManifest } from "./manifest";

// Phase 1 registers the connector. Domain tools and providers arrive in later phases.
export const bookScoutConnector: Connector = {
  manifest: bookScoutManifest,
  tools: [],
  async healthCheck() {
    return true;
  },
};
