# K4 Connect

K4 Connect is a TypeScript connector factory built with Next.js App Router. Book Scout is its first registered connector. **This repository currently implements Phase 1 only:** factory infrastructure and a Book Scout registration stub. Book search and recommendations are intentionally not available yet.

## Local setup

Requires Node.js 20.9 or newer (Node.js 24 recommended).

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. No environment variables are required in Phase 1; see `.env.example`.

## Architecture

| Path | Responsibility |
| --- | --- |
| `platform/` | Connector contract, manifest schema, registry, MCP and REST adapters, cache, errors, logging |
| `connectors/` | Domain-owned manifests, tools, and services |
| `connectors/index.ts` | Composition root where connectors are registered |
| `providers/` | Future external data adapters; not created in Phase 1 |
| `app/` | Thin Next.js routes and UI |
| `tests/` | Factory tests |

`invokeTool` is the shared execution path for MCP and REST. It validates inputs, invokes the connector's tool, validates output when declared, and logs safe metadata. Platform code imports no Book Scout logic. The single Book Scout import lives in the composition root.

## Endpoints

- `GET /api/book-scout` returns the registered manifest, tool list, and stub health result.
- `POST /api/[connector]/[tool]` is the generic REST tool route. It returns a structured `NOT_FOUND` response for Book Scout tools until later phases add them. `POST /api/book-scout/recommend` will use this route when `recommend` is registered.
- `/mcp/book-scout` is the generic MCP Streamable HTTP route, backed by the official TypeScript MCP server SDK. It currently exposes no tools. The same route works for any registered connector ID.

## Adding a connector

Create a folder under `connectors/` with a manifest and a `Connector` implementation. Define tools with Zod input schemas and `execute` functions that call the connector's service/domain logic. Register the connector once in `connectors/index.ts`. The existing MCP and REST routes will discover it by ID. No platform or route changes are needed.

## Adding a provider

In a later phase, put provider-specific HTTP, schemas, and normalization in `providers/<provider>/`. Keep provider response types out of connector domain logic. Inject provider interfaces into connector services so calls can be mocked. Configure server-only keys through environment variables; never use `NEXT_PUBLIC_` for secrets.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

## Vercel

Import the repository as a Next.js project. Use the standard npm install/build commands. Phase 1 needs no environment variables. The process-local `MemoryCache` is intentionally only a basic abstraction: it is not shared across Vercel instances and may be lost between requests. A later phase can swap in a deployment-appropriate cache without changing connector services.
