import type { Book } from "./book";

export function normalizeBookText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[’‘`´]/g, "'").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
    .replace(/\s+/g, " ");
}

const editionNoise = /(?:illustrated|movie|tv|television|disney\s*\+?|paperback|kindle|e\s*book|anniversary|special|collector'?s?)\s+(?:tie[\s-]*in\s+)?edition|(?:movie|tv|television|disney\s*\+?)\s*tie[\s-]*in/gi;

export function normalizedWorkTitle(title: string): string {
  const withoutEdition = title.replace(/\s*[([{][^\])}]*[\])}]\s*/g, (part) => {
    editionNoise.lastIndex = 0;
    return editionNoise.test(part) ? " " : part;
  });
  editionNoise.lastIndex = 0;
  const withoutSuffix = withoutEdition.replace(/\s*[:–—-]\s*([^:–—-]+)$/u, (whole, suffix: string) => {
    editionNoise.lastIndex = 0;
    return editionNoise.test(suffix) ? "" : whole;
  });
  editionNoise.lastIndex = 0;
  return normalizeBookText(withoutSuffix.replace(editionNoise, " "));
}

export function sameWorkTitle(left: string, right: string): boolean {
  const a = normalizedWorkTitle(left);
  const b = normalizedWorkTitle(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a];
  return shorter.split(" ").length >= 3 && longer.endsWith(` and ${shorter}`);
}

export function sameWork(left: Book, right: Book): boolean {
  if (left.isbn13 && left.isbn13 === right.isbn13) return true;
  if (left.isbn10 && left.isbn10 === right.isbn10) return true;
  return sameWorkTitle(left.title, right.title) && left.authors.some((author) =>
    right.authors.some((other) => normalizeBookText(author) === normalizeBookText(other)));
}
