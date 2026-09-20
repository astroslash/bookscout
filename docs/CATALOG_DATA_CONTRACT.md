# Book Scout initial catalog data contract

This is the handoff between external curation work and the current Book Scout code. The companion [JSON template](CATALOG_DATA_TEMPLATE.json) contains **fictional format examples**, two `golden` and two `core`. They are not real books or approved classifications. Do not stage the template itself. The external workflow should produce one JSON file with the same shape and real titles/authors and defensible editorial judgments. It must not manufacture external reading metrics or mark AI-assisted work human-reviewed.

## 1. Actual file formats and ownership

The external file is a **proposal**, checked by `npm run catalog:check-import -- <path>`. Its root is `{"schemaVersion":1,"books":[...]}`; `books` must contain 1–500 entries. Each entry is matched by normalized title and primary author when staged, while its `ref` is a temporary, unique, lowercase slug (3–64 characters, pattern `^[a-z][a-z0-9-]{2,63}$`) used only by relationships within that file. It is **not** the permanent Book Scout ID.

The version controlled working source is `data/books/catalog.source.json`, with `schemaVersion: 1`, `seeds`, `submissions`, and `approved`. The generated runtime file is `data/books/catalog.json`, with `schemaVersion: 1` and `books` containing approved `CuratedBookProfile` records only. The source is validated and transformed by `CuratedCatalogService`. `FileCuratedCatalogRepository` reads only the generated runtime file. Google Books remains the live bibliographic provider.

| External proposal field | Requirement | Meaning |
| --- | --- | --- |
| `ref` | Required | Unique temporary slug for relationships in the same file; never a catalog ID. |
| `title`, `author` | Required | Book title and primary author, 1–160 and 1–120 characters respectively. |
| `tier` | Required | `golden` or `core`. A tier in a proposal is an unreviewed editorial choice. |
| `topics` | Optional, defaults `[]` | Up to 30 canonical `{value, provenance}` objects. |
| `readerFitTags` | Optional, defaults `[]` | Up to 20 canonical `{value, provenance}` objects. |
| `traits` | Optional, defaults `{}` | Any subset of the 12 allowed keys, each `{value, provenance}`. |
| `readingFit` | Optional | Known age/grade bounds, sourced Lexile, or editorial difficulty. |
| `series` | Optional | `{name, position?, provenance}`. |
| `relationships` | Optional, defaults `[]` | Up to 30 proposed links; see the import-specific form below. |

The proposal schema is strict: `id`, `book`, `state`, `audit`, ISBN, Google ID, `match`, and `sourceBookId`/`targetBookId` are **not** accepted in external entries. Tooling creates or supplies those after provider matching. Omit unknown fields; do not use `null`, zero as a stand-in, empty source strings, fabricated ISBNs, or made-up provider identifiers.

## 2. Seed records in the working source

`npm run catalog:stage-import -- <path>` or `npm run catalog:add -- "Title" "Author"` creates the stable `bs_` UUID and audit metadata. A minimum valid **internal** seed, before enrichment, is:

```json
{
  "id": "bs_00000000-0000-4000-8000-000000000001",
  "title": "Fictional Example Title",
  "author": "Example Author",
  "state": "seeded",
  "audit": {
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "createdBy": "system:developer",
    "updatedBy": "system:developer"
  }
}
```

The `id` and timestamps above illustrate the **internal shape**; the external dataset creator must not choose them. A fully populated seed-level example **after** a confident provider match is:

```json
{
  "id": "bs_00000000-0000-4000-8000-000000000001",
  "title": "Fictional Example Title",
  "author": "Example Author",
  "state": "enriched",
  "book": {
    "id": "google-books:ExampleVolume1",
    "title": "Fictional Example Title",
    "authors": ["Example Author"],
    "subjects": []
  },
  "match": {
    "status": "matched",
    "confidence": 1,
    "candidateIds": ["google-books:ExampleVolume1"]
  },
  "audit": {
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-02T00:00:00.000Z",
    "createdBy": "system:developer",
    "updatedBy": "system:developer"
  }
}
```

