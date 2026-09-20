# K4 Connect — North Star

> K4 Connect exists to turn useful data into useful conversations. Every connector should solve one narrow problem exceptionally well. The platform owns infrastructure. The connector owns domain intelligence. The AI owns conversation. External providers own raw data. Book Scout is Connector #1. Its job is to help a parent answer: “What book will my kid actually want to read next?” Ship the smallest system that answers that question exceptionally well, then use the same factory to ship the next connector.

This document records the supplied North Star and build specification. The current implementation covers **Phases 1 through 6 and the Phase 6.5 curated catalog foundation**. Later-phase requirements below remain design targets, not claims of implemented behavior.

## Product and ownership

K4 Connect is a connector factory, not a one-off Book Scout app. Future independent connectors may include Launch Scout, Chess Doctor, Contract Scout, Fishing Scout, College Scout, SEC Scout, and Park Scout. Connector #2 should inherit the factory infrastructure without copying Book Scout infrastructure or adding book concepts to the platform.

The platform owns MCP and REST infrastructure, registration, caching, logging, analytics, error handling, rate limiting, health checks, provider abstractions, and monetization abstractions. Each connector owns tools, schemas, business logic, ranking, and provider orchestration. External AI platforms own conversation and presentation. Providers own raw data.

Book Scout is a free recommendation service for parents of children and teens. Given age or grade, reading ability, interests, liked and disliked books, and preferences, it should return roughly five useful recommendations. Backend logic must rank books; an LLM must not do that ranking. Do not introduce a backend LLM dependency. Amazon Associates may eventually monetize commerce links, but Amazon must never be used as the book database or scraped.

## Technology and repository boundaries

Use TypeScript, the current stable Next.js with App Router on the Node.js runtime, Vercel, Zod, MCP-compatible and useful REST endpoints, and lightweight TypeScript tests. Prefer simple dependencies and no database unless compelling. Keep `platform/`, `connectors/`, and `providers/` separate. Domain logic must not live in route handlers, and provider schemas must not leak into domain code.

Each connector has a manifest with stable ID, name, semantic version, description, examples, monetization declaration, and room for metadata. A reusable connector contract exposes tools and a health check. The registry discovers connectors without scattered connector-specific switch statements. Over time, manifests can drive MCP registration, documentation, health, analytics, pages, limits, and monetization; avoid premature automation.

## Book Scout domain target (later phases)

Create a normalized `Book` model independent of providers. It should support ID, title, optional subtitle, authors, optional ISBN-10/ISBN-13, description, subjects, publication year, page count, language, cover URL, popularity, and optional reading level, content, and attribute signals. Unknown values remain unknown. Never invent age, Lexile, content, rating, or other missing metadata.

Define a mockable `BookProvider` interface with search, ISBN lookup, and title/author lookup. Google Books is the **primary live catalog** for title, author, ISBN, description, categories, date, pages, language, cover, and other public metadata. Open Library is **supplemental enrichment**; recommendations must still work when it fails. Provider-specific code belongs under `providers/`, with normalized responses passed to Book Scout. Do not scrape Amazon or use it as a metadata provider.

The first complete tool is `recommend_books`. Input may include age, grade, reading ability, interests, liked and disliked books, humor/romance/scary preferences, and limit. Fields need sensible validation and bounds. Do not require or collect a child's name, birthday, email, school, address, phone, or precise location. Do not persist child profiles. Output is structured recommendations with normalized book, `matchScore` on a 0–100 **Book Scout Match** scale, reasons, and canonical Book Scout URL. The score is not a probability. Do not fabricate quotes or reviews.

The deterministic recommendation pipeline is: profile → candidate generation → normalization → hard filters → scoring → diversification → top N. Query based on interests, liked books, categories, and age context without excessive provider calls. Deduplicate by ISBN when available, then normalized title/author. Initial configurable scoring weights: liked-book similarity 25%, interest 25%, age 15%, reading ability 15%, popularity/quality 10%, preferences 5%, novelty/diversity 5%. Missing data is not negative evidence. Reasons should identify strong score contributors. Diversify results so one series does not dominate unless requested.

Design for four MCP tools: `recommend_books` first, then `more_like_this`, `book_details`, and `get_book_link`. REST and MCP must invoke the same Book Scout service. The target MCP route is `/mcp/book-scout`; the recommendation REST route is `POST /api/book-scout/recommend` once the service exists.

