import { randomUUID } from "node:crypto";
import { bookSchema, type Book } from "../book";
import { actorIdSchema, catalogSourceSchema, curatedBookProfileSchema, runtimeCatalogSchema, type CatalogSource, type CuratedBookProfile, type RuntimeCatalog } from "./schemas";

function setFieldReview(profile: CuratedBookProfile, reviewerId?: string): CuratedBookProfile {
  const provenance = (item: { sourceType: "book_scout_classification"; contributorId?: string }) => ({
    sourceType: item.sourceType,
    ...(item.contributorId ? { contributorId: item.contributorId } : {}),
    reviewed: reviewerId !== undefined,
    ...(reviewerId ? { reviewerId } : {}),
  });
  return {
    ...profile,
    topics: profile.topics.map((topic) => ({ ...topic, provenance: provenance(topic.provenance) })),
    series: profile.series ? { ...profile.series, provenance: provenance(profile.series.provenance) } : undefined,
    relationships: profile.relationships.map((item) => ({ ...item, provenance: provenance(item.provenance) })),
  };
}

export class CuratedCatalogService {
  createDraft(book: Book, actorId: string, now = new Date()): CuratedBookProfile {
    const actor = actorIdSchema.parse(actorId);
    return curatedBookProfileSchema.parse({
      id: `bs_${randomUUID()}`,
      book: bookSchema.parse(book),
      topics: [],
      relationships: [],
      audit: {
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        createdBy: actor,
        updatedBy: actor,
      },
    });
  }

  submit(source: unknown, proposed: unknown, actorId: string, now = new Date()): CatalogSource {
    const catalog = catalogSourceSchema.parse(source);
    const profile = curatedBookProfileSchema.parse(proposed);
    const actor = actorIdSchema.parse(actorId);
    if (catalog.submissions.some((item) => item.proposed.id === profile.id && item.state !== "rejected" && item.state !== "approved")) {
      throw new Error("An open submission already exists for this catalog ID.");
    }
    const proposedForReview = curatedBookProfileSchema.parse({
      ...setFieldReview(profile),
      audit: {
        createdAt: profile.audit.createdAt,
        createdBy: profile.audit.createdBy,
        updatedAt: now.toISOString(),
        updatedBy: actor,
      },
    });
    return catalogSourceSchema.parse({
      ...catalog,
      submissions: [...catalog.submissions, {
        id: randomUUID(),
        state: "needs_review",
        proposed: proposedForReview,
        audit: {
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          createdBy: actor,
          updatedBy: actor,
        },
      }],
    });
  }

  reject(source: unknown, submissionId: string, reviewerId: string, now = new Date()): CatalogSource {
    const catalog = catalogSourceSchema.parse(source);
    const reviewer = actorIdSchema.parse(reviewerId);
    const submission = catalog.submissions.find((item) => item.id === submissionId);
    if (!submission || submission.state !== "needs_review") throw new Error("Submission is not ready for rejection.");
    const timestamp = now.toISOString();
    return catalogSourceSchema.parse({
      ...catalog,
      submissions: catalog.submissions.map((item) => item.id === submissionId ? {
        ...item,
        state: "rejected",
        audit: { ...item.audit, updatedAt: timestamp, updatedBy: reviewer, reviewedAt: timestamp, reviewedBy: reviewer },
      } : item),
    });
  }

  approve(source: unknown, submissionId: string, reviewerId: string, now = new Date()): CatalogSource {
    const catalog = catalogSourceSchema.parse(source);
    const reviewer = actorIdSchema.parse(reviewerId);
    const submission = catalog.submissions.find((item) => item.id === submissionId);
    if (!submission || submission.state !== "needs_review") throw new Error("Submission is not ready for approval.");
    const timestamp = now.toISOString();
    const approved = curatedBookProfileSchema.parse({
      ...setFieldReview(submission.proposed, reviewer),
      audit: {
        ...submission.proposed.audit,
        updatedAt: timestamp,
        updatedBy: reviewer,
        reviewedAt: timestamp,
        reviewedBy: reviewer,
      },
    });
    return catalogSourceSchema.parse({
      ...catalog,
      approved: [...catalog.approved.filter((item) => item.id !== approved.id), approved],
      submissions: catalog.submissions.map((item) => item.id === submissionId ? {
        ...item,
        state: "approved",
        audit: { ...item.audit, updatedAt: timestamp, updatedBy: reviewer, reviewedAt: timestamp, reviewedBy: reviewer },
      } : item),
    });
  }

  build(source: unknown): RuntimeCatalog {
    const catalog = catalogSourceSchema.parse(source);
    const ids = new Set<string>();
    for (const profile of catalog.approved) {
      if (ids.has(profile.id)) throw new Error(`Duplicate approved catalog ID: ${profile.id}`);
      if (!profile.audit.reviewedAt || !profile.audit.reviewedBy) {
        throw new Error(`Approved catalog record lacks review metadata: ${profile.id}`);
      }
      ids.add(profile.id);
    }
    return runtimeCatalogSchema.parse({ schemaVersion: 1, books: catalog.approved });
  }
}
