import { describe, expect, it } from "vitest";
import runtimeCatalog from "../data/books/catalog.json";
import { BookScoutRecommendationService } from "../connectors/book-scout/service";
import { sameWork } from "../connectors/book-scout/identity";

const approved = new Map(runtimeCatalog.books.map((profile) => [profile.book.id, profile]));
const service = new BookScoutRecommendationService();

describe("approved catalog coverage", () => {
  it("serves Percy Jackson readers with distinct approved read-next works", async () => {
    const result = await service.recommend({ age: 11, grade: 6, readingAbility: "advanced",
      interests: ["Greek mythology", "adventure"], likedBooks: ["Percy Jackson"],
      preferSeries: true, limit: 5 });
    expect(result.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(result.recommendations.length).toBeLessThanOrEqual(5);
    expect(result.recommendations.some((item) => item.book.title.includes("Lightning Thief"))).toBe(false);
    expect(result.recommendations.every((item) => approved.has(item.book.id))).toBe(true);
    expect(result.recommendations.some((item) => item.reasons.some((reason) =>
      reason.code === "read_next_relationship"))).toBe(true);
    for (let i = 0; i < result.recommendations.length; i++) {
      for (let j = i + 1; j < result.recommendations.length; j++) {
        expect(sameWork(result.recommendations[i].book, result.recommendations[j].book)).toBe(false);
      }
    }
  });

  it("uses interests without a liked book and keeps dinosaur results on topic", async () => {
    const fantasy = await service.recommend({ age: 11, grade: 6,
      readingAbility: "advanced", interests: ["fantasy"], limit: 5 });
    expect(fantasy.recommendations.length).toBeGreaterThan(0);
    expect(fantasy.recommendations.every((item) => approved.has(item.book.id))).toBe(true);

    const greek = await service.recommend({ age: 11, grade: 6,
      readingAbility: "advanced", interests: ["Greek mythology"], limit: 5 });
    expect(greek.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(greek.recommendations.every((item) => approved.has(item.book.id))).toBe(true);

    const dinosaurs = await service.recommend({ age: 11, grade: 6,
      readingAbility: "advanced", interests: ["dinosaurs", "adventure"], limit: 5 });
    expect(dinosaurs.recommendations.length).toBeGreaterThan(0);
    expect(dinosaurs.recommendations.length).toBeLessThan(5);
    expect(dinosaurs.recommendations.every((item) => approved.get(item.book.id)?.topics.some((topic) =>
      topic.value === "dinosaurs"))).toBe(true);
  });

  it("returns a truthful catalog hint for a genuine gap", async () => {
    const result = await service.recommend({ age: 11, readingAbility: "advanced",
      interests: ["underwater basket weaving"], limit: 5 });
    expect(result.recommendations).toEqual([]);
    expect(result.coverage).toMatchObject({ status: "insufficient_curated_match",
      availableCatalogTopics: expect.arrayContaining(["adventure"]) });
  });

  it("covers newly curated interests using approved, on-topic books", async () => {
    for (const [interest, topic] of [
      ["music", "music"], ["coding", "coding"], ["engineering", "engineering"],
      ["track and field", "track-and-field"], ["climate change", "climate"],
    ]) {
      const result = await service.recommend({ age: 11, grade: 6, readingAbility: "average",
        interests: [interest], limit: 5 });
      expect(result.recommendations.length, interest).toBeGreaterThan(0);
      expect(result.recommendations.every((item) => approved.get(item.book.id)?.topics.some((entry) =>
        entry.value === topic)), interest).toBe(true);
    }
  });
});