These identifiers and book facts are fictional schema examples. `book` is the existing normalized provider `Book`, not a freeform editorial object. Its required fields are `id`, `title`, `authors` (array), and `subjects` (array). Optional provider facts are `subtitle`, `isbn10`, `isbn13`, `description`, `publicationYear`, `pageCount`, `language`, `coverUrl`, `popularity`, `readingLevel`, `content`, and `attributes`; the provider or a verified manual edition selection supplies them. ISBN-10 and ISBN-13 must have valid checksums. The seed `match` may have status `matched`, `ambiguous`, or `unresolved`, confidence 0–1, and up to five candidate IDs. Google enrichment generates these diagnostics; ambiguous results do not receive a `book` automatically. `audit` may additionally have paired `approvedAt`/`approvedBy` for production approval and paired `reviewedAt`/`reviewedBy` only for human review.

## 3. Curated profile and review envelope

A `CuratedBookProfile` is separate from `Book`. Its required fields after schema parsing are `id`, `book`, `topics`, `readerFitTags`, `traits`, `relationships`, and `audit`; the four collection fields default to empty if omitted during parsing. Optional fields are `tier`, `readingFit`, and `series`. A complete illustrative profile shape is below. All book and classification values are **fictional schema examples** and must never be copied into production as facts or approved judgments.

```json
{
  "id": "bs_00000000-0000-4000-8000-000000000001",
  "book": {
    "id": "google-books:ExampleVolume1",
    "title": "Fictional Example Title",
    "authors": ["Example Author"],
    "subjects": []
  },
  "tier": "golden",
  "topics": [
    { "value": "mythology", "provenance": { "sourceType": "book_scout_classification", "assistance": "ai_assisted", "reviewed": false } }
  ],
  "readerFitTags": [
    { "value": "fast-paced", "provenance": { "sourceType": "book_scout_classification", "assistance": "ai_assisted", "reviewed": false } }
  ],
  "traits": {
    "adventure": { "value": 4, "provenance": { "sourceType": "book_scout_classification", "assistance": "ai_assisted", "reviewed": false } }
  },
  "readingFit": {
    "minimumAge": { "value": 9, "provenance": { "sourceType": "book_scout_classification", "assistance": "ai_assisted", "reviewed": false } },
    "maximumAge": { "value": 14, "provenance": { "sourceType": "book_scout_classification", "assistance": "ai_assisted", "reviewed": false } },
    "minimumGrade": { "value": 4, "provenance": { "sourceType": "book_scout_classification", "assistance": "ai_assisted", "reviewed": false } },
    "maximumGrade": { "value": 9, "provenance": { "sourceType": "book_scout_classification", "assistance": "ai_assisted", "reviewed": false } },
    "difficulty": { "value": "average", "provenance": { "sourceType": "book_scout_classification", "assistance": "ai_assisted", "reviewed": false } }
  },
  "series": {
    "name": "Example Series",
    "position": 1,
    "provenance": { "sourceType": "book_scout_classification", "assistance": "ai_assisted", "reviewed": false }
  },
  "relationships": [
    {
      "sourceBookId": "bs_00000000-0000-4000-8000-000000000001",
      "targetBookId": "bs_00000000-0000-4000-8000-000000000002",
      "type": "read_next",
      "strength": 0.9,
      "reasons": ["Next book in the example series"],
      "provenance": { "sourceType": "book_scout_classification", "assistance": "ai_assisted", "reviewed": false }
    }
  ],
  "audit": {
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-02T00:00:00.000Z",
    "createdBy": "system:developer",
    "updatedBy": "system:developer"
  }
}
```

The external file does **not** contain this profile directly. `catalog:submit-import` joins its editorial fields to an enriched seed's provider `Book`, keeps the seed's stable ID, creates audit metadata, and places the result in `submissions` with `state: "needs_review"`. The approved production copy is created only by `CuratedCatalogService.approve`. `tier` is optional in the internal profile because existing factual records have no tier; it is required in the new proposal file.

## 4. Exact topic taxonomy and aliases

Canonical topic values (all 25; use these in JSON):

```text
mythology, greek-mythology, roman-mythology, norse-mythology,
ancient-history, world-war-ii, space, science, technology,
dragons, magic, sports, basketball, baseball, football,
animals, dinosaurs, survival, mystery, puzzles, adventure,
friendship, school, family, superheroes
```

The complete **explicit topic alias map** is:

| Input alias | Canonical value |
| --- | --- |
| `greek myths` | `greek-mythology` |
| `greek gods` | `greek-mythology` |
| `greek mythology` | `greek-mythology` |
| `roman myths` | `roman-mythology` |
| `norse myths` | `norse-mythology` |
| `wwii` | `world-war-ii` |
| `world war 2` | `world-war-ii` |
| `world war ii` | `world-war-ii` |

