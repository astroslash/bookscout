import { describe, expect, it, vi } from "vitest";
import type { Book } from "../connectors/book-scout/book";
import { diversifyCandidates } from "../connectors/book-scout/diversify";
import { defaultRecommendationConfig, type ScoredCandidate } from "../connectors/book-scout/scoring";
import { recommendationInputSchema } from "../connectors/book-scout/schemas";
import { BookScoutRecommendationService } from "../connectors/book-scout/service";
import type { BookProvider } from "../connectors/book-scout/provider";
import { FileCuratedCatalogRepository } from "../connectors/book-scout/curation/file-repository";
import { matchProviderCandidates } from "../connectors/book-scout/curation/matching";
import { curatedBookProfileSchema } from "../connectors/book-scout/curation/schemas";
import { CuratedCatalogService } from "../connectors/book-scout/curation/service";
import { compareCuratedBooks } from "../connectors/book-scout/curation/similarity";
import { normalizeReaderFitTag, normalizeTopic } from "../connectors/book-scout/curation/taxonomy";

const service = new CuratedCatalogService();
const now = new Date("2026-01-01T00:00:00.000Z");
const source = { schemaVersion: 1, seeds: [], approved: [], submissions: [] };
const provenance = { sourceType: "book_scout_classification" as const };
const volume = (id: string, title = "The Lightning Thief", author = "Rick Riordan"): Book => ({
  id: `google-books:${id}`, title, authors: [author], subjects: [],
  ...(id === "a" ? { isbn13: "9780786838653" } : {}),
});
const draft = (id: string, title?: string, author?: string) =>
  service.createDraft(volume(id, title, author), "system:developer", now);
const approved = (profile: ReturnType<typeof draft>) => {
  const submitted = service.submit(source, profile, "system:developer", now);
  return service.approve(submitted, submitted.submissions[0].id, "reviewer_001", now).approved[0];
};

describe("catalog taxonomy and validation", () => {
  it("normalizes aliases and rejects unknown controlled terms", () => {
    expect(normalizeTopic("Greek myths")).toBe("greek-mythology");
    expect(normalizeTopic("Greek gods")).toBe("greek-mythology");
    expect(normalizeTopic("Greek mythology")).toBe("greek-mythology");
    expect(normalizeReaderFitTag("advanced reader")).toBe("advanced-reader-friendly");
    expect(normalizeTopic("made up topic")).toBeNull();
    expect(() => service.normalizeTopics(["made up topic"])).toThrow(/Unknown catalog topic/);
    expect(() => service.normalizeReaderFitTags(["unknown tag"])).toThrow(/Unknown reader-fit tag/);
  });

  it("keeps missing traits unknown and validates provenance, bounds, and identifiers", () => {
    const profile = draft("a");
    expect(profile.traits).toEqual({});
    expect(profile.readingFit).toBeUndefined();
    expect(curatedBookProfileSchema.safeParse({ ...profile, topics: [{ value: "Greek myths", provenance }] }).success).toBe(false);
    expect(curatedBookProfileSchema.safeParse({ ...profile, readerFitTags: [{ value: "advanced reader", provenance }] }).success).toBe(false);
    expect(curatedBookProfileSchema.safeParse({ ...profile, traits: { humor: { value: 6, provenance } } }).success).toBe(false);
    expect(curatedBookProfileSchema.safeParse({ ...profile, traits: { humor: { value: 0, provenance } } }).success).toBe(true);
    expect(curatedBookProfileSchema.safeParse({ ...profile, readingFit: {
      minimumAge: { value: 14, provenance }, maximumAge: { value: 10, provenance },
    } }).success).toBe(false);
    expect(curatedBookProfileSchema.safeParse({ ...profile, readingFit: {
      minimumGrade: { value: 8, provenance }, maximumGrade: { value: 5, provenance },
    } }).success).toBe(false);
    expect(curatedBookProfileSchema.safeParse({ ...profile, readingFit: {
      lexile: { value: 1000, provenance },
    } }).success).toBe(false);
    expect(curatedBookProfileSchema.safeParse({ ...profile, readingFit: {
      lexile: { value: 1000, provenance: { sourceType: "external", source: "publisher", reviewed: true } },
    } }).success).toBe(true);
    expect(curatedBookProfileSchema.safeParse({ ...profile, book: { ...profile.book, isbn13: "9780786838654" } }).success).toBe(false);
    expect(curatedBookProfileSchema.safeParse({ ...profile, book: { ...profile.book, id: "bad-id" } }).success).toBe(false);
    const seed = service.addSeed(source, "Seed Book", "Seed Author", "system:developer", now).seeds[0];
    expect(() => service.validate({ ...source, seeds: [{ ...seed, book: {
      ...profile.book, isbn13: "9780786838654",
    } }] })).toThrow();
    expect(curatedBookProfileSchema.safeParse({ ...profile, series: { name: "Series", position: 0, provenance } }).success).toBe(false);
  });

  it("normalizes title and author for duplicate seeds and assigns stable IDs", () => {
    const one = service.addSeed(source, "The Lightning Thief", "Rick Riordan", "system:developer", now);
    expect(one.seeds[0].id).toMatch(/^bs_[0-9a-f-]{36}$/);
    expect(one.seeds[0].book).toBeUndefined();
    expect(() => service.addSeed(one, "the-lightning thief", "RICK RIORDAN", "system:developer", now))
      .toThrow(/already contains/);
  });
});

