import { z } from "zod";

export const googleVolumeSchema = z.object({
  id: z.string().min(1),
  volumeInfo: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    authors: z.array(z.string()).optional(),
    description: z.string().optional(),
    categories: z.array(z.string()).optional(),
    publishedDate: z.string().optional(),
    pageCount: z.number().optional(),
    language: z.string().optional(),
    industryIdentifiers: z.array(z.object({
      type: z.string(),
      identifier: z.string(),
    })).optional(),
    imageLinks: z.object({
      thumbnail: z.string().optional(),
      smallThumbnail: z.string().optional(),
    }).optional(),
  }).optional(),
});

export const googleVolumesResponseSchema = z.object({
  kind: z.literal("books#volumes"),
  totalItems: z.number().int().nonnegative(),
  items: z.array(z.unknown()).optional(),
});

export type GoogleVolume = z.infer<typeof googleVolumeSchema>;
