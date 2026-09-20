import type { BookProvider } from "./provider";
import { generateCandidates } from "./candidates";
import { diversifyCandidates } from "./diversify";
import { recommendationInputSchema, recommendationResultSchema, type RecommendationResult } from "./schemas";
import { defaultRecommendationConfig, passesHardFilters, scoreCandidate, validateRecommendationConfig, type RecommendationConfig } from "./scoring";
import { InvalidInputError } from "@/platform/errors";
import { bookScoutUrl } from "./links";

export class BookScoutRecommendationService {
  constructor(
    private readonly provider: BookProvider,
    private readonly config: RecommendationConfig = defaultRecommendationConfig,
  ) {
    validateRecommendationConfig(config);
  }

  async recommend(rawInput: unknown): Promise<RecommendationResult> {
    const parsed = recommendationInputSchema.safeParse(rawInput);
    if (!parsed.success) throw new InvalidInputError("Recommendation input failed validation.");
    const input = parsed.data;
    const generated = await generateCandidates(this.provider, input);
    const scored = generated.candidates
      .filter((candidate) => passesHardFilters(candidate, input, this.config))
      .map((candidate) => scoreCandidate(candidate, input, generated.likedReferences, this.config));
    const recommendations = diversifyCandidates(scored, input, this.config).map(({ book, matchScore, reasons }) => ({ book, matchScore, reasons, bookScoutUrl: bookScoutUrl(book) }));
    return recommendationResultSchema.parse({ recommendations });
  }
}
