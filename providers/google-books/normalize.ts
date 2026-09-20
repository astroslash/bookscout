import { bookSchema, type Book } from "@/connectors/book-scout/book";
import { googleVolumeSchema } from "./schemas";

function nonempty(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function cleanList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function publicationYear(value: string | undefined): number | undefined {
  const match = value?.match(/^(\d{4})(?:$|[-/])/);
  const year = match ? Number(match[1]) : undefined;
  return year && year > 0 ? year : undefined;
}

function cleanDescription(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const plain = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (_match, entity: string) => {
      const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? _match;
      const hex = entity[1]?.toLowerCase() === "x";
      const codepoint = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return codepoint > 0 && codepoint <= 0x10ffff ? String.fromCodePoint(codepoint) : " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return plain || undefined;
}

function identifier(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

function coverUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (url.hostname === "books.google.com" && url.protocol === "http:") url.protocol = "https:";
    return url.toString();
  } catch {
    return undefined;
  }
}

export function normalizeGoogleVolume(input: unknown): Book | null {
  const parsed = googleVolumeSchema.safeParse(input);
  if (!parsed.success) return null;
  const { id, volumeInfo } = parsed.data;
  const title = nonempty(volumeInfo?.title);
  if (!title) return null;

  const identifiers = volumeInfo?.industryIdentifiers ?? [];
  const isbn10 = identifiers.filter((item) => item.type === "ISBN_10").map((item) => identifier(item.identifier)).find((value) => /^\d{9}[\dX]$/.test(value));
  const isbn13 = identifiers.filter((item) => item.type === "ISBN_13").map((item) => identifier(item.identifier)).find((value) => /^\d{13}$/.test(value));
  const pages = volumeInfo?.pageCount;
  const result = bookSchema.safeParse({
    id: `google-books:${id}`,
    title,
    subtitle: nonempty(volumeInfo?.subtitle),
    authors: cleanList(volumeInfo?.authors),
    isbn10,
    isbn13,
    description: cleanDescription(volumeInfo?.description),
    subjects: cleanList(volumeInfo?.categories),
    publicationYear: publicationYear(volumeInfo?.publishedDate),
    pageCount: pages && Number.isInteger(pages) && pages > 0 ? pages : undefined,
    language: nonempty(volumeInfo?.language)?.toLowerCase(),
    coverUrl: coverUrl(volumeInfo?.imageLinks?.thumbnail ?? volumeInfo?.imageLinks?.smallThumbnail),
  });
  return result.success ? result.data : null;
}
