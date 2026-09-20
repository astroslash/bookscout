import { z } from "zod";

// Provider-independent book data. Optional signals stay absent when not known.
export const bookSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().min(1).optional(),
  authors: z.array(z.string().min(1)),
  isbn10: z.string().regex(/^\d{9}[\dX]$/).optional(),
  isbn13: z.string().regex(/^\d{13}$/).optional(),
  description: z.string().min(1).optional(),
  subjects: z.array(z.string().min(1)),
  publicationYear: z.number().int().min(1).max(9999).optional(),
  pageCount: z.number().int().positive().optional(),
  language: z.string().min(1).optional(),
  coverUrl: z.url().optional(),
  // Optional catalog signals use a documented 0 to 100 scale. Never synthesize missing values.
  popularity: z.number().min(0).max(100).optional(),
  readingLevel: z.object({
    minimumAge: z.number().finite().optional(),
    maximumAge: z.number().finite().optional(),
    lexile: z.number().finite().optional(),
  }).optional(),
  content: z.object({
    violence: z.number().min(0).max(100).optional(),
    romance: z.number().min(0).max(100).optional(),
    scary: z.number().min(0).max(100).optional(),
    profanity: z.number().min(0).max(100).optional(),
  }).optional(),
  attributes: z.object({
    humor: z.number().min(0).max(100).optional(),
    adventure: z.number().min(0).max(100).optional(),
    educational: z.number().min(0).max(100).optional(),
    reluctantReader: z.number().min(0).max(100).optional(),
  }).optional(),
});

export type Book = z.infer<typeof bookSchema>;
