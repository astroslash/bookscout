import type { Candidate } from "../candidates";
import { catalogWords, type CuratedCatalogRepository } from "./repository";
import type { CuratedBookProfile } from "./schemas";

function matches(profile: CuratedBookProfile, candidate: Candidate): boolean {
  const curated = profile.book;
  const found = candidate.book;
  if (curated.id === found.id) return true;
  if (curated.isbn13 && curated.isbn13 === found.isbn13) return true;
  if (curated.isbn10 && curated.isbn10 === found.isbn10) return true;
  return catalogWords(curated.title) === catalogWords(found.title) &&
    curated.authors.some((author) => found.authors.some((other) => catalogWords(author) === catalogWords(other)));
}

export async function enrichWithApprovedCuration(
  candidates: Candidate[],
  repository: CuratedCatalogRepository,
): Promise<Candidate[]> {
  let approved: CuratedBookProfile[];
  try {
    approved = await repository.listApproved();
  } catch {
    return candidates;
  }
  return candidates.map((candidate) => {
    const profile = approved.find((item) => matches(item, candidate));
    if (!profile) return candidate;
    const subjects = [...new Set([...candidate.book.subjects, ...profile.topics.map((topic) => topic.value)])];
    return { ...candidate, book: { ...candidate.book, subjects } };
  });
}
