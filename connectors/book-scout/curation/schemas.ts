import { z } from "zod";
import { bookSchema } from "../book";
import { readerFitTagIds, topicIds } from "./taxonomy";

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

export const provenanceSchema = z.object({
  sourceType: z.enum(["external", "book_scout_classification", "derived"]),
  source: z.string().trim().min(1).max(120).optional(),
  contributorId: actorIdSchema.optional(),
  assistance: z.literal("ai_assisted").optional(),
  reviewed: z.boolean().optional(),
  reviewerId: actorIdSchema.optional(),
}).strict().refine((item) => item.sourceType !== "external" || Boolean(item.source), {
  message: "External values require a source.",
}).refine((item) => !item.reviewerId || item.reviewed === true, {
  message: "A field reviewer requires reviewed: true.",
}).refine((item) => !item.assistance || item.sourceType === "book_scout_classification", {
  message: "AI assistance applies only to Book Scout classifications.",
});

export const classificationProvenanceSchema = provenanceSchema.refine(
  (item) => item.sourceType === "book_scout_classification",
  { message: "Expected Book Scout classification provenance." },
);

export const topicSchema = z.object({ value: z.enum(topicIds), provenance: classificationProvenanceSchema }).strict();
export const readerFitTagSchema = z.object({ value: z.enum(readerFitTagIds), provenance: classificationProvenanceSchema }).strict();

export const traitIds = [
  "adventure", "action", "humor", "fantasy", "scienceFiction", "mystery",
  "romance", "scary", "violence", "educational", "emotionalIntensity", "reluctantReader",
] as const;
export const traitIdSchema = z.enum(traitIds);
export const classifiedTraitSchema = z.object({
  value: z.number().min(0).max(5),
  provenance: classificationProvenanceSchema,
}).strict();

const sourcedAgeSchema = z.object({ value: z.number().int().min(3).max(19), provenance: provenanceSchema }).strict();
const sourcedGradeSchema = z.object({ value: z.number().int().min(0).max(12), provenance: provenanceSchema }).strict();
const sourcedLexileSchema = z.object({
  value: z.number().int().min(0).max(3000),
  provenance: provenanceSchema.refine((item) => item.sourceType === "external" && item.reviewed === true, {
    message: "Lexile requires a reviewed external source.",
  }),
}).strict();

export const difficultySchema = z.object({
  value: z.enum(["beginner", "average", "advanced"]),
  provenance: classificationProvenanceSchema,
}).strict();

export const readingFitSchema = z.object({
  minimumAge: sourcedAgeSchema.optional(),
  maximumAge: sourcedAgeSchema.optional(),
  minimumGrade: sourcedGradeSchema.optional(),
  maximumGrade: sourcedGradeSchema.optional(),
  lexile: sourcedLexileSchema.optional(),
  difficulty: difficultySchema.optional(),
}).strict().refine((fit) => !fit.minimumAge || !fit.maximumAge || fit.minimumAge.value <= fit.maximumAge.value, {
  message: "Minimum age must not exceed maximum age.",
}).refine((fit) => !fit.minimumGrade || !fit.maximumGrade || fit.minimumGrade.value <= fit.maximumGrade.value, {
  message: "Minimum grade must not exceed maximum grade.",
});

export const relationshipSchema = z.object({
  sourceBookId: catalogIdSchema,
  targetBookId: catalogIdSchema,
  type: z.enum(["similar_to", "read_next"]),
  strength: z.number().min(0).max(1).optional(),
  reasons: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  provenance: classificationProvenanceSchema,
}).strict();

function validIsbn(isbn: string): boolean {
  if (/^\d{13}$/.test(isbn)) {
    const weighted = [...isbn.slice(0, 12)].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0);
    return (10 - weighted % 10) % 10 === Number(isbn[12]);
  }
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const weighted = [...isbn].reduce((sum, digit, index) => sum + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0);
    return weighted % 11 === 0;
  }
  return false;
}

export const curatedBookSchema = bookSchema.refine((book) =>
  /^[a-z][a-z0-9-]*:[A-Za-z0-9_-]{1,100}$/.test(book.id) &&
  (!book.isbn13 || validIsbn(book.isbn13)) && (!book.isbn10 || validIsbn(book.isbn10)), {
  message: "Provider ID or ISBN is malformed.",
});

export const seriesSchema = z.object({
  name: z.string().trim().min(1).max(120),
  position: z.number().int().positive().optional(),
  provenance: classificationProvenanceSchema,
}).strict();

export const curatedBookProfileSchema = z.object({
  id: catalogIdSchema,
  book: curatedBookSchema,
  tier: z.enum(["golden", "core"]).optional(),
  topics: z.array(topicSchema).max(30).default([]),
  readerFitTags: z.array(readerFitTagSchema).max(20).default([]),
  traits: z.partialRecord(traitIdSchema, classifiedTraitSchema).default({}),
  readingFit: readingFitSchema.optional(),
  series: seriesSchema.optional(),
  relationships: z.array(relationshipSchema).max(30).default([]),
  audit: auditSchema,
}).strict();

export type CuratedBookProfile = z.infer<typeof curatedBookProfileSchema>;

export const catalogSeedSchema = z.object({
  id: catalogIdSchema,
  title: z.string().trim().min(1).max(160),
  author: z.string().trim().min(1).max(120),
  state: z.enum(["seeded", "enriched", "needs_review", "approved", "rejected"]),
  book: curatedBookSchema.optional(),
  match: z.object({
    status: z.enum(["matched", "ambiguous", "unresolved"]),
    confidence: z.number().min(0).max(1),
    candidateIds: z.array(z.string().min(1)).max(5).default([]),
  }).strict().optional(),
  audit: auditSchema,
}).strict();

export const catalogSubmissionSchema = z.object({
  id: z.uuid(),
  state: z.enum(["seeded", "enriched", "needs_review", "approved", "rejected"]),
  proposed: curatedBookProfileSchema,
  audit: auditSchema,
}).strict();

export const catalogSourceSchema = z.object({
  schemaVersion: z.literal(1),
  seeds: z.array(catalogSeedSchema).default([]),
  approved: z.array(curatedBookProfileSchema),
  submissions: z.array(catalogSubmissionSchema),
}).strict();

export const runtimeCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  books: z.array(curatedBookProfileSchema),
}).strict();

export type CatalogSeed = z.infer<typeof catalogSeedSchema>;
export type CatalogSource = z.infer<typeof catalogSourceSchema>;
export type RuntimeCatalog = z.infer<typeof runtimeCatalogSchema>;
