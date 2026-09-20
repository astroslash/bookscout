import type { BookProvider } from "./provider";
import { deduplicateCandidates, generateCandidates } from "./candidates";
import { diversifyCandidates } from "./diversify";
import { recommendationInputSchema, recommendationResultSchema, type RecommendationResult } from "./schemas";
import { defaultRecommendationConfig, passesHardFilters, scoreCandidate, validateRecommendationConfig, type RecommendationConfig } from "./scoring";
import { InvalidInputError } from "@/platform/errors";
import { bookScoutUrl } from "./links";
import type { CuratedCatalogRepository } from "./curation/repository";
import { enrichWithApprovedCuration } from "./curation/enrich";
import { generateCuratedCandidates } from "./curated-candidates";
import { fallbackEligible } from "./quality";
import { sameWork } from "./identity";
import type { Book } from "./book";
import type { ScoredCandidate } from "./scoring";

export class BookScoutRecommendationService {
  constructor(
    private readonly provider: BookProvider,
    private readonly config: RecommendationConfig = defaultRecommendationConfig,
    private readonly curatedRepository?: CuratedCatalogRepository,
  ) {
    validateRecommendationConfig(config);
  }

  async recommend(rawInput: unknown): Promise<RecommendationResult> {
    const parsed = recommendationInputSchema.safeParse(rawInput);
    if (!parsed.success) throw new InvalidInputError("Recommendation input failed validation.");
    const input = parsed.data;
    const curated = this.curatedRepository ? await generateCuratedCandidates(this.curatedRepository, input) : [];
    const score = (candidates: typeof curated, references: Book[]): ScoredCandidate[] => candidates
      .filter((candidate) => passesHardFilters(candidate, input, this.config))
      .map((candidate) => scoreCandidate(candidate, input, references, this.config))
      .filter((candidate) => candidate.matchScore >=
        (candidate.curated ? this.config.minimumCuratedScore : this.config.minimumFallbackScore));
    let scored = score(deduplicateCandidates(curated), []);
    if (diversifyCandidates(scored, input, this.config).length < input.limit) {
      try {
        const generated = await generateCandidates(this.provider, input);
        const enriched = this.curatedRepository
          ? await enrichWithApprovedCuration(generated.candidates, this.curatedRepository)
          : generated.candidates;
        const fallback = enriched.filter((candidate) =>
          !scored.some((existing) => sameWork(existing.book, candidate.book)) &&
          !candidate.curated && fallbackEligible(candidate, input, generated.likedReferences));
        scored = score(deduplicateCandidates([...curated, ...fallback]), generated.likedReferences);
      } catch (error) {
        if (!scored.length) throw error;
      }
    }
    const recommendations = diversifyCandidates(scored, input, this.config)
      .sort((a, b) => b.matchScore - a.matchScore || a.book.title.localeCompare(b.book.title))
      .map(({ book, matchScore, reasons }) => ({ book, matchScore, reasons, bookScoutUrl: bookScoutUrl(book) }));
    return recommendationResultSchema.parse({ recommendations });
  }
}