The normalizer applies Unicode NFKC, lowercases, replaces nonletters/nondigits with spaces, and trims. It also accepts spelling/case/punctuation variants of canonical values, but **the JSON schema requires canonical values**; aliases are for interactive normalization, not import files.

## 5. Traits

Every trait is optional. Its exact object is `{"value":number,"provenance":{...}}`; `value` accepts any number from **0 through 5 inclusive** (the schema does not require integers). Zero means essentially absent; five means highly prominent. These descriptions are editorial guidance, not additional code-enforced semantics.

| Exact key | 0 means | 5 means |
| --- | --- | --- |
| `adventure` | No adventure focus | Adventure drives the book |
| `action` | Little action | Action is sustained and prominent |
| `humor` | Little humor | Humor is central throughout |
| `fantasy` | No fantasy elements | Fantasy is central to the setting or plot |
| `scienceFiction` | No science fiction elements | Science fiction is central |
| `mystery` | No mystery element | Solving a mystery drives the plot |
| `romance` | No meaningful romance element | Romance is central |
| `scary` | Essentially not frightening | Frightening material is prominent |
| `violence` | Essentially no violence | Violence is prominent |
| `educational` | No intentional learning focus | Learning content is central |
| `emotionalIntensity` | Emotionally gentle | Emotionally intense throughout |
| `reluctantReader` | Little fit for reluctant readers | Strong fit for reluctant readers |

`null` is invalid. Omit the key from `traits` when unknown. Do not turn lack of evidence into a zero. An empty `{}` means no trait classifications are known.

## 6. Reader fit tags

Use exact canonical values in `readerFitTags`. These one-sentence definitions are editorial guidance; the schema enforces membership, not the definitions.

| Exact value | Meaning |
| --- | --- |
| `fast-paced` | Events move quickly with little downtime. |
| `slow-burn` | The story develops deliberately before major payoffs. |
| `reluctant-reader-friendly` | Format or pacing may help readers hesitant to keep reading. |
| `advanced-reader-friendly` | The book may suit readers comfortable with more demanding text. |
| `series-reader` | The book offers a continuing series reading path. |
| `humor-lover` | Humor is a notable appeal for this reader. |
| `world-building` | Immersion in a developed fictional world is a notable appeal. |
| `puzzle-lover` | Puzzles or problem solving are a notable appeal. |
| `history-lover` | Historical subject matter is a notable appeal. |
| `mythology-lover` | Mythological subject matter is a notable appeal. |

The complete explicit reader-tag aliases accepted by the normalizer are `fast paced` → `fast-paced`, `reluctant reader` → `reluctant-reader-friendly`, `advanced reader` → `advanced-reader-friendly`, `humor lover` → `humor-lover`, `history lover` → `history-lover`, and `mythology lover` → `mythology-lover`. Again, JSON must use canonical values.

## 7. Reading fit, series, and unknown values

`readingFit` is optional and strict. `minimumAge`/`maximumAge` each wrap an integer **3–19** plus provenance; the minimum must not exceed the maximum. `minimumGrade`/`maximumGrade` wrap an integer **0–12** plus provenance, also ordered. The schema permits `external`, `book_scout_classification`, or `derived` provenance for age and grade. For AI-assisted initial curation, use `book_scout_classification` only for a defensible editorial fit and mark it `assistance: "ai_assisted", reviewed: false`; never present it as a publisher age/grade recommendation. An externally quoted recommendation requires `sourceType: "external"` and a nonempty `source`. If confidence or source is lacking, omit the bound.

`difficulty` wraps exactly `beginner`, `average`, or `advanced` and requires Book Scout classification provenance. `lexile` wraps an integer **0–3000** and requires `sourceType: "external"`, a nonempty `source`, and `reviewed: true`. Do not place an AI-estimated Lexile in the dataset. Omit it unless a human has verified the specific book/edition and source. A valid structure **only when a real verified metric exists** is `{"lexile":{"value":<verified integer>,"provenance":{"sourceType":"external","source":"<specific authoritative citation>","reviewed":true}}}`. This placeholder is documentation, not JSON to copy.

`series` is optional and strict: `{"name":"...","position":1,"provenance":{...}}`. Name is 1–120 characters; position is an optional positive integer. The first book uses `position: 1`. A known standalone and unknown series status are both represented by **omitting `series`**; the present schema cannot distinguish those two cases. Series names are stored as entered; there is no canonical series-name registry. Diversification normalizes the name at comparison time. Do not invent a position when unsure.

