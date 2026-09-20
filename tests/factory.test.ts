import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ConnectorRegistry } from "../platform/registry";
import { invokeTool, type Connector } from "../platform/connector";
import { MemoryCache } from "../platform/cache";
import { handleRestTool } from "../platform/rest";
import { bookScoutConnector } from "../connectors/book-scout";

function exampleConnector(id = "example"): Connector {
  return {
    manifest: {
      id,
      name: "Example",
      version: "1.0.0",
      description: "An unrelated connector for testing the factory.",
      examples: [],
      monetization: "none",
    },
    tools: [{
      name: "echo",
      description: "Echo a short message.",
      inputSchema: z.object({ message: z.string().min(1).max(50) }).strict(),
      outputSchema: z.object({ echoed: z.string() }),
      async execute(input) {
        return { echoed: (input as { message: string }).message };
      },
    }],
    async healthCheck() { return true; },
  };
}

describe("connector factory", () => {
  it("registers Book Beacon and an unrelated second connector", () => {
    const registry = new ConnectorRegistry();
    registry.register(bookScoutConnector);
    registry.registerAlias("book-scout", "book-beacon");
    registry.register(exampleConnector());
    expect(registry.list().map((item) => item.manifest.id)).toEqual(["book-beacon", "example"]);
    expect(registry.get("book-scout")).toBe(registry.get("book-beacon"));
    expect(registry.get("example").tools[0].name).toBe("echo");
  });

  it("rejects alias collisions and unknown alias targets", () => {
    const registry = new ConnectorRegistry();
    registry.register(exampleConnector());
    expect(() => registry.registerAlias("example", "example")).toThrow(/already registered/);
    expect(() => registry.registerAlias("legacy", "missing")).toThrow();
    registry.registerAlias("legacy", "example");
    expect(() => registry.registerAlias("legacy", "example")).toThrow(/already registered/);
    expect(() => registry.register(exampleConnector("legacy"))).toThrow(/already registered/);
  });

  it("rejects duplicate connector IDs and invalid manifests", () => {
    const registry = new ConnectorRegistry();
    registry.register(exampleConnector());
    expect(() => registry.register(exampleConnector())).toThrow(/already registered/);
    expect(() => registry.register(exampleConnector("Invalid ID"))).toThrow();
  });

  it("validates inputs and records safe invocation metadata", async () => {
    const connector = exampleConnector();
    const log = vi.fn();
    await expect(invokeTool(connector, "echo", { message: "hi" }, { logger: { log } }))
      .resolves.toEqual({ echoed: "hi" });
    await expect(invokeTool(connector, "echo", { message: "" }, { logger: { log } }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toMatchObject({ connector: "example", tool: "echo", success: true });
    expect(JSON.stringify(log.mock.calls)).not.toContain("hi");
  });

  it("routes REST requests through the shared tool service", async () => {
    const registry = new ConnectorRegistry();
    registry.register(exampleConnector());
    const request = new Request("http://localhost/api/example/echo", {
      method: "POST",
      body: JSON.stringify({ message: "hello" }),
    });
    const response = await handleRestTool(request, registry, "example", "echo");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { echoed: "hello" } });
  });

  it("returns structured errors for malformed requests", async () => {
    const registry = new ConnectorRegistry();
    registry.register(exampleConnector());
    const request = new Request("http://localhost/api/example/echo", {
      method: "POST",
      body: "{broken",
    });
    const response = await handleRestTool(request, registry, "example", "echo");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "INVALID_INPUT", retryable: false },
    });
  });
});

describe("memory cache", () => {
  it("expires entries and loads again", async () => {
    let now = 0;
    const cache = new MemoryCache(() => now);
    const load = vi.fn().mockResolvedValue("value");
    expect(await cache.wrap("key", 1, load)).toBe("value");
    expect(await cache.wrap("key", 1, load)).toBe("value");
    expect(load).toHaveBeenCalledTimes(1);
    now = 1001;
    await cache.wrap("key", 1, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
