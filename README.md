# K4 Connect

K4 Connect is a TypeScript connector factory built with Next.js App Router. Book Scout is its first registered connector. **Phases 1 through 5 are implemented:** the shared factory, normalized Google Books catalog adapter, deterministic recommendation service, public REST/MCP recommendation routes, and canonical book pages.

## Local setup

Requires Node.js 20.9 or newer (Node.js 24 recommended).

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Copy `.env.example` to `.env.local` and set `GOOGLE_BOOKS_API_KEY` for live recommendations. The key stays server-side and must never use a `NEXT_PUBLIC_` name.

## Architecture

| Path | Responsibility |
| --- | --- |
| `platform/` | Connector contract, manifest schema, registry, MCP and REST adapters, cache, errors, logging |
| `connectors/book-scout/` | Book domain model, provider contract, candidate pipeline, scoring, diversification, and recommendation service |
| `connectors/index.ts` | Composition root where connectors are registered |
| `providers/google-books/` | Google Books response schema, normalization, and HTTP adapter |
| `app/` | Thin Next.js routes and UI |
| `tests/` | Factory, Google Books adapter, and recommendation pipeline tests |

`invokeTool` is the shared execution path for MCP and REST. It validates inputs, invokes the connector's tool, validates output when declared, and logs safe metadata. Platform code imports no Book Scout logic. The single Book Scout import lives in the composition root.

`GoogleBooksProvider` implements the connector-owned `BookProvider` interface. It accepts an injectable `fetcher` and optional generic `Cache`, so provider calls are mockable and cache storage can be swapped later. The normalized `Book` model never exposes Google Books' `volumeInfo` schema. Unknown reading level, content, popularity, and other missing fields remain absent. Google Books is the primary catalog; Open Library enrichment belongs to a later phase.

`BookScoutRecommendationService` accepts a `BookProvider` and runs profile validation, up to five catalog searches, ISBN/title-author deduplication, reliable hard filters, weighted scoring, and greedy diversification. Search results survive individual query failures; all failed queries return a typed provider error. Missing book signals contribute a neutral value rather than being treated as negative facts. The default weights and Lexile bands live in `connectors/book-scout/scoring.ts` and can be configured. Match scores are 0-100 ranking scores, not probabilities. Reasons are structured codes and messages. No profile is persisted or logged by this service.

## Current endpoints

- `GET /api/book-scout` returns the registered manifest, tool list, and whether the catalog key is configured.
- `POST /api/book-scout/recommend` calls the `recommend_books` tool through the generic REST adapter. Each recommendation includes `bookScoutUrl`.
- `/mcp/book-scout` is the generic MCP Streamable HTTP route. It advertises and calls `recommend_books`.
- `GET /book/[isbn]` displays normalized book metadata. Links use ISBN-13 when available, ISBN-10 next, and an encoded catalog ID for books without either ISBN.

Try REST locally or against the deployed site:

```sh
curl -X POST https://bookscout-iota.vercel.app/api/book-scout/recommend \
  -H "Content-Type: application/json" \
  -d '{"age":11,"readingAbility":"advanced","interests":["Greek mythology","history","funny books"],"likedBooks":["Percy Jackson","Harry Potter"],"preferences":{"romance":"low"},"limit":5}'
```

The response is `{ "success": true, "data": { "recommendations": [...] } }`. Each result has a `bookScoutUrl` you can open in a browser. MCP clients connect to `https://bookscout-iota.vercel.app/mcp/book-scout` and call `recommend_books` with the same input object. REST and MCP share the same validated tool and service.

## Google Books configuration

Create a Google Cloud API key for the Books API and put it in `.env.local` as `GOOGLE_BOOKS_API_KEY`. Restrict the key to the Books API and set it as a server environment variable in Vercel before deploying live catalog calls. `BOOK_SCOUT_BASE_URL` is optional; it sets the canonical origin in recommendation links and defaults to `https://bookscout-iota.vercel.app`. The provider validates input, requests `https://www.googleapis.com/books/v1/volumes`, and returns normalized books. It uses a 24-hour search TTL and a seven-day lookup TTL when a cache is injected. The current `MemoryCache` is process-local, so entries are not shared across Vercel instances.

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

Import this repository as a Next.js project and use the standard npm install/build commands. Set `GOOGLE_BOOKS_API_KEY` as a server environment variable in Vercel, then deploy. The build does not require the key, but live recommendations do. Never commit `.env.local`.
