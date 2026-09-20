# K4 Connect

K4 Connect is a TypeScript connector factory built with Next.js App Router. Book Scout is its first registered connector. **Phases 1 and 2 are implemented:** the shared factory foundation and a normalized book catalog adapter for Google Books. Recommendations, Book Scout tools, and book pages are later phases.

## Local setup

Requires Node.js 20.9 or newer (Node.js 24 recommended).

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Copy `.env.example` to `.env.local` and set `GOOGLE_BOOKS_API_KEY` when you want live Google Books requests. Phase 2 does not expose public book search; the provider is available for the next recommendation phase and can be tested with an injected fetch function. The key stays server-side and must never use a `NEXT_PUBLIC_` name.

## Architecture

| Path | Responsibility |
| --- | --- |
| `platform/` | Connector contract, manifest schema, registry, MCP and REST adapters, cache, errors, logging |
| `connectors/book-scout/` | Book domain model and mockable book-provider contract |
| `connectors/index.ts` | Composition root where connectors are registered |
| `providers/google-books/` | Google Books response schema, normalization, and HTTP adapter |
| `app/` | Thin Next.js routes and UI |
| `tests/` | Factory and Google Books adapter tests |

`invokeTool` is the shared execution path for MCP and REST. It validates inputs, invokes the connector's tool, validates output when declared, and logs safe metadata. Platform code imports no Book Scout logic. The single Book Scout import lives in the composition root.

`GoogleBooksProvider` implements the connector-owned `BookProvider` interface. It accepts an injectable `fetcher` and optional generic `Cache`, so provider calls are mockable and cache storage can be swapped later. The normalized `Book` model never exposes Google Books' `volumeInfo` schema. Unknown reading level, content, popularity, and other missing fields remain absent. Google Books is the primary catalog; Open Library enrichment belongs to a later phase.

## Current endpoints

- `GET /api/book-scout` returns the registered manifest, tool list, and stub health result.
- `POST /api/[connector]/[tool]` is the generic REST tool route. It returns `NOT_FOUND` for Book Scout tools until later phases add them. `POST /api/book-scout/recommend` will use this route when `recommend` is registered.
- `/mcp/book-scout` is the generic MCP Streamable HTTP route. It currently exposes no tools.

## Google Books configuration

Create a Google Cloud API key for the Books API and put it in `.env.local` as `GOOGLE_BOOKS_API_KEY`. Restrict the key to the Books API and set it as a server environment variable in Vercel before deploying live catalog calls. The provider validates input, requests `https://www.googleapis.com/books/v1/volumes`, and returns normalized books. It uses a 24-hour search TTL and a seven-day lookup TTL when a cache is injected. The current `MemoryCache` is process-local, so entries are not shared across Vercel instances.

## Adding a connector or provider

Create a folder under `connectors/` with a manifest and a `Connector` implementation. Define tools with Zod input schemas and `execute` functions that call connector domain logic. Register the connector once in `connectors/index.ts`; MCP and REST routes discover it by ID.

For a new provider, put HTTP, native response schemas, and normalization in `providers/<provider>/`. Implement the relevant connector-owned provider interface. Keep provider response types out of connector domain logic and inject HTTP for tests. Do not use Amazon for book data.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The Google Books tests use mocked HTTP and need no key. To run the optional live catalog check in PowerShell, set `$env:GOOGLE_BOOKS_API_KEY = "your-key"` and `$env:LIVE_GOOGLE_BOOKS = "1"`, then run `npm test`. Without `LIVE_GOOGLE_BOOKS`, no live call is made. See the [Google Books API documentation](https://developers.google.com/books/docs/v1/using) for key setup.

## Vercel

Import this repository as a Next.js project and use the standard npm install/build commands. The current app builds without a Google Books key because the provider is not invoked by a route yet. Set `GOOGLE_BOOKS_API_KEY` as a server environment variable when live catalog tools are added. Never commit `.env.local`.
