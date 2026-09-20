import { describe, expect, it, vi } from "vitest";
import type { Book } from "../connectors/book-scout/book";
import type { BookProvider } from "../connectors/book-scout/provider";
import { deduplicateCandidates, generateCandidates, planCandidateQueries, type Candidate } from "../connectors/book-scout/candidates";
import { diversifyCandidates } from "../connectors/book-scout/diversify";
import { recommendationInputSchema, recommendationResultSchema } from "../connectors/book-scout/schemas";
import { BookScoutRecommendationService } from "../connectors/book-scout/service";
import { defaultRecommendationConfig, passesHardFilters, scoreCandidate, type ScoredCandidate } from "../connectors/book-scout/scoring";

function book(id: string, title: string, author: string, extra: Partial<Book> = {}): Book {
  return { id, title, authors: [author], subjects: [], ...extra };
}

function candidate(item: Book, matchedInterests: string[] = [], matchedLikedBooks: string[] = []): Candidate {
  return { book: item, matchedInterests, matchedLikedBooks };
}

function provider(search: (query: string) => Promise<Book[]>): BookProvider {
  return { search, getByISBN: vi.fn(), getById: vi.fn(), getByTitle: vi.fn() };
}

const profile = recommendationInputSchema.parse({
  age: 11,
  readingAbility: "advanced",
  interests: ["Greek mythology", "history", "funny books"],
  likedBooks: ["Percy Jackson", "Harry Potter"],
  preferences: { romance: "low", humor: "high" },
});

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
  it("caps searches and deduplicates repeated query terms", () => {
    const input = recommendationInputSchema.parse({
      interests: ["Greek mythology", "history", "funny", "sports"],
      likedBooks: ["Greek mythology", "Percy Jackson", "Harry Potter"],
    });
    const queries = planCandidateQueries(input);
    expect(queries).toHaveLength(4);
    expect(queries.map((item) => item.query)).toEqual(["Greek mythology", "history", "funny", "Percy Jackson"]);
    expect(queries[0]).toMatchObject({ interests: ["Greek mythology"], likedBooks: ["Greek mythology"] });
  });

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

  it("keeps successful searches when another provider call fails", async () => {
    const search = vi.fn(async (query: string) => {
      if (query === "history") throw new Error("temporary provider failure");
      return [book("a", "A Mythology Book", "Author")];
    });
    const input = recommendationInputSchema.parse({ interests: ["mythology", "history"] });
    const result = await generateCandidates(provider(search), input);
    expect(result).toMatchObject({ queriesAttempted: 2, queriesSucceeded: 1 });
    expect(result.candidates).toHaveLength(1);
    await expect(generateCandidates(provider(async () => { throw new Error("down"); }), input))
      .rejects.toMatchObject({ code: "PROVIDER_ERROR", retryable: true });
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
    const matching = scoreCandidate(candidate(book("match", "Greek Myths", "A", { subjects: ["Mythology"] }), ["mythology"]), input, []);
    const unrelated = scoreCandidate(candidate(book("other", "Cooking", "B", { subjects: ["Cooking"] })), input, []);
    expect(matching.matchScore).toBeGreaterThan(unrelated.matchScore);
    const unknown = scoreCandidate(candidate(book("unknown", "Greek Myths", "A", { subjects: ["Mythology"] }), ["mythology"]), input, []);
    const knownRomance = scoreCandidate(candidate(book("known", "Greek Myths", "A", { subjects: ["Mythology"], content: { romance: 70 } }), ["mythology"]), input, []);
    expect(unknown.matchScore).toBeGreaterThan(knownRomance.matchScore);
    expect(unknown.reasons.some((reason) => reason.code === "preference_match")).toBe(false);
    expect(unknown.matchScore).toBe(scoreCandidate(candidate(book("unknown", "Greek Myths", "A", { subjects: ["Mythology"] }), ["mythology"]), input, []).matchScore);
  });

  it("allows scoring weights to be configured", () => {
    const input = recommendationInputSchema.parse({ interests: ["mythology"] });
    const item = candidate(book("a", "Greek Myths", "Author", { subjects: ["Mythology"] }), ["mythology"]);
    const standard = scoreCandidate(item, input, []).matchScore;
    const custom = { ...defaultRecommendationConfig, weights: {
      ...defaultRecommendationConfig.weights,
      interestMatch: 35,
      popularity: 0,
    } };
    const service = new BookScoutRecommendationService(provider(async () => [item.book]), custom);
    expect(service).toBeDefined();
    expect(scoreCandidate(item, input, [], custom).matchScore).toBeGreaterThan(standard);
    expect(() => new BookScoutRecommendationService(provider(async () => []), {
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

  it("returns structured recommendations from one deterministic pipeline", async () => {
    const liked = book("liked", "Percy Jackson", "Rick Riordan", { subjects: ["Mythology"] });
    const books: Record<string, Book[]> = {
      "Greek mythology": [liked, book("a", "The Lightning Thief", "Rick Riordan", { subjects: ["Greek mythology", "Adventure"] }), book("c", "Aru Shah", "Roshani Chokshi", { subjects: ["Mythology"] })],
      history: [book("d", "The False Prince", "Jennifer Nielsen", { subjects: ["History", "Adventure"] }), book("e", "History Tales", "Jane Author", { subjects: ["History"] })],
      "funny books": [book("f", "Funny Stories", "Sam Writer", { subjects: ["Humor"] })],
      "Percy Jackson": [liked, book("b", "The Red Pyramid", "Rick Riordan", { subjects: ["Mythology"] })],
      "Harry Potter": [book("g", "Wizard School", "Other Writer", { subjects: ["Fantasy"] })],
    };
    const search = vi.fn(async (query: string) => books[query] ?? []);
    const service = new BookScoutRecommendationService(provider(search));
    const result = await service.recommend(profile);
    expect(search).toHaveBeenCalledTimes(5);
    expect(result.recommendations.length).toBeLessThanOrEqual(5);
    expect(recommendationResultSchema.safeParse(result).success).toBe(true);
    expect(result.recommendations.map((item) => item.book.id)).not.toContain("liked");
    expect(new Set(result.recommendations.map((item) => item.book.id)).size).toBe(result.recommendations.length);
    expect(result.recommendations.every((item) => item.reasons.length > 0 && item.matchScore >= 0 && item.matchScore <= 100)).toBe(true);
    expect(result.recommendations.every((item) => item.bookScoutUrl.startsWith("https://k4connect.vercel.app/book/"))).toBe(true);
  });

  it("rejects invalid input before provider calls", async () => {
    const search = vi.fn(async () => []);
    const service = new BookScoutRecommendationService(provider(search));
    await expect(service.recommend({ interests: [], childName: "Sam" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(search).not.toHaveBeenCalled();
  });
});
