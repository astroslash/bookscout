import { describe, expect, it } from "vitest";
import type { Book } from "../connectors/book-scout/book";
import { FileCuratedCatalogRepository } from "../connectors/book-scout/curation/file-repository";
import { CuratedCatalogService } from "../connectors/book-scout/curation/service";
import { BookScoutRecommendationService } from "../connectors/book-scout/service";

const now = new Date("2026-01-01T00:00:00.000Z");
const book: Book = { id: "google-books:volume-1", title: "A Book", authors: ["A Writer"], subjects: [], pageCount: 200 };
const emptySource = { schemaVersion: 1, approved: [], submissions: [] };
const service = new CuratedCatalogService();

describe("curated catalog foundation", () => {
  it("creates opaque IDs, keeps proposals separate, and promotes only after review", () => {
    const draft = service.createDraft(book, "system:developer", now);
    expect(draft.id).toMatch(/^bs_[0-9a-f-]{36}$/);
    expect(draft.id).not.toContain(book.id);
    const proposed = { ...draft, topics: [{ value: "mythology", provenance: {
      sourceType: "book_scout_classification" as const,
      contributorId: "curator_001",
    } }] };
    const submitted = service.submit(emptySource, proposed, "curator_001", now);
    expect(submitted.submissions[0].proposed.topics[0].provenance.reviewed).toBe(false);
    expect(service.build(submitted).books).toEqual([]);
    const submissionId = submitted.submissions[0].id;
    const approved = service.approve(submitted, submissionId, "human:reviewer_001", now);
    expect(approved.submissions[0].state).toBe("approved");
    expect(service.build(approved).books).toHaveLength(1);
    expect(service.build(approved).books[0].audit.reviewedBy).toBe("human:reviewer_001");
    expect(service.build(approved).books[0].topics[0].provenance).toMatchObject({ reviewed: true, reviewerId: "human:reviewer_001" });
  });

  it("does not let a proposed revision overwrite approved data", () => {
    const draft = service.createDraft(book, "system:developer", now);
    const first = service.submit(emptySource, draft, "system:developer", now);
    const approved = service.approve(first, first.submissions[0].id, "human:reviewer_001", now);
    const revised = service.submit(approved, { ...approved.approved[0], topics: [{
      value: "adventure", provenance: { sourceType: "book_scout_classification" },
    }] }, "curator_001", now);
    expect(revised.submissions[1].proposed.audit.reviewedBy).toBeUndefined();
    expect(revised.submissions[1].proposed.audit.updatedBy).toBe("curator_001");
    expect(service.build(revised).books[0].topics).toEqual([]);
    expect(service.build(service.approve(revised, revised.submissions[1].id, "human:reviewer_001", now)).books[0].topics[0].value)
      .toBe("adventure");
  });

  it("rejects a submission without changing approved data", () => {
    const draft = service.createDraft(book, "system:developer", now);
    const submitted = service.submit(emptySource, draft, "system:developer", now);
    const rejected = service.reject(submitted, submitted.submissions[0].id, "human:reviewer_001", now);
    expect(rejected.submissions[0].state).toBe("rejected");
    expect(service.build(rejected).books).toEqual([]);
    expect(() => service.approve(rejected, rejected.submissions[0].id, "human:reviewer_001", now)).toThrow();
  });

  it("reads only approved records through the repository", async () => {
    const draft = service.createDraft({ ...book, isbn13: "9781234567897" }, "system:developer", now);
    const pending = service.submit(emptySource, draft, "system:developer", now);
    const approved = service.build(service.approve(pending, pending.submissions[0].id, "human:reviewer_001", now));
    const repository = new FileCuratedCatalogRepository(approved);
    expect((await repository.getById(draft.id))?.book.title).toBe("A Book");
    expect((await repository.getByIsbn("978-1-2345-6789-7"))?.id).toBe(draft.id);
    expect((await repository.findByTitleAuthor("a book", "a writer"))?.id).toBe(draft.id);
    const records = await repository.listApproved();
    records[0].book.title = "Mutated";
    expect((await repository.getById(draft.id))?.book.title).toBe("A Book");
  });

  it("uses approved topics in recommendations without depending on a file format", async () => {
    const draft = service.createDraft(book, "system:developer", now);
    const pending = service.submit(emptySource, { ...draft, topics: [{
      value: "mythology", provenance: { sourceType: "book_scout_classification" },
    }] }, "system:developer", now);
    const approved = service.build(service.approve(pending, pending.submissions[0].id, "human:reviewer_001", now));
    const repository = new FileCuratedCatalogRepository(approved);
    const result = await new BookScoutRecommendationService(undefined, repository).recommend({ interests: ["mythology"] });
    expect(result.recommendations[0].book.subjects).toEqual([]);
    expect(result.recommendations[0].reasons.some((reason) => reason.code === "interest_match")).toBe(true);
  });

  it("rejects duplicate approved identities and malformed personal attribution", () => {
    const draft = service.createDraft(book, "system:developer", now);
    const pending = service.submit(emptySource, draft, "system:developer", now);
    const approved = service.approve(pending, pending.submissions[0].id, "human:reviewer_001", now);
    expect(() => service.build({ ...approved, approved: [approved.approved[0], approved.approved[0]] }))
      .toThrow(/Duplicate approved catalog ID/);
    expect(() => service.createDraft(book, "someone@example.com", now)).toThrow();
  });
});
