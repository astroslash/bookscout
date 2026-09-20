import type { ConnectorTool } from "@/platform/connector";
import { recommendationInputSchema, recommendationResultSchema } from "./schemas";
import type { BookScoutRecommendationService } from "./service";

export function createBookScoutTools(getService: () => BookScoutRecommendationService): readonly ConnectorTool[] {
  return [{
    name: "recommend_books",
    restPath: "recommend",
    description: "Recommend books for a child or teen from reading interests, liked books, and preferences.",
    inputSchema: recommendationInputSchema,
    outputSchema: recommendationResultSchema,
    async execute(input) {
      return getService().recommend(input);
    },
  }];
}