## 8. Relationships

The internal `CuratedBookProfile.relationships[]` shape is:

```json
{
  "sourceBookId": "bs_00000000-0000-4000-8000-000000000001",
  "targetBookId": "bs_00000000-0000-4000-8000-000000000002",
  "type": "similar_to",
  "strength": 0.7,
  "reasons": ["Shared adventure topic"],
  "provenance": { "sourceType": "book_scout_classification", "assistance": "ai_assisted", "reviewed": false }
}
```

The only types are `similar_to` (symmetric; store either direction once) and `read_next` (directional, source → target). A `read_next` example has the same shape with `"type":"read_next"`, `"strength":1`, and `"reasons":["Next volume in the series"]`. `strength` is optional from 0 to 1; `reasons` is optional/defaults `[]`, at most eight nonempty strings of at most 120 characters. Provenance must be Book Scout classification. There is no separate relationship review-state field; field provenance and the containing submission state carry review status. The service rejects self links, unknown targets, duplicate `read_next` directions, and either orientation of a duplicate `similar_to` pair in approved records. Derived similarity from the algorithm is a separate result, not an explicit relationship.

**External import form:** omit `sourceBookId` (the source is the containing book) and replace `targetBookId` with `targetRef`, referencing a `ref` in the same file. For example:

```json
{
  "targetRef": "example-quest-two",
  "type": "read_next",
  "strength": 1,
  "reasons": ["Next volume in the example series"],
  "provenance": { "sourceType": "book_scout_classification", "assistance": "ai_assisted", "reviewed": false }
}
```

The import checker validates every target and detects duplicate/symmetric links. Staging resolves `ref` to generated Book Scout IDs. A relationship to a book that is not yet approved is deferred, reported by the submit command, and can be proposed on a second pass after its target is approved. No deferred relationship is silently approved.

## 9. Provenance, review, and identity

Provenance is a strict object with `sourceType` **required** and optional `source` (1–120 characters), `contributorId` (opaque actor ID), `assistance` (only `ai_assisted`), `reviewed` (boolean), and `reviewerId` (opaque actor ID). Actor IDs follow `^[a-z][a-z0-9:_-]{2,63}$`. `reviewed` means **human-reviewed**; `reviewerId` requires `reviewed: true` and a `human:` actor ID. `assistance` is allowed only on Book Scout classifications. For a classification in an external proposal, `reviewed: true` and `reviewerId` are forbidden. Production approval is recorded separately in the profile/submission audit as `approvedAt` and `approvedBy`.

| Situation | Encoding |
| --- | --- |
| Google Books bibliographic fact | Keep it in provider-supplied `book` after enrichment; do not copy it as a Book Scout classification. The `google-books:` ID identifies its provider. |
| Verified external age/grade fact | `{ "sourceType":"external", "source":"Specific authoritative citation", "reviewed":true }` only after actual verification. |
| AI-assisted editorial judgment before review | `{ "sourceType":"book_scout_classification", "assistance":"ai_assisted", "reviewed":false }`. `contributorId` may be omitted. |
| Same judgment after AI-curator production approval | Field provenance remains `{ "sourceType":"book_scout_classification", "assistance":"ai_assisted", "reviewed":false }`; profile audit has `approvedBy:"ai:book-scout-curator"` and `approvedAt`, with no `reviewedAt`/`reviewedBy`. |
| Same judgment after later human review | The service retains `assistance:"ai_assisted"` and the original AI `approvedBy`, then sets field `reviewed:true`, `reviewerId:"human:<opaque-id>"`, and audit `reviewedAt`/`reviewedBy`. |
| Unknown | Omit the field or trait key. Do not emit `null` or `0` as unknown. |
| Derived value | `{ "sourceType":"derived", "source":"Named derivation" }` where a field's schema permits generic provenance; no current automatic catalog derivation is implied. |

For externally researched but **unverified** claims, omit the value until verified; `external` with a source string alone records a source but does not certify its accuracy. The current normalized `Book` model does not carry field-level provenance for each Google value. Do not claim it does.

Seed and submission states are exactly `seeded`, `enriched`, `needs_review`, `approved`, and `rejected`. `seeded` means a title/author awaits a provider match; `enriched` means a confident provider book was attached; `needs_review` means an ambiguous match or an open proposal; `approved` means authorized for production, without implying a human reviewed it; `rejected` means a proposal was declined. A proposed AI-assisted classification is a **`needs_review` submission** with field `reviewed: false`. `CuratedBookProfile` itself has no `state` property. Production approval adds paired `audit.approvedAt`/`audit.approvedBy`. Human approval additionally sets paired `audit.reviewedAt`/`audit.reviewedBy` and field `reviewed:true`/`reviewerId`; AI approval does not. The generated runtime includes only approved profiles.

