# K4 Connect

K4 Connect is a TypeScript connector factory built with Next.js App Router. Book Beacon is its first registered connector. **Phases 1 through 6 and the Phase 6.5 curated catalog foundation are implemented:** the shared factory, normalized Google Books catalog adapter, deterministic recommendation service, public REST/MCP recommendation routes, canonical book pages, optional commerce link boundary, and a small curated catalog layer.

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
| `platform/` | Connector contract, manifest schema, registry, MCP and REST adapters, cache, errors, logging, generic commerce contract |
| `connectors/book-scout/` | Book domain model, provider contract, candidate pipeline, scoring, diversification, and recommendation service |
| `connectors/index.ts` | Composition root where connectors are registered |
| `providers/google-books/` | Google Books response schema, normalization, and HTTP adapter |
| `providers/amazon/` | Optional Amazon.com search link provider; no book-data or pricing dependency |
| `connectors/book-scout/curation/` | Curated profile schemas, review service, repository contract, file adapter, and approved-topic enrichment |
| `data/books/` | Version-controlled catalog source and generated runtime catalog |
| `app/` | Thin Next.js routes and UI |
| `tests/` | Factory, Google Books adapter, and recommendation pipeline tests |

`invokeTool` is the shared execution path for MCP and REST. It validates inputs, invokes the connector's tool, validates output when declared, and logs safe metadata. Platform code imports no Book Beacon logic. The single Book Beacon import lives in the composition root.

`GoogleBooksProvider` implements the connector-owned `BookProvider` interface. It accepts an injectable `fetcher` and optional generic `Cache`, so provider calls are mockable and cache storage can be swapped later. The normalized `Book` model never exposes Google Books' `volumeInfo` schema. Unknown reading level, content, popularity, and other missing fields remain absent. Google Books is the primary catalog; Open Library enrichment belongs to a later phase.

`BookScoutRecommendationService` starts with approved curated books and their topics, traits, reader fit, and relationships. It calls Google Books when curated results do not fill the requested maximum, then admits fallback books only when language, bibliographic metadata, child-oriented category, and topical evidence pass a quality gate. Missing metadata stays unknown; weak candidates are omitted. Accent- and punctuation-insensitive work identity collapses editions and excludes liked/disliked works. Age bounds, early-reader difficulty for advanced older readers, and language are hard filters. The final list is sorted by the displayed 0–100 match score. No profile is persisted or logged.

The configurable minimum scores in `connectors/book-scout/scoring.ts` are **60 for curated books and 54 for Google Books fallback**. Prior broad-search false positives scored roughly 59–67, so the score alone cannot prove quality; the evidence gates do the decisive filtering. Unknown provider language costs five score points; known mismatched language is excluded. These are ranking scores, not probabilities. `limit` is a maximum: a request for five can return two, one, or zero books when the available evidence is weak. The default request language is `en`; callers can provide a different ISO 639 language code.

## Current endpoints

The canonical connector ID is `book-beacon`. Existing `/api/book-scout` and `/mcp/book-scout` URLs remain aliases for existing clients. The `bookScoutUrl` JSON field and Book Scout catalog provenance IDs also remain stable; their links now use the Book Beacon domain.

- `GET /api/book-beacon` returns the manifest, tool list, health flag, deployment commit, and safe catalog diagnostics (schema version, approved count, checksum). It exposes no API keys.
- `POST /api/book-beacon/recommend` calls the `recommend_books` tool through the generic REST adapter. Each recommendation includes `bookScoutUrl`.
- `/mcp/book-beacon` is the generic MCP Streamable HTTP route. It advertises and calls `recommend_books`.
- `GET /book/[isbn]` displays normalized book metadata. Links use ISBN-13 when available, ISBN-10 next, and an encoded catalog ID for books without either ISBN.

Book pages show a paid Amazon search link only when `AMAZON_ASSOCIATES_TAG` is configured. The link goes directly to Amazon; it is not a redirect through Book Beacon. It searches Amazon Books using the ISBN where possible, or title and author otherwise. It does not assert that a particular Amazon listing or edition matches the Google Books record.

Try REST locally or against the deployed site:

```sh
curl -X POST https://k4connect.vercel.app/api/book-beacon/recommend \
  -H "Content-Type: application/json" \
  -d '{"age":11,"readingAbility":"advanced","interests":["Greek mythology","history","funny books"],"likedBooks":["Percy Jackson","Harry Potter"],"preferences":{"romance":"low"},"limit":5}'
```