describe("provider matching and source lifecycle", () => {
  const seed = { title: "The Lightning Thief", author: "Rick Riordan" };
  it("separates confident, ambiguous, and poor Google matches", () => {
    const exact = volume("a");
    expect(matchProviderCandidates(seed, [exact])).toMatchObject({ status: "matched", book: exact });
    expect(matchProviderCandidates(seed, [exact, { ...exact, id: "google-books:b" }]).status).toBe("ambiguous");
    expect(matchProviderCandidates(seed, [volume("c", "Cooking", "Other Writer")]).status).toBe("unresolved");
  });

  it("uses the injected provider and leaves ambiguous seeds unapproved", async () => {
    const initial = service.addSeed(source, seed.title, seed.author, "system:developer", now);
    const search = vi.fn(async () => [volume("a"), volume("b")]);
    const provider: BookProvider = { search, getById: vi.fn(), getByISBN: vi.fn(), getByTitle: vi.fn() };
    const result = await service.enrichSeed(initial, initial.seeds[0].id, provider);
    expect(search).toHaveBeenCalledOnce();
    expect(result.seeds[0].state).toBe("needs_review");
    expect(result.seeds[0].book).toBeUndefined();
    expect(service.build(result).books).toEqual([]);
  });

  it("reports catalog stats and builds approved records deterministically", () => {
    const first = approved(draft("a"));
    const second = approved(draft("b", "Hatchet", "Gary Paulsen"));
    const catalog = { ...source, approved: [second, first] };
    const built = service.build(catalog);
    expect(built.books.map((item) => item.id)).toEqual([first.id, second.id].sort());
    expect(JSON.stringify(service.build(catalog))).toBe(JSON.stringify(service.build(catalog)));
    expect(service.stats(catalog)).toMatchObject({ approved: 2, isbnCoverage: 1, classificationCoverage: 0 });
    expect(() => service.build({ ...catalog, approved: [first, { ...second, book: first.book }] }))
      .toThrow(/Duplicate approved ISBN/);
  });
});

