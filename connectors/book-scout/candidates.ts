import type { Book } from "./book";
import type { CuratedBookProfile } from "./curation/schemas";
import { normalizeBookText, sameWork } from "./identity";

export type Candidate = {
  book: Book;
  matchedInterests: string[];
  matchedLikedBooks: string[];
  curated?: CuratedBookProfile;
  relationshipStrength?: number;
  relationshipType?: "similar_to" | "read_next";
};

export function normalizeWords(value: string): string {
  return normalizeBookText(value);
}

function metadataQuality(book: Book): number {
  return (book.isbn13 ? 3 : 0) + (book.isbn10 ? 2 : 0) +
    (book.description ? 1 : 0) + (book.coverUrl ? 1 : 0) +
    (book.pageCount ? 1 : 0) + (book.publicationYear ? 1 : 0) +
    Math.min(book.subjects.length, 3);
}

export function deduplicateCandidates(candidates: Candidate[]): Candidate[] {
  const output: Candidate[] = [];
  for (const candidate of candidates) {
    const target = output.find((item) => item.book.id === candidate.book.id || sameWork(item.book, candidate.book));
    if (!target) {
      const copy = { ...candidate, matchedInterests: [...candidate.matchedInterests], matchedLikedBooks: [...candidate.matchedLikedBooks] };
      output.push(copy);
      continue;
    }
    target.matchedInterests = [...new Set([...target.matchedInterests, ...candidate.matchedInterests])];
    target.matchedLikedBooks = [...new Set([...target.matchedLikedBooks, ...candidate.matchedLikedBooks])];
    if (candidate.curated && !target.curated) {
      target.book = candidate.book;
      target.curated = candidate.curated;
    } else if (!target.curated && metadataQuality(candidate.book) > metadataQuality(target.book)) {
      target.book = candidate.book;
    }
    if ((candidate.relationshipStrength ?? 0) > (target.relationshipStrength ?? 0)) {
      target.relationshipStrength = candidate.relationshipStrength;
      target.relationshipType = candidate.relationshipType;
    }
  }
  return output;
}
