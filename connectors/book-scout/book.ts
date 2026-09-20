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
  popularity: z.number().finite().optional(),
  readingLevel: z.object({
    minimumAge: z.number().finite().optional(),
    maximumAge: z.number().finite().optional(),
    lexile: z.number().finite().optional(),
  }).optional(),
  content: z.object({
    violence: z.number().finite().optional(),
    romance: z.number().finite().optional(),
    scary: z.number().finite().optional(),
    profanity: z.number().finite().optional(),
  }).optional(),
  attributes: z.object({
    humor: z.number().finite().optional(),
    adventure: z.number().finite().optional(),
    educational: z.number().finite().optional(),
    reluctantReader: z.number().finite().optional(),
  }).optional(),
});

export type Book = z.infer<typeof bookSchema>;
