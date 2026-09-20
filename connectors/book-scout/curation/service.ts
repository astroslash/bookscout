import { randomUUID } from "node:crypto";
import { bookSchema, type Book } from "../book";
import type { BookProvider } from "../provider";
import { matchProviderCandidates, type MatchThresholds } from "./matching";
import { catalogWords } from "./repository";
import { actorIdSchema, catalogSourceSchema, curatedBookProfileSchema, runtimeCatalogSchema,
  type CatalogSource, type CuratedBookProfile, type RuntimeCatalog } from "./schemas";
import { normalizeReaderFitTag, normalizeTopic } from "./taxonomy";

function setFieldReview(profile: CuratedBookProfile, reviewerId?: string): CuratedBookProfile {
  const copy = structuredClone(profile);
  const update = (item: { sourceType: string; reviewed?: boolean; reviewerId?: string }) => {
    if (item.sourceType !== "book_scout_classification") return;
    item.reviewed = reviewerId !== undefined;
    if (reviewerId) item.reviewerId = reviewerId;
    else delete item.reviewerId;
  };
  for (const item of copy.topics) update(item.provenance);
  for (const item of copy.readerFitTags) update(item.provenance);
  for (const item of Object.values(copy.traits)) if (item) update(item.provenance);
  for (const item of copy.relationships) update(item.provenance);
  if (copy.series) update(copy.series.provenance);
  if (copy.readingFit) {
    for (const item of [copy.readingFit.minimumAge, copy.readingFit.maximumAge,
      copy.readingFit.minimumGrade, copy.readingFit.maximumGrade,
      copy.readingFit.lexile, copy.readingFit.difficulty]) {
      if (item) update(item.provenance);
    }
  }
  return curatedBookProfileSchema.parse(copy);
}

function titleAuthorKey(title: string, author: string): string {
  return `${catalogWords(title)}|${catalogWords(author)}`;
}

export class CuratedCatalogService {
  createDraft(book: Book, actorId: string, now = new Date(), id = `bs_${randomUUID()}`): CuratedBookProfile {
    const actor = actorIdSchema.parse(actorId);
    return curatedBookProfileSchema.parse({
      id,
      book: bookSchema.parse(book),
      audit: {
        createdAt: now.toISOString(), updatedAt: now.toISOString(), createdBy: actor, updatedBy: actor,
      },
    });
  }

  addSeed(source: unknown, title: string, author: string, actorId = "system:developer", now = new Date()): CatalogSource {
    const catalog = this.validate(source);
    const actor = actorIdSchema.parse(actorId);
    const key = titleAuthorKey(title, author);
    if (catalog.seeds.some((item) => titleAuthorKey(item.title, item.author) === key) ||
      catalog.approved.some((item) => titleAuthorKey(item.book.title, item.book.authors[0] ?? "") === key)) {
      throw new Error("Catalog already contains that title and author.");
    }
    return catalogSourceSchema.parse({ ...catalog, seeds: [...catalog.seeds, {
      id: `bs_${randomUUID()}`,
      title, author, state: "seeded",
      audit: { createdAt: now.toISOString(), updatedAt: now.toISOString(), createdBy: actor, updatedBy: actor },
    }] });
  }

  async enrichSeed(source: unknown, seedId: string, provider: BookProvider,
    thresholds?: MatchThresholds, now = new Date()): Promise<CatalogSource> {
    const catalog = this.validate(source);
    const seed = catalog.seeds.find((item) => item.id === seedId);
    if (!seed || seed.state === "approved" || seed.state === "rejected") {
      throw new Error("Seed is unavailable for enrichment.");
    }
    const exactQuery = `intitle:"${seed.title.replace(/["\\]/g, " ")}" inauthor:"${seed.author.replace(/["\\]/g, " ")}"`;
    const query = exactQuery.length <= 200 ? exactQuery : seed.title;
    let found = await provider.search(query);
    if (!found.length && query !== seed.title) found = await provider.search(seed.title);
    const match = matchProviderCandidates(seed, found, thresholds);
    const { book, ...diagnostic } = match;
    return catalogSourceSchema.parse({
      ...catalog,
      seeds: catalog.seeds.map((item) => item.id === seedId ? {
        ...item,
        state: match.status === "matched" ? "enriched" : match.status === "ambiguous" ? "needs_review" : "seeded",
        book,
        match: diagnostic,
        audit: { ...item.audit, updatedAt: now.toISOString(), updatedBy: "system:developer" },
      } : item),
    });
  }

