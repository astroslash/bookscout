import { normalizeWords } from "./candidates";
import type { RecommendationInput } from "./schemas";
import type { RecommendationConfig, ScoredCandidate } from "./scoring";

function primaryAuthor(candidate: ScoredCandidate): string | undefined {
  const author = candidate.book.authors[0];
  return author ? normalizeWords(author) : undefined;
}

function seriesPrefix(candidate: ScoredCandidate): string | undefined {
  if (candidate.curated?.series?.name) return `series:${normalizeWords(candidate.curated.series.name)}`;
  const words = normalizeWords(candidate.book.title).split(" ");
  return words.length >= 3 ? words.slice(0, 3).join(" ") : undefined;
}

function subjectSimilarity(a: ScoredCandidate, b: ScoredCandidate): number {
  const left = new Set(a.book.subjects.map(normalizeWords));
  const right = new Set(b.book.subjects.map(normalizeWords));
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((subject) => right.has(subject)).length;
  return shared / new Set([...left, ...right]).size;
}

export function diversifyCandidates(
  candidates: ScoredCandidate[],
  input: RecommendationInput,
  config: RecommendationConfig,
): ScoredCandidate[] {
  const remaining = [...candidates];
  const selected: ScoredCandidate[] = [];
  while (remaining.length && selected.length < input.limit) {
    const diverse = input.preferSeries ? remaining : remaining.filter((candidate) => {
      const author = primaryAuthor(candidate);
      const prefix = seriesPrefix(candidate);
      return !selected.some((chosen) =>
        (author && author === primaryAuthor(chosen)) || (prefix && prefix === seriesPrefix(chosen)));
    });
    if (!diverse.length && selected.length) break;
    const pool = diverse.length ? diverse : remaining;
    const ordered = [...pool].sort((a, b) => {
      const adjusted = (candidate: ScoredCandidate) => {
        const overlap = input.preferSeries ? 0 : Math.max(0, ...selected.map((chosen) => subjectSimilarity(candidate, chosen)));
        return candidate.matchScore - config.weights.diversity * overlap;
      };
      return adjusted(b) - adjusted(a) || b.matchScore - a.matchScore || a.book.id.localeCompare(b.book.id);
    });
    const chosen = ordered[0];
    selected.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
  }
  return selected;
}
