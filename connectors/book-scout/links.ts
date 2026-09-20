import type { Book } from "./book";

export type BookLocator = { kind: "isbn" | "id"; value: string };

export function bookPath(book: Book): string {
  const slug = book.isbn13 ?? book.isbn10 ?? `id-${Buffer.from(book.id, "utf8").toString("base64url")}`;
  return `/book/${slug}`;
}

export function bookScoutUrl(book: Book, baseUrl = process.env.BOOK_BEACON_BASE_URL ?? "https://k4connect.vercel.app"): string {
  return new URL(bookPath(book), baseUrl).toString();
}

export function parseBookSlug(slug: string): BookLocator | null {
  if (/^\d{13}$|^\d{9}[\dX]$/.test(slug)) return { kind: "isbn", value: slug };
  const encoded = slug.startsWith("id-") ? slug.slice(3) : "";
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(encoded)) return null;
  const id = Buffer.from(encoded, "base64url").toString("utf8");
  if (!id || Buffer.from(id, "utf8").toString("base64url") !== encoded) return null;
  return { kind: "id", value: id };
}
