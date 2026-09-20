import { ConnectorRegistry } from "@/platform/registry";
import { bookScoutConnector } from "./book-scout";

export const registry = new ConnectorRegistry();
registry.register(bookScoutConnector);
