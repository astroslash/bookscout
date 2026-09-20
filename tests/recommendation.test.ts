import { describe, expect, it } from "vitest";
import type { Book } from "../connectors/book-scout/book";
import { deduplicateCandidates, type Candidate } from "../connectors/book-scout/candidates";
import { diversifyCandidates } from "../connectors/book-scout/diversify";
import { recommendationInputSchema } from "../connectors/book-scout/schemas";
import { BookScoutRecommendationService } from "../connectors/book-scout/service";
import { defaultRecommendationConfig, passesHardFilters, scoreCandidate, type ScoredCandidate } from "../connectors/book-scout/scoring";
import { FileCuratedCatalogRepository } from "../connectors/book-scout/curation/file-repository";
import type { CuratedBookProfile } from "../connectors/book-scout/curation/schemas";

function book(id: string, title: string, author: string, extra: Partial<Book> = {}): Book {
  return { id, title, authors: [author], subjects: [], ...extra };
}

function candidate(item: Book, matchedInterests: string[] = [], matchedLikedBooks: string[] = []): Candidate {
  return { book: item, matchedInterests, matchedLikedBooks };
}

const provenance = { sourceType: "book_scout_classification" as const };
function curated(item: Book, topic = "mythology"): Candidate {
  return { ...candidate(item), curated: {
    id: "bs_00000000-0000-4000-8000-000000000001", book: item, tier: "golden",
    topics: [{ value: topic as CuratedBookProfile["topics"][number]["value"], provenance }],
    readerFitTags: [], traits: {}, relationships: [],
    audit: { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      createdBy: "human:test", updatedBy: "human:test", approvedAt: "2026-01-01T00:00:00.000Z", approvedBy: "human:test" },
  } };
}

describe("recommendation input", () => {
  it("accepts bounded preferences and supplies defaults", () => {
    const parsed = recommendationInputSchema.parse({ interests: ["mythology"] });
    expect(parsed).toMatchObject({ limit: 5, likedBooks: [], dislikedBooks: [], preferences: {}, preferSeries: false });
  });

  it("rejects malformed or unnecessary child details", () => {
    expect(recommendationInputSchema.safeParse({ age: 11 }).success).toBe(false);
    expect(recommendationInputSchema.safeParse({ interests: ["history"], age: 30 }).success).toBe(false);
    expect(recommendationInputSchema.safeParse({ interests: ["history"], limit: 50 }).success).toBe(false);
    expect(recommendationInputSchema.safeParse({ interests: ["history"], childName: "Sam" }).success).toBe(false);
  });
});

describe("candidate generation", () => {
  it("deduplicates by ISBN and title-author while preserving search provenance", () => {
    const first = book("google:a", "The Red Pyramid", "Rick Riordan", { isbn13: "9781423113386" });
    const edition = book("google:b", "The Red Pyramid", "Rick Riordan", { isbn13: "9781423113393" });
    const sameIsbn = book("other:c", "Red Pyramid", "R. Riordan", { isbn13: "9781423113386" });
    const output = deduplicateCandidates([
      candidate(first, ["Egypt"], []),
      candidate(edition, [], ["Percy Jackson"]),
      candidate(sameIsbn, ["mythology"], []),
    ]);
    expect(output).toHaveLength(1);
    expect(output[0].matchedInterests).toEqual(["Egypt", "mythology"]);
    expect(output[0].matchedLikedBooks).toEqual(["Percy Jackson"]);
  });

  it("keeps richer metadata from a duplicate edition", () => {
    const sparse = book("sparse", "Shared Title", "Author");
    const richer = book("rich", "Shared Title", "Author", { isbn13: "9781234567897", subjects: ["Adventure"] });
    const output = deduplicateCandidates([candidate(sparse), candidate(richer)]);
    expect(output).toHaveLength(1);
    expect(output[0].book.id).toBe("rich");
    expect(output[0].book.isbn13).toBe("9781234567897");
  });

});

