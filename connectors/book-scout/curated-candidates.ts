import type { Candidate } from "./candidates";
import type { CuratedCatalogRepository } from "./curation/repository";
import { normalizeBookText, sameWorkTitle } from "./identity";
import { curatedCandidateEligible, curatedInterestEvidence, curatedRelevance } from "./quality";
import type { RecommendationInput } from "./schemas";

export async function generateCuratedCandidates(
  repository: CuratedCatalogRepository,
  input: RecommendationInput,
): Promise<Candidate[]> {
  const approved = (await repository.listApproved()).filter((profile) =>
    Boolean(profile.audit.approvedAt && profile.audit.approvedBy));
  const anchors = approved.filter((profile) => input.likedBooks.some((liked) => {
    if (sameWorkTitle(profile.book.title, liked)) return true;
    const normalized = normalizeBookText(liked);
    if (normalized.split(" ").length < 2) return false;
    return normalizeBookText(profile.book.title).startsWith(`${normalized} `) ||
      normalizeBookText(profile.series?.name ?? "").startsWith(normalized);
  }));
  const anchorIds = new Set(anchors.map((profile) => profile.id));
  return approved.flatMap((profile) => {
    const relations = anchors.flatMap((anchor) => [
      ...anchor.relationships.filter((item) => item.targetBookId === profile.id),
      ...profile.relationships.filter((item) => item.targetBookId === anchor.id && item.type === "similar_to"),
    ]);
    const strongest = relations.sort((a, b) => (b.strength ?? 0.8) - (a.strength ?? 0.8))[0];
    const relationshipStrength = strongest?.strength ?? (strongest ? 0.8 : 0);
    if (!curatedCandidateEligible(profile, input) ||
      !curatedRelevance(profile, input, relationshipStrength) || anchorIds.has(profile.id)) return [];
    return [{
      book: profile.book,
      curated: profile,
      matchedInterests: input.interests.filter((term) => curatedInterestEvidence(profile, term) >= 0.7),
      matchedLikedBooks: strongest ? input.likedBooks : [],
      ...(strongest ? { relationshipStrength, relationshipType: strongest.type } : {}),
    } satisfies Candidate];
  });
}
