import { describe, expect, it } from "vitest";
import type { Book } from "../connectors/book-scout/book";
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

function service(books: CuratedBookProfile[]): BookScoutRecommendationService {
  return new BookScoutRecommendationService(undefined,
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

  it("collapses curated editions of the same literary work", async () => {
    const first = profile(10, "Greek Myths", ["mythology", "adventure"]);
    const second = profile(11, "Greek Myths (Illustrated Edition)", ["mythology", "adventure"],
      { authors: first.book.authors });
    const result = await service([first, second]).recommend({ interests: ["Greek mythology", "adventure"], limit: 5 });
    expect(result.recommendations).toHaveLength(1);
  });

  it("excludes the liked work and its Lightning Thief editions while preferring curated mythology", async () => {
    const curated = profile(1, "Aru Shah and the End of Time", ["mythology", "adventure"]);
    const result = await service([curated]).recommend({ age: 11, grade: 6,
      readingAbility: "advanced", interests: ["Greek mythology", "adventure"],
      likedBooks: ["The Lightning Thief"], limit: 5 });
    expect(result.recommendations.map((item) => item.book.title)).toEqual([curated.book.title]);
    expect(result.recommendations.every((item) => item.book.id === curated.book.id)).toBe(true);
    expect(result.recommendations[0].reasons.some((reason) => reason.code === "interest_match")).toBe(true);
  });

  it("filters non-English editions and rejects a generic fantasy keyword", async () => {
    const magical = profile(2, "Nevermoor", ["magic", "adventure"]);
    const foreign = profile(17, "Harry Potter e la pietra filosofale", ["magic", "adventure"], { language: "it" });
    const football = profile(18, "Fantasy Football and Mathematics", ["sports"]);
    const result = await service([magical, foreign, football]).recommend({ age: 11, readingAbility: "advanced",
      interests: ["fantasy", "adventure"], likedBooks: ["Harry Potter"], limit: 5 });
    expect(result.recommendations.map((item) => item.book.title)).toEqual(["Nevermoor"]);
  });

  it("keeps little-kids books and adult works out of an advanced eleven-year-old's dinosaur results", async () => {
    const tooYoung = { ...profile(3, "Little Kids Dinosaurs", ["dinosaurs"]),
      readingFit: { maximumAge: { value: 8, provenance }, difficulty: { value: "beginner" as const, provenance } } };
    const adult = profile(19, "Collector's Dinosaur Memoir", ["dinosaurs", "adventure"]);
    adult.readingFit = { minimumAge: { value: 16, provenance } };
    const result = await service([tooYoung, adult]).recommend({ age: 11, readingAbility: "advanced",
      interests: ["dinosaurs", "adventure"], limit: 5 });
    expect(result.recommendations).toEqual([]);
  });

  it("returns three strong curated works when the requested maximum is five", async () => {
    const books = [profile(4, "Myth Quest One", ["mythology", "adventure"]),
      profile(5, "Myth Quest Two", ["mythology", "adventure"]),
      profile(6, "Myth Quest Three", ["mythology", "adventure"])];
    const result = await service(books).recommend({
      age: 11, readingAbility: "advanced", interests: ["mythology", "adventure"], limit: 5,
    });
    expect(result.recommendations).toHaveLength(3);
    expect(new Set(result.recommendations.map((item) => item.book.title)).size).toBe(3);
    expect(result.recommendations.map((item) => item.matchScore)).toEqual(
      [...result.recommendations.map((item) => item.matchScore)].sort((a, b) => b - a));
  });

  it("does not call Google Books when curated results fill the requested maximum", async () => {
    const repository = new FileCuratedCatalogRepository({ schemaVersion: 1, books: [
      profile(7, "First Myth", ["mythology", "adventure"]),
      profile(8, "Second Myth", ["mythology", "adventure"]),
    ] });
    const result = await new BookScoutRecommendationService(undefined, repository).recommend({
      age: 11, readingAbility: "advanced", interests: ["mythology", "adventure"], limit: 2,
    });
    expect(result.recommendations).toHaveLength(2);
  });

  it("returns a successful coverage signal without Google Books-only results", async () => {
    const result = await service([]).recommend({
      age: 11, readingAbility: "advanced", interests: ["Greek mythology", "adventure"], limit: 5,
    });
    expect(result).toEqual({ recommendations: [], coverage: {
      status: "insufficient_curated_match", availableCatalogTopics: [],
    } });
  });

  it("lets a strong approved topic drive an interests-only recommendation", async () => {
    const fantasy = profile(20, "The Enchanted House", ["magic", "adventure"]);
    const result = await service([fantasy]).recommend({ interests: ["fantasy"], limit: 5 });
    expect(result.recommendations.map((item) => item.book.title)).toEqual([fantasy.book.title]);
    expect(result.recommendations[0].reasons.some((reason) => reason.code === "interest_match")).toBe(true);
  });

  it("excludes a liked series while using it as a relationship anchor", async () => {
    const anchor = profile(21, "The Lightning Thief", ["greek-mythology", "adventure"]);
    anchor.series = { name: "Percy Jackson and the Olympians", position: 1, provenance };
    const next = profile(22, "Who Let the Gods Out?", ["greek-mythology", "adventure"]);
    anchor.relationships = [{ sourceBookId: anchor.id, targetBookId: next.id,
      type: "read_next", strength: 0.95, reasons: [], provenance }];
    const result = await service([anchor, next]).recommend({
      age: 11, interests: ["Greek mythology"], likedBooks: ["Percy Jackson"],
    });
    expect(result.recommendations.map((item) => item.book.title)).toEqual([next.book.title]);
    expect(result.recommendations[0].reasons.some((reason) => reason.code === "read_next_relationship")).toBe(true);
  });

  it("never recommends a profile lacking approval", async () => {
    const pending = profile(13, "Unapproved Mythology", ["mythology", "adventure"]);
    delete pending.audit.approvedAt;
    delete pending.audit.approvedBy;
    const result = await service([pending]).recommend({ interests: ["mythology", "adventure"] });
    expect(result.recommendations).toEqual([]);
  });

  it("uses approved read-next relationships and still applies hard age filters", async () => {
    const anchor = profile(14, "The Myth Quest", ["mythology"]);
    const next = profile(15, "The Next Quest", ["ancient-history"]);
    const tooOld = profile(16, "The Adult Quest", ["ancient-history"]);
    tooOld.readingFit = { minimumAge: { value: 16, provenance } };
    anchor.relationships = [next, tooOld].map((target) => ({
      sourceBookId: anchor.id, targetBookId: target.id, type: "read_next" as const,
      strength: 0.95, reasons: [], provenance,
    }));
    const result = await service([anchor, next, tooOld]).recommend({
      age: 11, readingAbility: "advanced", interests: ["ancient history"], likedBooks: [anchor.book.title],
    });
    expect(result.recommendations.map((item) => item.book.title)).toEqual([next.book.title]);
    expect(result.recommendations[0].reasons.some((reason) => reason.code === "read_next_relationship")).toBe(true);
  });

  it("keeps a narrow commerce eligibility hook without asserting availability", async () => {
    const approved = profile(12, "Aru Shah and the End of Time", ["mythology", "adventure"]);
    const repository = new FileCuratedCatalogRepository({ schemaVersion: 1, books: [approved] });
    const service = new BookScoutRecommendationService(undefined, repository, () => false);
    const result = await service.recommend({ interests: ["mythology", "adventure"] });
    expect(result.recommendations).toEqual([]);
  });
});
