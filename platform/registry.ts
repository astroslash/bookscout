import type { Connector } from "./connector";
import { NotFoundError } from "./errors";
import { connectorManifestSchema } from "./manifest";

export class ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();

  register(connector: Connector): void {
    const manifest = connectorManifestSchema.parse(connector.manifest);
    if (this.connectors.has(manifest.id)) {
      throw new Error(`Connector already registered: ${manifest.id}`);
    }
    const names = connector.tools.map((tool) => tool.name);
    if (new Set(names).size !== names.length) {
      throw new Error(`Duplicate tool name in connector: ${manifest.id}`);
    }
    this.connectors.set(manifest.id, connector);
  }

  get(id: string): Connector {
    const connector = this.connectors.get(id);
    if (!connector) throw new NotFoundError("Connector not found.");
    return connector;
  }

  list(): Connector[] {
    return [...this.connectors.values()];
  }
}