describe("scoring and filters", () => {
  it("filters only explicit disliked books and reliable age or content signals", () => {
    const input = recommendationInputSchema.parse({
      age: 11, interests: ["adventure"], dislikedBooks: ["Bad Book"], preferences: { romance: "low" },
    });
    const config = defaultRecommendationConfig;
    expect(passesHardFilters(candidate(book("a", "Bad Book", "A")), input, config)).toBe(false);
    expect(passesHardFilters(candidate(book("b", "Older Book", "A", { readingLevel: { minimumAge: 15 } })), input, config)).toBe(false);
    expect(passesHardFilters(candidate(book("c", "Romance Book", "A", { content: { romance: 90 } })), input, config)).toBe(false);
    expect(passesHardFilters(candidate(book("d", "Unknown Book", "A")), input, config)).toBe(true);
  });

  it("scores relevant books higher and keeps missing data neutral", () => {
    const input = recommendationInputSchema.parse({ interests: ["mythology"], preferences: { romance: "low" } });
    const matching = scoreCandidate(curated(book("match", "Greek Myths", "A", { subjects: ["Mythology"] })), input, []);
    const unrelated = scoreCandidate(candidate(book("other", "Cooking", "B", { subjects: ["Cooking"] })), input, []);
    expect(matching.matchScore).toBeGreaterThan(unrelated.matchScore);
    const unknown = scoreCandidate(curated(book("unknown", "Greek Myths", "A", { subjects: ["Mythology"] })), input, []);
    const knownRomance = scoreCandidate(curated(book("known", "Greek Myths", "A", { subjects: ["Mythology"], content: { romance: 70 } })), input, []);
    expect(unknown.matchScore).toBeGreaterThan(knownRomance.matchScore);
    expect(unknown.reasons.some((reason) => reason.code === "preference_match")).toBe(false);
    expect(unknown.matchScore).toBe(scoreCandidate(curated(book("unknown", "Greek Myths", "A", { subjects: ["Mythology"] })), input, []).matchScore);
  });

  it("allows scoring weights to be configured", () => {
    const input = recommendationInputSchema.parse({ interests: ["mythology"] });
    const item = curated(book("a", "Greek Myths", "Author", { subjects: ["Mythology"] }));
    const standard = scoreCandidate(item, input, []).matchScore;
    const custom = { ...defaultRecommendationConfig, weights: {
      ...defaultRecommendationConfig.weights,
      interestMatch: 35,
      popularity: 0,
    } };
    const service = new BookScoutRecommendationService(custom);
    expect(service).toBeDefined();
    expect(scoreCandidate(item, input, [], custom).matchScore).toBeGreaterThan(standard);
    expect(() => new BookScoutRecommendationService({
      ...custom, weights: { ...custom.weights, interestMatch: 100 },
    })).toThrow(/weights/);
  });

  it("uses real Lexile data only when supplied", () => {
    const input = recommendationInputSchema.parse({ interests: ["history"], readingAbility: "advanced" });
    const known = scoreCandidate(candidate(book("known", "History", "A", { readingLevel: { lexile: 1100 } }), ["history"]), input, []);
    const unknown = scoreCandidate(candidate(book("unknown", "History", "A"), ["history"]), input, []);
    expect(known.matchScore).toBeGreaterThan(unknown.matchScore);
    expect(known.reasons.some((reason) => reason.code === "reading_fit")).toBe(true);
    expect(unknown.reasons.some((reason) => reason.code === "reading_fit")).toBe(false);
  });
});

describe("diversification and service", () => {
  it("prefers author variety unless the reader requests a series", () => {
    const scored = [
      { ...candidate(book("a", "Series One", "Same Author")), matchScore: 95, reasons: [{ code: "catalog_match" as const, message: "Catalog match" }] },
      { ...candidate(book("b", "Series Two", "Same Author")), matchScore: 94, reasons: [{ code: "catalog_match" as const, message: "Catalog match" }] },
      { ...candidate(book("c", "Different Book", "Other Author")), matchScore: 85, reasons: [{ code: "catalog_match" as const, message: "Catalog match" }] },
    ] satisfies ScoredCandidate[];
    const input = recommendationInputSchema.parse({ interests: ["fantasy"], limit: 2 });
    expect(diversifyCandidates(scored, input, defaultRecommendationConfig).map((item) => item.book.id)).toEqual(["a", "c"]);
    expect(diversifyCandidates(scored, { ...input, preferSeries: true }, defaultRecommendationConfig).map((item) => item.book.id)).toEqual(["a", "b"]);
  });

  it("rejects invalid input before provider calls", async () => {
    const service = new BookScoutRecommendationService(undefined,
      new FileCuratedCatalogRepository({ schemaVersion: 1, books: [] }));
    await expect(service.recommend({ interests: [], childName: "Sam" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
