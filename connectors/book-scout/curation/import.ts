import { z } from "zod";
import { catalogWords } from "./repository";
import { CuratedCatalogService } from "./service";
import {
  classificationProvenanceSchema, classifiedTraitSchema, readingFitSchema,
  readerFitTagSchema, seriesSchema, topicSchema, traitIdSchema,
  type CatalogSource, type CuratedBookProfile,
} from "./schemas";

const importRelationshipSchema = z.object({
  targetRef: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  type: z.enum(["similar_to", "read_next"]),
  strength: z.number().min(0).max(1).optional(),
  reasons: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  provenance: classificationProvenanceSchema,
}).strict();

const importBookSchema = z.object({
  ref: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  title: z.string().trim().min(1).max(160),
  author: z.string().trim().min(1).max(120),
  tier: z.enum(["golden", "core"]),
  topics: z.array(topicSchema).max(30).default([]),
  readerFitTags: z.array(readerFitTagSchema).max(20).default([]),
  traits: z.partialRecord(traitIdSchema, classifiedTraitSchema).default({}),
  readingFit: readingFitSchema.optional(),
  series: seriesSchema.optional(),
  relationships: z.array(importRelationshipSchema).max(30).default([]),
}).strict();

export const proposedCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  books: z.array(importBookSchema).min(1).max(500),
}).strict();

export type ProposedCatalog = z.infer<typeof proposedCatalogSchema>;

function titleAuthorKey(title: string, author: string): string {
  return `${catalogWords(title)}|${catalogWords(author)}`;
}

function editorialSignature(profile: CuratedBookProfile): string {
  return JSON.stringify([profile.tier, profile.topics, profile.readerFitTags,
    profile.traits, profile.readingFit, profile.series, profile.relationships],
  (key, value: unknown) => key === "reviewed" || key === "reviewerId" ? undefined : value);
}

function classificationProvenances(book: ProposedCatalog["books"][number]) {
  return [
    ...book.topics.map((item) => item.provenance),
    ...book.readerFitTags.map((item) => item.provenance),
    ...Object.values(book.traits).filter((item) => item !== undefined).map((item) => item.provenance),
    ...book.relationships.map((item) => item.provenance),
    book.series?.provenance,
    book.readingFit?.difficulty?.provenance,
    ...[book.readingFit?.minimumAge, book.readingFit?.maximumAge,
      book.readingFit?.minimumGrade, book.readingFit?.maximumGrade]
      .filter((item) => item?.provenance.sourceType === "book_scout_classification")
      .map((item) => item!.provenance),
  ].filter((item) => item !== undefined);
}

export function validateProposedCatalog(value: unknown): ProposedCatalog {
  const dataset = proposedCatalogSchema.parse(value);
  const refs = new Set<string>();
  const titles = new Set<string>();
  for (const book of dataset.books) {
    if (refs.has(book.ref)) throw new Error(`Duplicate import ref: ${book.ref}`);
    refs.add(book.ref);
    const key = titleAuthorKey(book.title, book.author);
    if (titles.has(key)) throw new Error(`Duplicate import title/author: ${book.title} by ${book.author}`);
    titles.add(key);
    if (new Set(book.topics.map((item) => item.value)).size !== book.topics.length) {
      throw new Error(`Duplicate topic in ${book.ref}`);
    }
    if (new Set(book.readerFitTags.map((item) => item.value)).size !== book.readerFitTags.length) {
      throw new Error(`Duplicate reader-fit tag in ${book.ref}`);
    }
    if (classificationProvenances(book).some((item) => item.reviewed === true || item.reviewerId)) {
      throw new Error(`Import classifications must be unreviewed: ${book.ref}`);
    }
  }
  const relationships = new Set<string>();
  for (const book of dataset.books) {
    for (const relation of book.relationships) {
      if (relation.targetRef === book.ref) throw new Error(`Self relationship in ${book.ref}`);
      if (!refs.has(relation.targetRef)) throw new Error(`Unknown relationship target: ${relation.targetRef}`);
      const pair = relation.type === "similar_to"
        ? [book.ref, relation.targetRef].sort().join(":")
        : `${book.ref}:${relation.targetRef}`;
      const key = `${relation.type}:${pair}`;
      if (relationships.has(key)) throw new Error(`Duplicate import relationship: ${key}`);
      relationships.add(key);
    }
  }
  return dataset;
}

export function stageImportSeeds(source: unknown, value: unknown,
  service = new CuratedCatalogService(), now = new Date()): { source: CatalogSource; added: number; existing: number } {
  const dataset = validateProposedCatalog(value);
  let catalog = service.validate(source);
  let added = 0;
  for (const book of dataset.books) {
    const key = titleAuthorKey(book.title, book.author);
    if ([...catalog.seeds.map((seed) => titleAuthorKey(seed.title, seed.author)),
      ...catalog.approved.map((item) => titleAuthorKey(item.book.title, item.book.authors[0] ?? ""))].includes(key)) continue;
    catalog = service.addSeed(catalog, book.title, book.author, "system:developer", now);
    added += 1;
  }
  return { source: catalog, added, existing: dataset.books.length - added };
}

export function submitImport(source: unknown, value: unknown,
  service = new CuratedCatalogService(), now = new Date()):
  { source: CatalogSource; submitted: number; skippedUnenriched: string[]; deferredRelationships: number } {
  const dataset = validateProposedCatalog(value);
  let catalog = service.validate(source);
  const byRef = new Map(dataset.books.map((book) => {
    const key = titleAuthorKey(book.title, book.author);
    const seed = catalog.seeds.find((item) => titleAuthorKey(item.title, item.author) === key);
    const existing = catalog.approved.find((item) => titleAuthorKey(item.book.title, item.book.authors[0] ?? "") === key);
    if (!seed && !existing) throw new Error(`Seed not staged: ${book.ref}`);
    return [book.ref, { seed, existing }] as const;
  }));
  let submitted = 0;
  let deferredRelationships = 0;
  const skippedUnenriched: string[] = [];
  for (const entry of dataset.books) {
    const { seed, existing } = byRef.get(entry.ref)!;
    const providerBook = seed?.book ?? existing?.book;
    if (!providerBook) {
      skippedUnenriched.push(entry.ref);
      continue;
    }
    const id = seed?.id ?? existing!.id;
    if (catalog.submissions.some((item) => item.proposed.id === id && item.state === "needs_review")) continue;
    const relationships = entry.relationships.flatMap((relation) => {
      const target = byRef.get(relation.targetRef)!;
      const targetId = target.seed?.id ?? target.existing!.id;
      if (!catalog.approved.some((item) => item.id === targetId)) {
        deferredRelationships += 1;
        return [];
      }
      const { targetRef: _targetRef, ...fields } = relation;
      void _targetRef;
      return [{ ...fields, sourceBookId: id, targetBookId: targetId }];
    });
    const base = existing ?? service.createDraft(providerBook, "system:developer", now, id);
    const proposed: CuratedBookProfile = {
      ...base, book: providerBook, tier: entry.tier, topics: entry.topics,
      readerFitTags: entry.readerFitTags, traits: entry.traits,
      readingFit: entry.readingFit, series: entry.series, relationships,
    };
    if (existing && editorialSignature(existing) === editorialSignature(proposed)) continue;
    catalog = service.submit(catalog, proposed, "system:developer", now);
    submitted += 1;
  }
  return { source: catalog, submitted, skippedUnenriched, deferredRelationships };
}
