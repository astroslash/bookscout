# Curated Book Scout catalog

For external Golden/Core data creation, use the exact [data contract](CATALOG_DATA_CONTRACT.md) and [proposal JSON template](CATALOG_DATA_TEMPLATE.json). The template is fictional and must not be staged as real book data.

Google Books remains the live bibliographic source. A separate `CuratedBookProfile` stores Book Scout classifications, sourced reading fit, series information, relationships, and audit metadata. The normalized `Book` model stays provider focused. Unknown editorial values are absent rather than zero. No subjective classifications are inferred from Google categories or descriptions.

`data/books/catalog.source.json` is the version controlled working source. It contains seeds, proposals, and approved profiles. `data/books/catalog.json` is the deterministic generated runtime artifact and contains **only approved profiles**. `FileCuratedCatalogRepository` imports that artifact into the Vercel server bundle and implements `CuratedCatalogRepository` (`getById`, `getByIsbn`, `findByTitleAuthor`, `listApproved`). The recommendation service depends on this interface and works with an empty catalog or a future database adapter.

## Commands

Run commands from the repository root:

```sh
npm run catalog:add -- "The Lightning Thief" "Rick Riordan"
npm run catalog:enrich
npm run catalog:select-edition -- <seed-id> <listed-google-books-id>
npm run catalog:validate
npm run catalog:build
npm run catalog:stats
npm run catalog:check
```

`catalog:add` rejects an existing normalized title/author pair and creates an opaque `bs_` UUID. `catalog:enrich` uses the existing Google Books provider and requires `GOOGLE_BOOKS_API_KEY` in `.env.local`; it searches unresolved seeds, records candidate IDs and a deterministic confidence score, and attaches normalized book facts only for a high confidence title/author match with enough separation from other editions. Ambiguous matches stay `needs_review`. If the provider is unavailable, individual failures are reported and the source remains valid. `catalog:validate` checks schemas, IDs, ISBN checksums, duplicates, ranges, controlled terms, provenance, review metadata, and relationship references. `catalog:build` fails on invalid data; `catalog:check` detects a stale generated artifact. `catalog:stats` reports seed states and approved coverage.

`npm run catalog:approve -- <seed-id>` is a developer command for an **already inspected**, high confidence enriched seed. It creates a proposal and approves the factual provider record with a system reviewer ID. It does not add subjective traits or grant approval to ambiguous matches. Run `catalog:build` afterward. Future editorial changes should be proposed and reviewed through `CuratedCatalogService.submit` and `approve`; the CLI does not offer a shortcut for subjective classifications.

The starter set has 12 seeds: *The Lightning Thief*, *Harry Potter and the Sorcerer's Stone*, *The Hunger Games*, *The Hobbit*, *The Wild Robot*, *Wonder*, *Holes*, *Hatchet*, *The Giver*, *Diary of a Wimpy Kid*, *Dog Man*, and *The Dragonet Prophecy* (Wings of Fire). Five currently have reviewed exact Google title/author matches and seven require edition selection. The small catalog proves the workflow; it is not the Golden 100 or a public browsable collection.

## Model and review rules

Each profile has an opaque stable Book Scout ID, independent of title, ISBN, filename, or provider ID. The embedded normalized `Book` holds current factual metadata. Optional `tier` is `golden` or `core`. Controlled topics and reader fit tags live in `curation/taxonomy.ts`; aliases normalize deterministically. The 12 optional traits use a 0–5 scale, where an absent trait means unknown. Reading fit may include age, grade, reviewed sourced Lexile, and editorial difficulty. Provenance distinguishes external facts, Book Scout classifications, and derived values; optional contributor/reviewer IDs are opaque. Relationships may be `similar_to` or directed `read_next`; validation rejects missing targets, self links, and duplicate symmetric `similar_to` pairs. The structured similarity function returns a score, confidence, and reasons; missing dimensions reduce confidence instead of reducing the match score.

`CuratedCatalogService` owns seed normalization, provider matching, validation, submission, approval, rejection, building, and stats. A proposal does not change an approved runtime record. An approved record can have a proposed revision with the same stable ID; only approval replaces production data. Git is the present change history. Full revision history, permissions, and a curator interface are deferred.

The future flow is: authorized curator searches through the existing provider, selects the correct normalized result, creates or revises a profile, adds sourced classifications and relationships, submits for review, and a reviewer approves it. A browser interface can orchestrate these domain operations using a database backed repository without rewriting recommendations. No child names, emails, schools, or other personal information belongs in the catalog.

At recommendation time, the service generates candidates from Google Books, attaches approved profiles by ISBN or title/author, then uses known curated fields in the existing scorer and diversification pass. The provider `Book` remains unchanged. Books outside the small curated set continue through the same pipeline.
