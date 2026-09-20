import { describe, expect, it, vi } from "vitest";
import { ConnectorRegistry } from "../platform/registry";
import { handleRestTool } from "../platform/rest";
import { invokeTool } from "../platform/connector";
import { createConnectorMcpHandler } from "../platform/mcp";
import { createBookScoutConnector } from "../connectors/book-scout";
import type { BookProvider } from "../connectors/book-scout/provider";
import { FileCuratedCatalogRepository } from "../connectors/book-scout/curation/file-repository";
import { GET as connectorStatus } from "../app/api/[connector]/route";

const input = { interests: ["mythology"], limit: 1 };

function setup() {
  const search = vi.fn(async () => [{
    id: "book-1",
    title: "Greek Myths",
    authors: ["Example Author"],
    subjects: ["Mythology"],
  }]);
  const provider: BookProvider = { search, getByISBN: vi.fn(), getById: vi.fn(), getByTitle: vi.fn() };
  const connector = createBookScoutConnector(provider,
    new FileCuratedCatalogRepository({ schemaVersion: 1, books: [] }));
  const registry = new ConnectorRegistry();
  registry.register(connector);
  registry.registerAlias("book-scout", connector.manifest.id);
  return { connector, registry, search };
}

describe("Book Beacon tool routes", () => {
  it("exposes safe catalog deployment diagnostics", async () => {
    const response = await connectorStatus(new Request("http://localhost/api/book-beacon"),
      { params: Promise.resolve({ connector: "book-beacon" }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.manifest).toMatchObject({ id: "book-beacon", name: "Book Beacon" });
    expect(body.data.diagnostics).toMatchObject({ catalogSchemaVersion: 1, approvedCuratedBooks: expect.any(Number),
      catalogChecksum: expect.stringMatching(/^[a-f0-9]{16}$/) });
    expect(body.data).not.toHaveProperty("GOOGLE_BOOKS_API_KEY");
  });

  it("uses the same recommendation service for MCP's tool name and the REST path", async () => {
    const { connector, registry, search } = setup();
    const mcpResult = await invokeTool(connector, "recommend_books", input, { logger: { log() {} } });
    const response = await handleRestTool(new Request("http://localhost/api/book-beacon/recommend", {
      method: "POST",
      body: JSON.stringify(input),
    }), registry, "book-beacon", "recommend");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: mcpResult });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed recommendation requests before accessing the catalog", async () => {
    const { registry, search } = setup();
    const response = await handleRestTool(new Request("http://localhost/api/book-scout/recommend", {
      method: "POST",
      body: JSON.stringify({ interests: [], childName: "Sam" }),
    }), registry, "book-scout", "recommend");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "INVALID_INPUT" } });
    expect(search).not.toHaveBeenCalled();
  });

  it("advertises recommend_books over MCP", async () => {
    const { connector, search } = setup();
    const handler = createConnectorMcpHandler(connector);
    const response = await handler.fetch(new Request("http://localhost/mcp/book-scout", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("recommend_books");
    const call = await handler.fetch(new Request("http://localhost/mcp/book-scout", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "recommend_books", arguments: input } }),
    }));
    expect(call.status).toBe(200);
    expect(await call.text()).toContain("recommendations");
    expect(search).toHaveBeenCalledOnce();
  });
});
