import type { Book } from "../book";
import { catalogWords } from "./repository";
import type { CatalogSeed } from "./schemas";

export type CandidateMatch = {
  status: "matched" | "ambiguous" | "unresolved";
  confidence: number;
  candidateIds: string[];
  book?: Book;
};

export type MatchThresholds = { highConfidence: number; minimumMargin: number; minimumPlausible: number };
export const defaultMatchThresholds: MatchThresholds = {
  highConfidence: 0.85,
  minimumMargin: 0.12,
  minimumPlausible: 0.55,
};

function tokenOverlap(a: string, b: string): number {
  const left = new Set(catalogWords(a).split(" ").filter(Boolean));
  const right = new Set(catalogWords(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  return [...left].filter((value) => right.has(value)).length / new Set([...left, ...right]).size;
}

export function scoreProviderCandidate(seed: Pick<CatalogSeed, "title" | "author">, book: Book): number {
  const exactTitle = catalogWords(seed.title) === catalogWords(book.title);
  const title = exactTitle ? 1 : tokenOverlap(seed.title, book.title);
  const author = Math.max(0, ...book.authors.map((value) =>
    catalogWords(seed.author) === catalogWords(value) ? 1 : tokenOverlap(seed.author, value)));
  const metadata = (book.isbn13 || book.isbn10 ? 0.05 : 0) +
    (book.language ? 0.03 : 0) + (book.publicationYear ? 0.02 : 0);
  return Math.round(1000 * (0.65 * title + 0.25 * author + metadata)) / 1000;
}

export function matchProviderCandidates(
  seed: Pick<CatalogSeed, "title" | "author">,
  books: Book[],
  thresholds: MatchThresholds = defaultMatchThresholds,
): CandidateMatch {
  if (thresholds.minimumPlausible < 0 || thresholds.highConfidence > 1 ||
    thresholds.minimumPlausible > thresholds.highConfidence || thresholds.minimumMargin < 0) {
    throw new Error("Invalid catalog match thresholds.");
  }
  const ranked = books.map((book) => ({ book, score: scoreProviderCandidate(seed, book) }))
    .sort((a, b) => b.score - a.score || a.book.id.localeCompare(b.book.id));
  const best = ranked[0];
  if (!best || best.score < thresholds.minimumPlausible) {
    return { status: "unresolved", confidence: best?.score ?? 0, candidateIds: ranked.slice(0, 5).map((item) => item.book.id) };
  }
  const margin = best.score - (ranked[1]?.score ?? 0);
  if (best.score >= thresholds.highConfidence && margin >= thresholds.minimumMargin &&
    catalogWords(seed.title) === catalogWords(best.book.title) &&
    best.book.authors.some((author) => catalogWords(author) === catalogWords(seed.author))) {
    return { status: "matched", confidence: best.score, candidateIds: [best.book.id], book: best.book };
  }
  return { status: "ambiguous", confidence: best.score, candidateIds: ranked.slice(0, 5).map((item) => item.book.id) };
}
