import { describe, expect, it, vi } from "vitest";
import type { Book } from "../connectors/book-scout/book";
import type { BookProvider } from "../connectors/book-scout/provider";
import { FileCuratedCatalogRepository } from "../connectors/book-scout/curation/file-repository";
import type { CuratedBookProfile } from "../connectors/book-scout/curation/schemas";
import { normalizedWorkTitle, sameWorkTitle } from "../connectors/book-scout/identity";
import { BookScoutRecommendationService } from "../connectors/book-scout/service";
import { defaultRecommendationConfig, passesHardFilters } from "../connectors/book-scout/scoring";
import { recommendationInputSchema } from "../connectors/book-scout/schemas";

const provenance = { sourceType: "book_scout_classification" as const, assistance: "ai_assisted" as const, reviewed: false };
const timestamp = "2026-09-20T00:00:00.000Z";

function profile(index: number, title: string, topics: string[], extras: Partial<Book> = {}): CuratedBookProfile {
  return {
    id: `bs_00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    book: { id: `google-books:Curated${index}`, title, authors: ["Author " + index],
      subjects: ["Juvenile Fiction"], description: "A carefully described children's story with enough reliable bibliographic detail for consideration.",
      pageCount: 240, language: "en", ...extras },
    tier: "golden", topics: topics.map((value) => ({ value: value as CuratedBookProfile["topics"][number]["value"], provenance })),
    readerFitTags: [], traits: {}, readingFit: { minimumAge: { value: 9, provenance },
      maximumAge: { value: 14, provenance }, difficulty: { value: "advanced", provenance } },
    relationships: [], audit: { createdAt: timestamp, updatedAt: timestamp,
      createdBy: "system:developer", updatedBy: "ai:book-scout-curator",
      approvedAt: timestamp, approvedBy: "ai:book-scout-curator" },
  };
}

function service(books: CuratedBookProfile[], results: Book[]): BookScoutRecommendationService {
  const provider: BookProvider = { search: vi.fn(async () => results), getById: vi.fn(),
    getByISBN: vi.fn(), getByTitle: vi.fn() };
  return new BookScoutRecommendationService(provider, undefined,
    new FileCuratedCatalogRepository({ schemaVersion: 1, books }));
}

function fallback(id: string, title: string, language = "en", subjects = ["Juvenile Fiction"]): Book {
  return { id: `google-books:${id}`, title, authors: ["Fallback Author"], isbn13: "9780141346809",
    subjects, language, pageCount: 250,
    description: "A story for young readers about Greek mythology and adventure, with detailed characters and a complete plot." };
}

describe("quality-first recommendations", () => {
  it("normalizes accents and edition labels conservatively", () => {
    expect(normalizedWorkTitle("Pokémon Adventures")).toBe("pokemon adventures");
    expect(sameWorkTitle("The Lightning Thief", "The Lightning Thief (Disney+ Tie-In Edition)")).toBe(true);
    expect(sameWorkTitle("The Lightning Thief", "The Sea of Monsters")).toBe(false);
    const input = recommendationInputSchema.parse({ interests: ["Pokemon"], dislikedBooks: ["Pokemon Adventures"] });
    expect(passesHardFilters({ book: fallback("pokemon", "Pokémon Adventures"),
      matchedInterests: [], matchedLikedBooks: [] }, input, defaultRecommendationConfig)).toBe(false);
    expect(passesHardFilters({ book: fallback("pokemon-volume", "Pokémon Adventures: Black and White, Vol. 3"),
      matchedInterests: [], matchedLikedBooks: [] }, input, defaultRecommendationConfig)).toBe(false);
  });

  it("collapses separate ISBN editions of the same literary work", async () => {
    const first = fallback("myths-one", "Greek Myths");
    const second = { ...fallback("myths-two", "Greek Myths (Illustrated Edition)"), isbn13: "9780141346816" };
    const result = await service([], [first, second]).recommend({ interests: ["Greek mythology"], limit: 5 });
    expect(result.recommendations).toHaveLength(1);
  });

  it("excludes the liked work and its Lightning Thief editions while preferring curated mythology", async () => {
    const curated = profile(1, "Aru Shah and the End of Time", ["mythology", "adventure"]);
    const editions = [fallback("lightning-a", "The Lightning Thief"),
      fallback("lightning-b", "The Lightning Thief (Illustrated Edition)"),
      fallback("lightning-c", "Percy Jackson and the Lightning Thief")];
    const result = await service([curated], editions).recommend({ age: 11, grade: 6,
      readingAbility: "advanced", interests: ["Greek mythology", "adventure"],
      likedBooks: ["The Lightning Thief"], limit: 5 });
    expect(result.recommendations.map((item) => item.book.title)).toEqual([curated.book.title]);
    expect(result.recommendations[0].reasons.some((reason) => reason.code === "interest_match")).toBe(true);
  });

  it("filters non-English editions and rejects a generic fantasy keyword", async () => {
    const magical = profile(2, "Nevermoor", ["magic", "adventure"]);
    const results = [fallback("italian", "Harry Potter e la pietra filosofale", "it"),
      fallback("spanish", "Harry Potter y la piedra filosofal", "es"),
      fallback("football", "Fantasy Football and Mathematics", "en", ["Juvenile Fiction", "Mathematics"])];
    const result = await service([magical], results).recommend({ age: 11, readingAbility: "advanced",
      interests: ["fantasy", "adventure"], likedBooks: ["Harry Potter"], limit: 5 });
    expect(result.recommendations.map((item) => item.book.title)).toEqual(["Nevermoor"]);
  });

  it("keeps little-kids books and adult works out of an advanced eleven-year-old's dinosaur results", async () => {
    const tooYoung = { ...profile(3, "Little Kids Dinosaurs", ["dinosaurs"]),
      readingFit: { maximumAge: { value: 8, provenance }, difficulty: { value: "beginner" as const, provenance } } };
    const results = [fallback("little", "National Geographic Little Kids First Big Book of Dinosaurs"),
      fallback("memoir", "Villiers; Five Decades of Adventure", "en", ["Biography"]),
      fallback("collector", "Collector's Edition Complete Adventures", "en", ["Adult Fiction"])];
    const result = await service([tooYoung], results).recommend({ age: 11, readingAbility: "advanced",
      interests: ["dinosaurs", "adventure"], limit: 5 });
    expect(result.recommendations).toEqual([]);
  });

  it("returns three strong curated works when the requested maximum is five", async () => {
    const books = [profile(4, "Myth Quest One", ["mythology", "adventure"]),
      profile(5, "Myth Quest Two", ["mythology", "adventure"]),
      profile(6, "Myth Quest Three", ["mythology", "adventure"])];
    const result = await service(books, [fallback("weak", "Adventure")]).recommend({
      age: 11, readingAbility: "advanced", interests: ["mythology", "adventure"], limit: 5,
    });
    expect(result.recommendations).toHaveLength(3);
    expect(new Set(result.recommendations.map((item) => item.book.title)).size).toBe(3);
    expect(result.recommendations.map((item) => item.matchScore)).toEqual(
      [...result.recommendations.map((item) => item.matchScore)].sort((a, b) => b - a));
  });

  it("does not call Google Books when curated results fill the requested maximum", async () => {
    const search = vi.fn(async () => []);
    const provider: BookProvider = { search, getById: vi.fn(), getByISBN: vi.fn(), getByTitle: vi.fn() };
    const repository = new FileCuratedCatalogRepository({ schemaVersion: 1, books: [
      profile(7, "First Myth", ["mythology", "adventure"]),
      profile(8, "Second Myth", ["mythology", "adventure"]),
    ] });
    const result = await new BookScoutRecommendationService(provider, undefined, repository).recommend({
      age: 11, readingAbility: "advanced", interests: ["mythology", "adventure"], limit: 2,
    });
    expect(result.recommendations).toHaveLength(2);
    expect(search).not.toHaveBeenCalled();
  });
});
