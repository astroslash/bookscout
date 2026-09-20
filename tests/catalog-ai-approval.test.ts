import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { approveReadyAiImport, stageImportSeeds, submitImport } from "../connectors/book-scout/curation/import";
import { CuratedCatalogService } from "../connectors/book-scout/curation/service";

const service = new CuratedCatalogService();
const now = new Date("2026-01-01T00:00:00.000Z");
const source = { schemaVersion: 1, seeds: [], submissions: [], approved: [] };
const proposal = JSON.parse(readFileSync(resolve("docs/CATALOG_DATA_TEMPLATE.json"), "utf8")) as unknown;
const aiActor = "ai:book-scout-curator";
const humanActor = "human:owner";

describe("truthful catalog approval", () => {
  it("separates AI production approval from later human review", () => {
    const staged = service.addSeed(source, "Example Book", "Example Author", "system:developer", now);
    const book = { id: "google-books:ExampleVolume1", title: "Example Book",
      authors: ["Example Author"], subjects: [] };
    const matched = service.validate({ ...staged, seeds: [{ ...staged.seeds[0], state: "enriched", book,
      match: { status: "matched", confidence: 1, candidateIds: [book.id] } }] });
    const draft = service.createDraft(book, "system:developer", now, matched.seeds[0].id);
    const proposed = { ...draft, topics: [{ value: "mythology" as const, provenance: {
      sourceType: "book_scout_classification" as const, assistance: "ai_assisted" as const, reviewed: false,
    } }] };
    const submitted = service.submit(matched, proposed, "system:developer", now);
    expect(() => service.approve({ ...submitted, seeds: submitted.seeds.map((seed) => ({
      ...seed, match: { status: "ambiguous", confidence: 1, candidateIds: [book.id] },
    })) }, submitted.submissions[0].id, aiActor, now)).toThrow(/resolved Google Books seed/);
    const approved = service.approve(submitted, submitted.submissions[0].id, aiActor, now);
    const profile = approved.approved[0];
    expect(profile.id).toBe(draft.id);
    expect(profile.audit).toMatchObject({ approvedBy: aiActor, approvedAt: now.toISOString() });
    expect(profile.audit.reviewedBy).toBeUndefined();
    expect(profile.topics[0].provenance).toMatchObject({ assistance: "ai_assisted", reviewed: false });
    expect(profile.topics[0].provenance.reviewerId).toBeUndefined();
    expect(service.build(approved).books).toHaveLength(1);

    const humanReviewed = service.markHumanReviewed(approved, draft.id, humanActor, now).approved[0];
    expect(humanReviewed.audit.approvedBy).toBe(aiActor);
    expect(humanReviewed.audit.reviewedBy).toBe(humanActor);
    expect(humanReviewed.topics[0].provenance).toMatchObject({
      assistance: "ai_assisted", reviewed: true, reviewerId: humanActor,
    });
    expect(() => service.approve(submitted, submitted.submissions[0].id, "reviewer_001", now))
      .toThrow(/ai: or human:/);
    expect(() => service.markHumanReviewed(approved, draft.id, aiActor, now)).toThrow(/human:/);
    expect(() => service.validate({ ...approved, approved: [{ ...profile, topics: [{
      ...profile.topics[0], provenance: { ...profile.topics[0].provenance, reviewed: true },
    }] }] })).toThrow(/falsely claims human review/);
  });

  it("bulk approves only matched AI proposals and reports every skipped entry", () => {
    const staged = stageImportSeeds(source, proposal, service, now).source;
    const prepared = service.validate({ ...staged, seeds: staged.seeds.map((seed, index) => index < 2 ? {
      ...seed, state: "enriched",
      book: { id: `google-books:Example${index}`, title: seed.title, authors: [seed.author], subjects: [] },
      match: { status: "matched", confidence: 1, candidateIds: [`google-books:Example${index}`] },
    } : index === 2 ? { ...seed, state: "needs_review",
      match: { status: "ambiguous", confidence: 0.9, candidateIds: ["google-books:OtherEdition"] },
    } : seed) });
    const submitted = submitImport(prepared, proposal, service, now);
    expect(submitted.submitted).toBe(2);
    expect(submitted.source.approved).toHaveLength(0);
    expect(() => approveReadyAiImport(submitted.source, proposal, humanActor, service, now))
      .toThrow(/must start with ai:/);
    const batch = approveReadyAiImport(submitted.source, proposal, aiActor, service, now);
    expect(batch.approved.map((item) => item.ref)).toEqual(["example-quest-one", "example-quest-two"]);
    expect(batch.skipped.map((item) => item.ref)).toEqual(["example-history-book", "example-mystery-book"]);
    expect(batch.skipped.every((item) => /unresolved or ambiguous/.test(item.reason))).toBe(true);
    expect(batch.source.approved).toHaveLength(2);
    expect(batch.source.approved.every((item) => item.audit.approvedBy === aiActor &&
      item.audit.reviewedAt === undefined)).toBe(true);
    expect(submitted.source.approved).toEqual([]);

    const secondPass = submitImport(batch.source, proposal, service, now);
    expect(secondPass.submitted).toBe(1);
    const relationships = approveReadyAiImport(secondPass.source, proposal, aiActor, service, now);
    expect(relationships.approved).toHaveLength(1);
    expect(relationships.source.approved.find((item) => item.id === batch.approved[0].catalogId)?.relationships)
      .toMatchObject([{ type: "read_next", targetBookId: batch.approved[1].catalogId }]);
    expect(submitImport(relationships.source, proposal, service, now).submitted).toBe(0);
  });

  it("skips a conflicting approval without corrupting the batch", () => {
    const staged = stageImportSeeds(source, proposal, service, now).source;
    const prepared = service.validate({ ...staged, seeds: staged.seeds.map((seed, index) => index < 2 ? {
      ...seed, state: "enriched",
      book: { id: `google-books:Duplicate${index}`, title: seed.title,
        authors: [seed.author], subjects: [], isbn13: "9780000000002" },
      match: { status: "matched", confidence: 1, candidateIds: [`google-books:Duplicate${index}`] },
    } : seed) });
    const submitted = submitImport(prepared, proposal, service, now).source;
    const batch = approveReadyAiImport(submitted, proposal, aiActor, service, now);
    expect(batch.approved).toHaveLength(1);
    expect(batch.skipped.find((item) => item.ref === "example-quest-two")?.reason)
      .toMatch(/Duplicate approved ISBN/);
    expect(service.build(batch.source).books).toHaveLength(1);
  });
});
