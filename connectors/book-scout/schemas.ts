import { z } from "zod";
import { bookSchema } from "./book";

const term = (max: number) => z.string().trim().min(1).max(max);
const preference = z.enum(["low", "medium", "high"]);

export const recommendationInputSchema = z.object({
  age: z.number().int().min(3).max(19).optional(),
  grade: z.number().int().min(0).max(12).optional(),
  readingAbility: z.enum(["beginner", "average", "advanced"]).optional(),
  interests: z.array(term(60)).max(10).default([]),
  likedBooks: z.array(term(120)).max(10).default([]),
  dislikedBooks: z.array(term(120)).max(10).default([]),
  preferences: z.object({
    humor: preference.optional(),
    romance: preference.optional(),
    scary: preference.optional(),
  }).strict().default({}),
  preferSeries: z.boolean().default(false),
  limit: z.number().int().min(1).max(10).default(5),
}).strict().refine((input) => input.interests.length + input.likedBooks.length > 0, {
  message: "Provide at least one interest or liked book.",
});

export type RecommendationInput = z.infer<typeof recommendationInputSchema>;

export const recommendationReasonSchema = z.object({
  code: z.enum(["interest_match", "liked_book_similarity", "age_fit", "reading_fit", "preference_match", "popularity_signal", "catalog_match"]),
  message: z.string().min(1),
});

export const recommendationResultSchema = z.object({
  recommendations: z.array(z.object({
    book: bookSchema,
    matchScore: z.number().int().min(0).max(100),
    reasons: z.array(recommendationReasonSchema).min(1),
    bookScoutUrl: z.url(),
  })),
});

export type RecommendationResult = z.infer<typeof recommendationResultSchema>;
export type RecommendationReason = z.infer<typeof recommendationReasonSchema>;