  normalizeTopics(values: string[]): string[] {
    return values.map((value) => {
      const topic = normalizeTopic(value);
      if (!topic) throw new Error(`Unknown catalog topic: ${value}`);
      return topic;
    });
  }

  normalizeReaderFitTags(values: string[]): string[] {
    return values.map((value) => {
      const tag = normalizeReaderFitTag(value);
      if (!tag) throw new Error(`Unknown reader-fit tag: ${value}`);
      return tag;
    });
  }

  submit(source: unknown, proposed: unknown, actorId: string, now = new Date()): CatalogSource {
    const catalog = this.validate(source);
    const profile = curatedBookProfileSchema.parse(proposed);
    const actor = actorIdSchema.parse(actorId);
    if (catalog.submissions.some((item) => item.proposed.id === profile.id &&
      item.state !== "rejected" && item.state !== "approved")) {
      throw new Error("An open submission already exists for this catalog ID.");
    }
    const proposedForReview = curatedBookProfileSchema.parse({
      ...setFieldReview(profile),
      audit: {
        createdAt: profile.audit.createdAt, createdBy: profile.audit.createdBy,
        updatedAt: now.toISOString(), updatedBy: actor,
      },
    });
    return catalogSourceSchema.parse({
      ...catalog,
      seeds: catalog.seeds.map((seed) => seed.id === profile.id && seed.state !== "approved"
        ? { ...seed, state: "needs_review" } : seed),
      submissions: [...catalog.submissions, {
        id: randomUUID(), state: "needs_review", proposed: proposedForReview,
        audit: { createdAt: now.toISOString(), updatedAt: now.toISOString(), createdBy: actor, updatedBy: actor },
      }],
    });
  }

  approve(source: unknown, submissionId: string, reviewerId: string, now = new Date()): CatalogSource {
    const catalog = this.validate(source);
    const reviewer = actorIdSchema.parse(reviewerId);
    const submission = catalog.submissions.find((item) => item.id === submissionId);
    if (!submission || submission.state !== "needs_review") throw new Error("Submission is not ready for approval.");
    const timestamp = now.toISOString();
    const approved = curatedBookProfileSchema.parse({
      ...setFieldReview(submission.proposed, reviewer),
      audit: { ...submission.proposed.audit, updatedAt: timestamp, updatedBy: reviewer,
        reviewedAt: timestamp, reviewedBy: reviewer },
    });
    return this.validate({
      ...catalog,
      seeds: catalog.seeds.map((seed) => seed.id === approved.id ? { ...seed, state: "approved" } : seed),
      approved: [...catalog.approved.filter((item) => item.id !== approved.id), approved],
      submissions: catalog.submissions.map((item) => item.id === submissionId ? {
        ...item, state: "approved",
        audit: { ...item.audit, updatedAt: timestamp, updatedBy: reviewer,
          reviewedAt: timestamp, reviewedBy: reviewer },
      } : item),
    });
  }

  reject(source: unknown, submissionId: string, reviewerId: string, now = new Date()): CatalogSource {
    const catalog = this.validate(source);
    const reviewer = actorIdSchema.parse(reviewerId);
    const submission = catalog.submissions.find((item) => item.id === submissionId);
    if (!submission || submission.state !== "needs_review") throw new Error("Submission is not ready for rejection.");
    const timestamp = now.toISOString();
    return this.validate({
      ...catalog,
      seeds: catalog.seeds.map((seed) => seed.id === submission.proposed.id &&
        !catalog.approved.some((item) => item.id === seed.id) ? { ...seed, state: "rejected" } : seed),
      submissions: catalog.submissions.map((item) => item.id === submissionId ? {
        ...item, state: "rejected",
        audit: { ...item.audit, updatedAt: timestamp, updatedBy: reviewer,
          reviewedAt: timestamp, reviewedBy: reviewer },
      } : item),
    });
  }

