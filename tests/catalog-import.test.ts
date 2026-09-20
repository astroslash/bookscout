import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import type { BookProvider } from "../connectors/book-scout/provider";
import { stageImportSeeds, submitImport, validateProposedCatalog } from "../connectors/book-scout/curation/import";
import { CuratedCatalogService } from "../connectors/book-scout/curation/service";

const example = JSON.parse(readFileSync(resolve("docs/CATALOG_DATA_TEMPLATE.json"), "utf8")) as unknown;
const empty = { schemaVersion: 1, seeds: [], submissions: [], approved: [] };
const now = new Date("2026-01-01T00:00:00.000Z");

describe("proposed catalog import gate", () => {
  it("accepts the four-record template and marks AI-assisted work unreviewed", () => {
    const parsed = validateProposedCatalog(example);
    expect(parsed.books).toHaveLength(4);
    expect(parsed.books.map((book) => book.tier)).toEqual(["golden", "golden", "core", "core"]);
    expect(parsed.books[0].traits.adventure?.provenance).toMatchObject({ assistance: "ai_assisted", reviewed: false });
  });

  it("rejects duplicates, unknown targets, invalid terms, traits, and false review claims", () => {
    const dataset = validateProposedCatalog(example);
    expect(() => validateProposedCatalog({ ...dataset, books: [...dataset.books, dataset.books[0]] }))
      .toThrow(/Duplicate import ref/);
    expect(() => validateProposedCatalog({ ...dataset, books: dataset.books.map((book, index) =>
      index === 1 ? { ...book, title: dataset.books[0].title } : book) })).toThrow(/Duplicate import title/);
    expect(() => validateProposedCatalog({ ...dataset, books: dataset.books.map((book, index) =>
      index === 0 ? { ...book, topics: [{ ...book.topics[0], value: "not-a-topic" }] } : book) })).toThrow();
    expect(() => validateProposedCatalog({ ...dataset, books: dataset.books.map((book, index) =>
      index === 0 ? { ...book, traits: { humor: { value: 6, provenance: book.topics[0].provenance } } } : book) })).toThrow();
    expect(() => validateProposedCatalog({ ...dataset, books: dataset.books.map((book, index) =>
      index === 0 ? { ...book, relationships: [{ ...book.relationships[0], targetRef: "missing-book" }] } : book) }))
      .toThrow(/Unknown relationship target/);
    expect(() => validateProposedCatalog({ ...dataset, books: dataset.books.map((book, index) =>
      index === 2 ? { ...book, relationships: [{ ...dataset.books[0].relationships[1],
        targetRef: dataset.books[0].ref }] } : book) })).toThrow(/Duplicate import relationship/);
    expect(() => validateProposedCatalog({ ...dataset, books: dataset.books.map((book, index) =>
      index === 0 ? { ...book, topics: [{ ...book.topics[0], provenance: {
        sourceType: "external",
      } }] } : book) })).toThrow();
    expect(() => validateProposedCatalog({ ...dataset, books: dataset.books.map((book, index) =>
      index === 0 ? { ...book, topics: [{ ...book.topics[0], provenance: {
        ...book.topics[0].provenance, reviewed: true, reviewerId: "human:reviewer_001",
      } }] } : book) })).toThrow(/unreviewed/);
  });

  it("stages seeds, submits only enriched profiles, and never approves automatically", async () => {
    const service = new CuratedCatalogService();
    const staged = stageImportSeeds(empty, example, service, now);
    expect(staged.added).toBe(4);
    expect(stageImportSeeds(staged.source, example, service, now).added).toBe(0);
    expect(staged.source.approved).toEqual([]);
    const seed = staged.source.seeds[0];
    const provider: BookProvider = {
      search: vi.fn(async () => [{ id: "google-books:ExampleVolume1", title: seed.title,
        authors: [seed.author], subjects: [], isbn13: "9780000000002" }]),
      getById: vi.fn(), getByISBN: vi.fn(), getByTitle: vi.fn(),
    };
    const enriched = await service.enrichSeed(staged.source, seed.id, provider, undefined, now);
    expect(enriched.seeds[0].state).toBe("enriched");
    const result = submitImport(enriched, example, service, now);
    expect(result.submitted).toBe(1);
    expect(result.skippedUnenriched).toHaveLength(3);
    expect(result.deferredRelationships).toBe(2);
    expect(result.source.approved).toEqual([]);
    expect(result.source.submissions[0].state).toBe("needs_review");
    expect(result.source.submissions[0].proposed.topics[0].provenance.reviewed).toBe(false);
    expect(result.source.submissions[0].proposed.relationships).toEqual([]);
    expect(submitImport(result.source, example, service, now).submitted).toBe(0);
  });

  it("requires explicit verified edition selection and keeps it unapproved", async () => {
    const service = new CuratedCatalogService();
    const source = stageImportSeeds(empty, example, service, now).source;
    const seed = source.seeds[0];
    const candidateId = "google-books:ExampleVolume1";
    const ambiguous = service.validate({ ...source, seeds: source.seeds.map((item) => item.id === seed.id ? {
      ...item, state: "needs_review",
      match: { status: "ambiguous", confidence: 0.9, candidateIds: [candidateId] },
    } : item) });
    const provider: BookProvider = {
      search: vi.fn(), getByISBN: vi.fn(), getByTitle: vi.fn(),
      getById: vi.fn(async () => ({ id: candidateId, title: seed.title,
        authors: [seed.author], subjects: [] })),
    };
    await expect(service.selectSeedEdition(ambiguous, seed.id, "google-books:Other", provider, now))
      .rejects.toThrow(/does not match/);
    const selected = await service.selectSeedEdition(ambiguous, seed.id, candidateId, provider, now);
    expect(selected.seeds[0]).toMatchObject({ state: "enriched", book: { id: candidateId } });
    expect(selected.approved).toEqual([]);
    const betterId = "google-books:VerifiedTradeEdition";
    provider.getById = vi.fn(async () => ({ id: betterId, title: `The Series and ${seed.title}`,
      authors: [seed.author], subjects: [] }));
    const verified = await service.selectSeedEdition(ambiguous, seed.id, betterId, provider, now);
    expect(verified.seeds[0]).toMatchObject({ state: "enriched", book: { id: betterId } });
  });
});
