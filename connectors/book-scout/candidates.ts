import type { Book } from "./book";
import type { BookProvider } from "./provider";
import type { RecommendationInput } from "./schemas";
import { ProviderError } from "@/platform/errors";
import type { CuratedBookProfile } from "./curation/schemas";

export type Candidate = {
  book: Book;
  matchedInterests: string[];
  matchedLikedBooks: string[];
  curated?: CuratedBookProfile;
};

export type CandidateSet = {
  candidates: Candidate[];
  likedReferences: Book[];
  queriesAttempted: number;
  queriesSucceeded: number;
};

type SearchPlan = { query: string; interests: string[]; likedBooks: string[] };

export function normalizeWords(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function planCandidateQueries(input: RecommendationInput): SearchPlan[] {
  const plans = new Map<string, SearchPlan>();
  const add = (query: string, kind: "interests" | "likedBooks") => {
    const key = normalizeWords(query);
    const existing = plans.get(key);
    if (existing) existing[kind].push(query);
    else plans.set(key, { query, interests: kind === "interests" ? [query] : [], likedBooks: kind === "likedBooks" ? [query] : [] });
  };
  for (const interest of input.interests.slice(0, 3)) add(interest, "interests");
  for (const title of input.likedBooks.slice(0, 2)) add(title, "likedBooks");
  return [...plans.values()];
}

function identityKeys(book: Book): string[] {
  const keys = [`id:${book.id}`];
  if (book.isbn13) keys.push(`isbn13:${book.isbn13}`);
  if (book.isbn10) keys.push(`isbn10:${book.isbn10}`);
  if (book.authors[0]) keys.push(`title-author:${normalizeWords(book.title)}:${normalizeWords(book.authors[0])}`);
  return keys;
}

function metadataQuality(book: Book): number {
  return (book.isbn13 ? 3 : 0) + (book.isbn10 ? 2 : 0) +
    (book.description ? 1 : 0) + (book.coverUrl ? 1 : 0) +
    (book.pageCount ? 1 : 0) + (book.publicationYear ? 1 : 0) +
    Math.min(book.subjects.length, 3);
}

export function deduplicateCandidates(candidates: Candidate[]): Candidate[] {
  const output: Candidate[] = [];
  const byIdentity = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const keys = identityKeys(candidate.book);
    const matches = [...new Set(keys.map((key) => byIdentity.get(key)).filter((item): item is Candidate => item !== undefined))];
    const target = matches[0];
    if (!target) {
      const copy = { ...candidate, matchedInterests: [...candidate.matchedInterests], matchedLikedBooks: [...candidate.matchedLikedBooks] };
      output.push(copy);
      for (const key of keys) byIdentity.set(key, copy);
      continue;
    }

    for (const duplicate of matches.slice(1)) {
      target.matchedInterests.push(...duplicate.matchedInterests);
      target.matchedLikedBooks.push(...duplicate.matchedLikedBooks);
      if (metadataQuality(duplicate.book) > metadataQuality(target.book)) target.book = duplicate.book;
      output.splice(output.indexOf(duplicate), 1);
      for (const [key, value] of byIdentity) if (value === duplicate) byIdentity.set(key, target);
    }
    target.matchedInterests = [...new Set([...target.matchedInterests, ...candidate.matchedInterests])];
    target.matchedLikedBooks = [...new Set([...target.matchedLikedBooks, ...candidate.matchedLikedBooks])];
    if (metadataQuality(candidate.book) > metadataQuality(target.book)) target.book = candidate.book;
    for (const key of keys) byIdentity.set(key, target);
  }
  return output;
}

export async function generateCandidates(provider: BookProvider, input: RecommendationInput): Promise<CandidateSet> {
  const plans = planCandidateQueries(input);
  const results = await Promise.allSettled(plans.map((plan) => provider.search(plan.query)));
  const candidates: Candidate[] = [];
  const likedReferences = new Map<string, Book>();
  let queriesSucceeded = 0;

  results.forEach((result, index) => {
    if (result.status === "rejected") return;
    queriesSucceeded += 1;
    const plan = plans[index];
    for (const book of result.value) {
      candidates.push({ book, matchedInterests: plan.interests, matchedLikedBooks: plan.likedBooks });
      if (plan.likedBooks.some((title) => {
        const query = normalizeWords(title);
        return normalizeWords(book.title).includes(query) || normalizeWords(book.subtitle ?? "").includes(query);
      })) likedReferences.set(book.id, book);
    }
  });

  if (queriesSucceeded === 0) throw new ProviderError("The book catalog is unavailable.");
  return {
    candidates: deduplicateCandidates(candidates),
    likedReferences: [...likedReferences.values()],
    queriesAttempted: plans.length,
    queriesSucceeded,
  };
}
