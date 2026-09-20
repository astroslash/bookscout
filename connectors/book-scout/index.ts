import type { Connector } from "@/platform/connector";
import { bookScoutManifest } from "./manifest";

// The catalog provider exists, but recommendation tools are registered in a later phase.
export const bookScoutConnector: Connector = {
  manifest: bookScoutManifest,
  tools: [],
  async healthCheck() {
    return true;
  },
};
