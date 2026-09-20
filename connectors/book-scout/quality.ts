import type { CuratedBookProfile } from "./curation/schemas";
import { normalizeTopic } from "./curation/taxonomy";
import { normalizeBookText } from "./identity";
import type { RecommendationInput } from "./schemas";

const genericInterests = new Set(["adventure", "fantasy", "mystery", "science", "history", "sports", "funny", "humor"]);

export function curatedInterestEvidence(profile: CuratedBookProfile, interest: string): number {
  const term = normalizeBookText(interest);
  const topic = normalizeTopic(interest);
  const topics = new Set(profile.topics.map((item) => item.value));
  const tags = new Set(profile.readerFitTags.map((item) => item.value));
  if (topic && topics.has(topic)) return 1;
  if (topic?.endsWith("mythology") && topics.has("mythology")) return 0.75;
  if (term === "mythology" && [...topics].some((item) => item.endsWith("mythology"))) return 0.9;
  if (term === "history" && [...topics].some((item) => item.includes("history") || item === "world-war-ii")) return 0.85;
  if ((term === "mythology" || term === "greek mythology") && tags.has("mythology-lover")) return 0.8;
  if (term === "history" && tags.has("history-lover")) return 0.8;
  if ((term === "funny" || term === "funny books" || term === "humor") && tags.has("humor-lover")) return 0.8;
  if (term === "fantasy" && (topics.has("magic") || topics.has("dragons"))) return 0.8;
  const trait = term === "funny" || term === "funny books" || term === "humor" ? "humor" :
    term === "fantasy" ? "fantasy" : term === "adventure" ? "adventure" :
      term === "mystery" ? "mystery" : term === "science fiction" ? "scienceFiction" : undefined;
  if (trait) {
    const value = profile.traits[trait as keyof typeof profile.traits]?.value;
    if (value !== undefined && value >= 3.5) return value / 5;
  }
  return 0;
}

export function curatedRelevance(profile: CuratedBookProfile, input: RecommendationInput, relationshipStrength = 0): number {
  const evidence = input.interests.map((term) => curatedInterestEvidence(profile, term));
  const strong = evidence.filter((value) => value >= 0.7);
  const specific = input.interests.some((term, index) => !genericInterests.has(normalizeBookText(term)) && evidence[index] >= 0.7);
  return relationshipStrength >= 0.6 || specific || strong.length >= 2 ?
    Math.max(relationshipStrength, ...evidence, 0) : 0;
}

export function curatedCandidateEligible(profile: CuratedBookProfile, input: RecommendationInput): boolean {
  if (profile.book.pageCount === undefined && (profile.book.description?.length ?? 0) < 80) return false;
  if (input.age !== undefined && input.age >= 10 && input.readingAbility === "advanced") {
    if (profile.book.pageCount !== undefined && profile.book.pageCount < 80) return false;
  }
  return true;
}
