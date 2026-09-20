import { describe, expect, it } from "vitest";
import approval from "../data/books/teacher-expansion.approval.json";
import source from "../data/books/catalog.source.json";
import runtime from "../data/books/catalog.json";

const key = (value: string) => value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

describe("teacher-led approved catalog", () => {
  it("keeps production approvals tied to verified English editions and truthful AI provenance", () => {
    expect(approval.books).toHaveLength(90);
    expect(runtime.books.length).toBeGreaterThanOrEqual(170);
    const production = new Map(runtime.books.map((profile) => [profile.id, profile]));
    for (const proposal of approval.books) {
      const seed = source.seeds.find((item) => key(item.title) === key(proposal.title) &&
        key(item.author) === key(proposal.author));
      expect(seed, proposal.ref).toBeDefined();
      expect(seed?.state, proposal.ref).toBe("approved");
      expect(seed?.match?.status, proposal.ref).toBe("matched");
      expect(seed?.book?.language, proposal.ref).toBe("en");
      const profile = production.get(seed!.id);
      expect(profile, proposal.ref).toBeDefined();
      expect(profile?.audit.approvedBy, proposal.ref).toBe("ai:book-scout-curator");
      expect(profile?.audit).not.toHaveProperty("reviewedBy");
      for (const topic of profile!.topics) {
        expect(topic.provenance).toMatchObject({ sourceType: "book_scout_classification",
          assistance: "ai_assisted", reviewed: false });
        expect("source" in topic.provenance && topic.provenance.source).toMatch(/^https:\/\//);
      }
    }
  });
});
