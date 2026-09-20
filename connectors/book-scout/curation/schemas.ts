import { z } from "zod";
import { bookSchema } from "../book";

export const catalogIdSchema = z.string().regex(/^bs_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const actorIdSchema = z.string().regex(/^[a-z][a-z0-9:_-]{2,63}$/);
const timestampSchema = z.iso.datetime();

export const auditSchema = z.object({
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  createdBy: actorIdSchema,
  updatedBy: actorIdSchema,
  reviewedAt: timestampSchema.optional(),
  reviewedBy: actorIdSchema.optional(),
}).strict().refine((audit) => Boolean(audit.reviewedAt) === Boolean(audit.reviewedBy), {
  message: "Review timestamp and reviewer ID must be supplied together.",
});

export const classificationProvenanceSchema = z.object({
  sourceType: z.literal("book_scout_classification"),
  contributorId: actorIdSchema.optional(),
  reviewed: z.boolean().optional(),
  reviewerId: actorIdSchema.optional(),
}).strict().refine((item) => !item.reviewerId || item.reviewed === true, {
  message: "A field reviewer requires reviewed: true.",
});

const topicSchema = z.object({
  value: z.string().trim().min(1).max(80),
  provenance: classificationProvenanceSchema,
}).strict();

export const curatedBookProfileSchema = z.object({
  id: catalogIdSchema,
  book: bookSchema,
  topics: z.array(topicSchema).max(30).default([]),
  series: z.object({
    name: z.string().trim().min(1).max(120),
    position: z.number().positive().optional(),
    provenance: classificationProvenanceSchema,
  }).strict().optional(),
  relationships: z.array(z.object({
    targetId: catalogIdSchema,
    type: z.enum(["similar", "same_series"]),
    provenance: classificationProvenanceSchema,
  }).strict()).max(30).default([]),
  audit: auditSchema,
}).strict();

export type CuratedBookProfile = z.infer<typeof curatedBookProfileSchema>;

export const catalogSubmissionSchema = z.object({
  id: z.uuid(),
  state: z.enum(["seeded", "enriched", "needs_review", "approved", "rejected"]),
  proposed: curatedBookProfileSchema,
  audit: auditSchema,
}).strict();

export const catalogSourceSchema = z.object({
  schemaVersion: z.literal(1),
  approved: z.array(curatedBookProfileSchema),
  submissions: z.array(catalogSubmissionSchema),
}).strict();

export const runtimeCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  books: z.array(curatedBookProfileSchema),
}).strict();

export type CatalogSource = z.infer<typeof catalogSourceSchema>;
export type RuntimeCatalog = z.infer<typeof runtimeCatalogSchema>;