describe("relationships, similarity, and ranking integration", () => {
  it("rejects broken, self, and symmetric duplicate relationships", () => {
    const first = approved(draft("a"));
    const second = approved(draft("b", "Hatchet", "Gary Paulsen"));
    const relation = { sourceBookId: first.id, targetBookId: second.id, type: "similar_to" as const,
      reasons: [], provenance };
    expect(() => service.build({ ...source, approved: [{ ...first, relationships: [{ ...relation, targetBookId: draft("x").id }] }, second] }))
      .toThrow(/Broken relationship/);
    expect(() => service.build({ ...source, approved: [{ ...first, relationships: [{ ...relation, targetBookId: first.id }] }, second] }))
      .toThrow(/Self relationship/);
    const reverse = { ...relation, sourceBookId: second.id, targetBookId: first.id };
    expect(() => service.build({ ...source, approved: [{ ...first, relationships: [relation] }, { ...second, relationships: [reverse] }] }))
      .toThrow(/Duplicate relationship/);
  });

  it("keeps similarity neutral when data is missing and deterministic when known", () => {
    const a = draft("a");
    const b = draft("b", "Another Book", "Other Writer");
    expect(compareCuratedBooks(a, b)).toEqual({ score: 0.5, confidence: 0, reasons: [] });
    const knownA = curatedBookProfileSchema.parse({ ...a, topics: [{ value: "greek-mythology", provenance }],
      traits: { adventure: { value: 4, provenance } } });
    const knownB = curatedBookProfileSchema.parse({ ...b, topics: [{ value: "greek-mythology", provenance }],
      traits: { adventure: { value: 5, provenance } } });
    const compared = compareCuratedBooks(knownA, knownB);
    expect(compared.score).toBeGreaterThan(0.8);
    expect(compared.confidence).toBeGreaterThan(0);
    expect(compared.confidence).toBeLessThan(1);
    expect(compareCuratedBooks(knownA, knownB)).toEqual(compared);
  });

  it("uses approved traits and topics while preserving long-tail provider fallback", async () => {
    const book = volume("a");
    const provider: BookProvider = { search: vi.fn(async () => [book]), getById: vi.fn(), getByISBN: vi.fn(), getByTitle: vi.fn() };
    const profile = approved(curatedBookProfileSchema.parse({ ...draft("a"),
      topics: [{ value: "greek-mythology", provenance }],
      traits: { humor: { value: 5, provenance } },
    }));
    const repository = new FileCuratedCatalogRepository({ schemaVersion: 1, books: [profile] });
    const input = { interests: ["Greek myths"], preferences: { humor: "high" } };
    const curated = await new BookScoutRecommendationService(provider, undefined, repository).recommend(input);
    const longTail = await new BookScoutRecommendationService(provider, undefined,
      new FileCuratedCatalogRepository({ schemaVersion: 1, books: [] })).recommend(input);
    expect(curated.recommendations[0].matchScore).toBeGreaterThan(longTail.recommendations[0].matchScore);
    expect(curated.recommendations[0].book.subjects).toEqual([]);
    expect(longTail.recommendations).toHaveLength(1);
  });

  it("diversifies across a known series when the user did not request a series", () => {
    const one = { ...draft("a"), series: { name: "Shared Series", position: 1, provenance } };
    const two = { ...draft("b", "Second Volume", "Other Writer"), series: { name: "Shared Series", position: 2, provenance } };
    const different = { ...draft("c", "Different Book", "Third Writer"), series: { name: "Another Series", position: 1, provenance } };
    const candidate = (profile: typeof one, matchScore: number): ScoredCandidate => ({
      book: profile.book, curated: curatedBookProfileSchema.parse(profile), matchedInterests: [], matchedLikedBooks: [],
      matchScore, reasons: [{ code: "catalog_match", message: "Catalog match" }],
    });
    const ranked = [candidate(one, 95), candidate(two, 94), candidate(different, 85)];
    const input = recommendationInputSchema.parse({ interests: ["adventure"], limit: 2 });
    expect(diversifyCandidates(ranked, input, defaultRecommendationConfig).map((item) => item.book.id))
      .toEqual([one.book.id, different.book.id]);
    expect(diversifyCandidates(ranked, { ...input, preferSeries: true }, defaultRecommendationConfig).map((item) => item.book.id))
      .toEqual([one.book.id, two.book.id]);
  });
});