The response is `{ "success": true, "data": { "recommendations": [...] } }`. Each result has a `bookScoutUrl` you can open in a browser. MCP clients connect to `https://k4connect.vercel.app/mcp/book-beacon` and call `recommend_books` with the same input object. REST and MCP share the same validated tool and service.

## Google Books configuration

Create a Google Cloud API key for the Books API and put it in `.env.local` as `GOOGLE_BOOKS_API_KEY`. Restrict the key to the Books API and set it as a server environment variable in Vercel before deploying live catalog calls. `BOOK_BEACON_BASE_URL` is optional; it sets the canonical origin in recommendation links and defaults to `https://k4connect.vercel.app`. The provider validates input, requests `https://www.googleapis.com/books/v1/volumes`, and returns normalized books. It uses a 24-hour search TTL and a seven-day lookup TTL when a cache is injected. The current `MemoryCache` is process-local, so entries are not shared across Vercel instances.

## Amazon Associates configuration

Set `AMAZON_ASSOCIATES_TAG` to your **Amazon.com** Associates tracking ID in `.env.local` and in Vercel's server environment variables, then redeploy. If it is unset, book pages omit the commerce link and disclosure. The commerce provider builds tagged Amazon book-search URLs; no Amazon API key, scraping, product data, or pricing is involved. The page labels the link as paid and displays the Associates disclosure. Amazon notes that ISBNs do not reliably equal ASINs, so we do not construct direct product links from ISBNs. [Amazon link guidance](https://affiliate-program.amazon.com/help/node/topic/GP38PJ6EUR6PFBEC), [disclosure guidance](https://affiliate-program.amazon.com/help/node/topic/GPXFHVYZMTGPUMPE).

## Curated catalog foundation

`data/books/catalog.source.json` holds 200 staged seeds, approved profiles, and separate submissions. At the current commit, 74 books are approved by `ai:book-scout-curator`; their classifications remain marked `reviewed: false`. Another 122 edition matches require review and four are unresolved. `npm run catalog:build` validates the source and generates `data/books/catalog.json`; `npm run catalog:check` verifies that artifact. The build runs the check before compiling, so a stale generated catalog cannot deploy. The runtime imports the generated catalog into the Vercel server bundle. See [docs/CURATION.md](docs/CURATION.md) for commands and provenance.

For an external initial dataset, use the [catalog data contract](docs/CATALOG_DATA_CONTRACT.md) and [JSON template](docs/CATALOG_DATA_TEMPLATE.json). `npm run catalog:check-import -- <path>` validates a proposal without modifying files or calling Google. `catalog:stage-import` adds seeds; `catalog:submit-import` creates unapproved editorial submissions after enrichment. An AI curator can approve resolved submissions for production while their AI-assisted classifications remain explicitly **not human-reviewed**; later human review is recorded separately.

## Future recommendation catalog

A browseable catalog of **Book Beacon recommendations** is a separate product feature from the Google Books source catalog and the curated-book foundation above. Start with a small set of curated themes or reading situations, such as mythology for advanced middle-grade readers, and store only the theme definitions and selected stable book IDs. Resolve current metadata from providers and use the existing scoring service where a visitor supplies preferences. This avoids copying a giant book database or storing child profiles. A browse/search UI and any persistence for curated collections can be designed when we build that feature.

## Adding a connector or provider

Create a folder under `connectors/` with a manifest and a `Connector` implementation. Define tools with Zod input schemas and `execute` functions that call connector domain logic. Register the connector once in `connectors/index.ts`; MCP and REST routes discover it by ID.

For a new provider, put HTTP, native response schemas, and normalization in `providers/<provider>/`. Implement the relevant connector-owned provider interface. Keep provider response types out of connector domain logic and inject HTTP for tests. Do not use Amazon for book data.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run catalog:validate
npm run catalog:build
npm run catalog:stats
npm run catalog:check
```

The Google Books tests use mocked HTTP and need no key. To run the optional live catalog check in PowerShell, set `$env:GOOGLE_BOOKS_API_KEY = "your-key"` and `$env:LIVE_GOOGLE_BOOKS = "1"`, then run `npm test`. Without `LIVE_GOOGLE_BOOKS`, no live call is made. See the [Google Books API documentation](https://developers.google.com/books/docs/v1/using) for key setup.

## Vercel

Import this repository as a Next.js project and use the standard npm install/build commands. Set `GOOGLE_BOOKS_API_KEY` as a server environment variable in Vercel, then deploy. The build does not require the key, but live Google Books fallback does. `AMAZON_ASSOCIATES_TAG` is optional. Never commit `.env.local`. After deployment, compare `GET /api/book-beacon` diagnostics with the local approved count and checksum to confirm which catalog is live.
