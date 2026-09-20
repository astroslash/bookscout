import type { Connector } from "./connector";
import { NotFoundError } from "./errors";
import { connectorManifestSchema } from "./manifest";

export class ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();
  private readonly aliases = new Map<string, string>();

  register(connector: Connector): void {
    const manifest = connectorManifestSchema.parse(connector.manifest);
    if (this.connectors.has(manifest.id) || this.aliases.has(manifest.id)) {
      throw new Error(`Connector already registered: ${manifest.id}`);
    }
    const names = connector.tools.map((tool) => tool.name);
    if (new Set(names).size !== names.length) {
      throw new Error(`Duplicate tool name in connector: ${manifest.id}`);
    }
    this.connectors.set(manifest.id, connector);
  }

  registerAlias(alias: string, connectorId: string): void {
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(alias)) throw new Error(`Invalid connector alias: ${alias}`);
    if (this.connectors.has(alias) || this.aliases.has(alias)) throw new Error(`Connector already registered: ${alias}`);
    if (!this.connectors.has(connectorId)) throw new NotFoundError("Connector not found.");
    this.aliases.set(alias, connectorId);
  }

  get(id: string): Connector {
    const connector = this.connectors.get(this.aliases.get(id) ?? id);
    if (!connector) throw new NotFoundError("Connector not found.");
    return connector;
  }

  list(): Connector[] {
    return [...this.connectors.values()];
  }
}