## Platform behavior target

The generic cache interface supports `get`, `set`, and `wrap`, without coupling connectors to Redis. Approximate future TTLs: book metadata and provider lookup seven days, search 24 hours, Open Library enrichment seven days, recommendations briefly or uncached. Typed errors include provider, rate limit, not found, invalid input, and timeout. Public errors are structured and do not reveal stack traces or provider internals.

Structured connector invocation logs should support request ID, connector, tool, provider-call count, duration, cache hit/miss, and success/failure, while avoiding profile data and secrets. A lightweight analytics interface should eventually support connector/tool/timestamp/latency/success and events such as recommendation generation, book page views, and affiliate clicks. No heavy analytics service is needed initially.

Commerce is a platform abstraction. Later, an Amazon implementation may create affiliate links but may not supply book recommendations, scrape Amazon, or show prices without an officially permitted API. Canonical book pages should use `/book/[isbn]` with ISBN-13 when available and handle missing ISBN gracefully. A later book page may show normalized metadata, recommendation reasons, reading information, themes, similar books, an Amazon purchase link, and disclosure. Do not create a disguised affiliate redirect service.

Provider keys belong in server environment variables. Validate configuration where appropriate, limit inputs, and never blindly proxy arbitrary URLs. Handle external failures gracefully. No child profiles should persist, and logs must omit unnecessary profile details.

## Implementation phases

1. **Factory foundation:** Next.js/TypeScript, connector contract, registry, manifest, errors, logging, basic cache, MCP and REST routing. Compile and test.
2. **Book domain:** normalized model, provider contract, Google Books implementation and normalization, provider mocks and tests. Confirm search works.
3. **Recommendation engine:** input schema, candidate generation, deduplication, hard filters, configurable scoring, diversification, reasons. Keep it deterministic and test thoroughly.
4. **Recommend books:** expose the complete service through REST and MCP with no duplicated business logic.
5. **Book page:** basic `/book/[isbn]` page using normalized data.
6. **Affiliate abstraction:** generic commerce boundary and environment-driven Amazon links, without scraping or Amazon data dependency.
7. **Harden:** timeouts, fallback, caching, rate limits, health checks, analytics hooks, integration tests.
8. **Vercel:** clean deployment, environment docs, health, MCP and REST endpoints, safe production logging.

Tests across those phases should cover schemas, Google normalization, deduplication, scoring, missing data, diversification, recommendation output, provider failures, and malformed requests. Provider calls must be mockable.

V1 is done when the sample request for an advanced 11-year-old reader who liked Percy Jackson and Harry Potter and prefers mythology, history, humor, and little romance yields roughly five useful ranked books with reasons, scores, canonical URLs, safe logging and caching, graceful provider failures, REST and MCP access, automated tests, and Vercel deployment.

Do not build user or child accounts, social features, reviews, history, tracking, wish lists, subscriptions, payments, native apps, elaborate administration, an LLM backend, a proprietary book database, Amazon pricing, complicated machine learning, vector storage without a demonstrated need, or persistent child profiles.

Engineering rules: simple before clever; keep routes thin; share domain services across transports; keep providers replaceable; make unknown data stay unknown; minimize data collection; favor deterministic tests; and optimize for adding Connector #2.

## Future human curation requirement

The V1 curated catalog is maintained through version-controlled source data and a build CLI. Book Scout domain services depend on a narrow `CuratedCatalogRepository`, with a file-backed implementation today and a replaceable storage adapter later. Curated books have stable opaque Book Scout IDs independent of provider IDs, ISBNs, titles, or filenames. Provider facts, Book Scout classifications, derived values, and unknown values remain distinguishable; classification provenance may include opaque contributor and reviewer IDs. Audit metadata records creation, update, and review without names or other personal information.

Keep proposed submissions separate from approved production records. The review states are seeded, enriched, needs review, approved, and rejected; a proposal must not silently overwrite an approved record. Validation and review rules belong in reusable domain code so a future curator interface can use the same operations as the CLI. The future workflow is provider search, normalization, classification, validation, submission, review, approval, and then use by the existing recommendation engine. Do not build authentication, user accounts, curator or admin UI, a permissions system, or a database for this foundation. See [docs/CURATION.md](docs/CURATION.md).
