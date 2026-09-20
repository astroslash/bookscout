import { deduplicateCandidates } from "./candidates";
import { diversifyCandidates } from "./diversify";
import { recommendationInputSchema, recommendationResultSchema, type RecommendationInput, type RecommendationResult } from "./schemas";
import { defaultRecommendationConfig, passesHardFilters, scoreCandidate, validateRecommendationConfig, type RecommendationConfig } from "./scoring";
import { InvalidInputError } from "@/platform/errors";
import { bookScoutUrl } from "./links";
import type { CuratedCatalogRepository } from "./curation/repository";
import { FileCuratedCatalogRepository } from "./curation/file-repository";
import { generateCuratedCandidates } from "./curated-candidates";
import { curatedCandidateEligible } from "./quality";
import { normalizeTopic } from "./curation/taxonomy";
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
    const availableCatalogTopics = recommendations.length ? [] : await this.coverageTopics(input);
    return recommendationResultSchema.parse({
      recommendations,
      ...(recommendations.length === 0 ? { coverage: {
        status: "insufficient_curated_match", availableCatalogTopics,
      } } : {}),
    });
  }

  private async coverageTopics(input: RecommendationInput): Promise<string[]> {
    const requested = new Set(input.interests.map(normalizeTopic));
    const counts = new Map<string, number>();
    for (const profile of await this.curatedRepository.listApproved()) {
      if (!profile.audit.approvedAt || !profile.audit.approvedBy ||
        !curatedCandidateEligible(profile, input) ||
        !passesHardFilters({ book: profile.book, curated: profile,
          matchedInterests: [], matchedLikedBooks: [] }, input, this.config)) continue;
      for (const topic of profile.topics) {
        if (requested.has(topic.value)) continue;
        counts.set(topic.value, (counts.get(topic.value) ?? 0) + 1);
      }
    }
    return [...counts].sort(([a, ac], [b, bc]) => bc - ac || a.localeCompare(b))
      .slice(0, 3).map(([topic]) => topic.replaceAll("-", " "));
  }
}
