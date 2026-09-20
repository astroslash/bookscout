import { deduplicateCandidates } from "./candidates";
import { diversifyCandidates } from "./diversify";
import { recommendationInputSchema, recommendationResultSchema, type RecommendationResult } from "./schemas";
import { defaultRecommendationConfig, passesHardFilters, scoreCandidate, validateRecommendationConfig, type RecommendationConfig } from "./scoring";
import { InvalidInputError } from "@/platform/errors";
import { bookScoutUrl } from "./links";
import type { CuratedCatalogRepository } from "./curation/repository";
import { FileCuratedCatalogRepository } from "./curation/file-repository";
import { generateCuratedCandidates } from "./curated-candidates";
import type { Book } from "./book";

export class BookScoutRecommendationService {
  constructor(
    private readonly config: RecommendationConfig = defaultRecommendationConfig,
    private readonly curatedRepository: CuratedCatalogRepository = new FileCuratedCatalogRepository(),
    // This is an extension point; the default does not assert Amazon availability.
    private readonly commerceEligible: (book: Book) => boolean = () => true,
  ) {
    validateRecommendationConfig(config);
  }

  async recommend(rawInput: unknown): Promise<RecommendationResult> {
    const parsed = recommendationInputSchema.safeParse(rawInput);
    if (!parsed.success) throw new InvalidInputError("Recommendation input failed validation.");
    const input = parsed.data;
    const curated = await generateCuratedCandidates(this.curatedRepository, input);
    const scored = deduplicateCandidates(curated)
      .filter((candidate) => passesHardFilters(candidate, input, this.config))
      .map((candidate) => scoreCandidate(candidate, input, [], this.config))
      .filter((candidate) => candidate.matchScore >= this.config.minimumCuratedScore)
      .filter((candidate) => this.commerceEligible(candidate.book));
    const recommendations = diversifyCandidates(scored, input, this.config)
      .sort((a, b) => b.matchScore - a.matchScore || a.book.title.localeCompare(b.book.title))
      .map(({ book, matchScore, reasons }) => ({ book, matchScore, reasons, bookScoutUrl: bookScoutUrl(book) }));
    return recommendationResultSchema.parse({
      recommendations,
      ...(recommendations.length === 0 ? { coverage: { status: "insufficient_curated_match" } } : {}),
    });
  }
}