## 10. Safe import and validation workflow

Run from the repo root with Node.js and installed dependencies. `catalog:check-import` is read-only: it parses the proposal, checks strict schemas, canonical terms, trait/range bounds, duplicates, link targets and symmetry, provenance, and false review claims. It neither edits files nor calls an API. Because pre-enrichment proposals contain no ISBN or Google ID, provider identifier and ISBN duplication checks occur later in `catalog:validate` and `catalog:build`.

```sh
npm run catalog:check-import -- path/to/proposed-catalog.json
npm run catalog:stage-import -- path/to/proposed-catalog.json
npm run catalog:enrich
npm run catalog:validate
npm run catalog:submit-import -- path/to/proposed-catalog.json
npm run catalog:validate
npm run catalog:stats
```

`catalog:stage-import` adds only missing title/author seeds to `data/books/catalog.source.json`, preserving existing IDs. It does not approve data or change `catalog.json`. `catalog:enrich` uses the existing Google Books provider and requires `GOOGLE_BOOKS_API_KEY` in `.env.local`. It may mark an edition ambiguous and leave `book` unset. Inspect the candidate Google IDs and select a verified edition with `npm run catalog:select-edition -- <seed-id> <verified-google-books-id>`. An inspected edition may be outside the initial search shortlist; the command fetches and normalizes it through the existing provider, requires the seed title and author to match, and leaves the record unapproved. If no candidate is correct, leave the seed pending rather than force a match. `catalog:submit-import` submits ready profiles; it reports and skips entries without a selected provider book. It creates `needs_review` submissions only. It defers links to unapproved targets and reports their count. Both staging and submission are repeatable; rerunning them preserves stable IDs and skips unchanged/open proposals.

For the initial catalog, the owner has delegated editorial production approval to an AI curator. The AI curator may approve only submissions tied to a resolved Google Books seed. Preview a proposal-scoped batch first; preview makes no changes and reports each approval and skip:

```sh
npm run catalog:approve-ready-ai -- path/to/proposed-catalog.json ai:book-scout-curator
npm run catalog:approve-ready-ai -- path/to/proposed-catalog.json ai:book-scout-curator --apply
```

The `--apply` form writes approved records to `catalog.source.json`. It skips ambiguous/unresolved matches, missing submissions, changed provider editions, non-AI classifications, and validation failures; the JSON report identifies every approved and skipped proposal ref. It never changes `reviewed:false` to true. For one submission, use `npm run catalog:approve-submission -- <submission-uuid> ai:book-scout-curator`. The older `catalog:approve -- <seed-id>` approves a factual high-confidence seed without editorial classifications. Neither command authenticates the actor; the owner controls local command execution.

Once target books are approved, rerun `catalog:submit-import` to create proposals for deferred relationships, preview and apply AI approval again, and inspect the report. If a human later reviews an already AI-approved record, use `npm run catalog:mark-human-reviewed -- <catalog-id> human:<opaque-id>`. This preserves the original AI approver and records the human reviewer separately. A human can also approve a pending submission directly with `npm run catalog:approve-submission -- <submission-uuid> human:<opaque-id>` after actual review. Then run:

```sh
npm run catalog:validate
npm run catalog:build
npm run catalog:check
npm run catalog:stats
```

Review the source diff before committing. `catalog:build` writes deterministic `data/books/catalog.json` with approved profiles only. Avoid running staging, submission, or approval against the fictional template. No public REST or MCP route exposes these commands.

## 11. Current starter records and schema limits

The source began with 12 starter seeds and has since expanded; run `npm run catalog:stats` for current counts. The starter records' legacy `system:developer` approval identity was preserved when the audit fields were separated; no human review is claimed for them. Existing matching by normalized title/author lets an incoming proposal reuse those seeds; the external creator should not assign new IDs to them. The proposal checker catches duplicate title/author pairs **within its own file**. Staging handles overlap with existing seeds. It cannot detect that two different editions with different titles are the same literary work; edition review remains necessary. Series name normalization is comparison-only, and known standalone versus unknown series is not representable. There is no curator UI, auth, database, or automatic human-review claim.