  validate(source: unknown): CatalogSource {
    const catalog = catalogSourceSchema.parse(source);
    const seedIds = new Set<string>();
    const seedNames = new Set<string>();
    for (const seed of catalog.seeds) {
      if (seedIds.has(seed.id)) throw new Error(`Duplicate seed ID: ${seed.id}`);
      seedIds.add(seed.id);
      const key = titleAuthorKey(seed.title, seed.author);
      if (seedNames.has(key)) throw new Error(`Duplicate seed title/author: ${key}`);
      seedNames.add(key);
      if (seed.book && !/^[a-z][a-z0-9-]*:[A-Za-z0-9_-]{1,100}$/.test(seed.book.id)) {
        throw new Error(`Malformed provider ID for seed: ${seed.id}`);
      }
    }
    const approvedIds = new Set<string>();
    const isbns = new Set<string>();
    const names = new Set<string>();
    for (const profile of catalog.approved) {
      if (approvedIds.has(profile.id)) throw new Error(`Duplicate approved catalog ID: ${profile.id}`);
      approvedIds.add(profile.id);
      if (!profile.audit.reviewedAt || !profile.audit.reviewedBy) {
        throw new Error(`Approved catalog record lacks review metadata: ${profile.id}`);
      }
      for (const isbn of [profile.book.isbn13, profile.book.isbn10]) {
        if (!isbn) continue;
        if (isbns.has(isbn)) throw new Error(`Duplicate approved ISBN: ${isbn}`);
        isbns.add(isbn);
      }
      const key = titleAuthorKey(profile.book.title, profile.book.authors[0] ?? "");
      if (names.has(key)) throw new Error(`Duplicate approved title/author: ${key}`);
      names.add(key);
    }
    const relationships = new Set<string>();
    for (const profile of catalog.approved) {
      for (const relation of profile.relationships) {
        if (relation.sourceBookId !== profile.id) throw new Error("Relationship source does not match its book.");
        if (relation.sourceBookId === relation.targetBookId) throw new Error("Self relationship is invalid.");
        if (!approvedIds.has(relation.targetBookId)) throw new Error(`Broken relationship target: ${relation.targetBookId}`);
        const pair = relation.type === "similar_to"
          ? [relation.sourceBookId, relation.targetBookId].sort().join(":")
          : `${relation.sourceBookId}:${relation.targetBookId}`;
        const key = `${relation.type}:${pair}`;
        if (relationships.has(key)) throw new Error(`Duplicate relationship: ${key}`);
        relationships.add(key);
      }
    }
    return catalog;
  }

  build(source: unknown): RuntimeCatalog {
    const catalog = this.validate(source);
    return runtimeCatalogSchema.parse({
      schemaVersion: 1,
      books: [...catalog.approved].sort((a, b) => a.id.localeCompare(b.id)),
    });
  }

  stats(source: unknown) {
    const catalog = this.validate(source);
    const count = (state: CatalogSource["seeds"][number]["state"]) =>
      catalog.seeds.filter((seed) => seed.state === state).length;
    const approved = catalog.approved;
    return {
      totalSeeds: catalog.seeds.length,
      seeded: count("seeded"), enriched: count("enriched"),
      needsReview: count("needs_review"), approved: approved.length, rejected: count("rejected"),
      golden: approved.filter((item) => item.tier === "golden").length,
      core: approved.filter((item) => item.tier === "core").length,
      isbnCoverage: approved.filter((item) => item.book.isbn13 || item.book.isbn10).length,
      classificationCoverage: approved.filter((item) => item.topics.length || item.readerFitTags.length ||
        Object.keys(item.traits).length || item.readingFit || item.series).length,
      relationshipCoverage: approved.filter((item) => item.relationships.length).length,
      unresolvedProviderMatches: catalog.seeds.filter((item) => item.state !== "approved" &&
        item.match?.status !== "matched").length,
    };
  }
}
