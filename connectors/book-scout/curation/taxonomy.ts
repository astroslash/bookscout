export const topicIds = [
  "mythology", "greek-mythology", "roman-mythology", "norse-mythology",
  "ancient-history", "world-war-ii", "space", "science", "technology",
  "dragons", "magic", "sports", "basketball", "baseball", "football",
  "animals", "dinosaurs", "survival", "mystery", "puzzles", "adventure",
  "friendship", "school", "family", "superheroes",
  "art", "music", "coding", "engineering", "oceans", "environment", "climate",
  "soccer", "track-and-field", "swimming", "science-fiction", "time-travel",
  "civil-rights", "modern-history", "immigration", "poetry", "math",
  "entrepreneurship", "disability",
] as const;

export const readerFitTagIds = [
  "fast-paced", "slow-burn", "reluctant-reader-friendly", "advanced-reader-friendly",
  "series-reader", "humor-lover", "world-building", "puzzle-lover",
  "history-lover", "mythology-lover",
] as const;

export type TopicId = (typeof topicIds)[number];
export type ReaderFitTagId = (typeof readerFitTagIds)[number];

const topicAliases: Record<string, TopicId> = {
  "greek myths": "greek-mythology",
  "greek gods": "greek-mythology",
  "greek mythology": "greek-mythology",
  "roman myths": "roman-mythology",
  "norse myths": "norse-mythology",
  "wwii": "world-war-ii",
  "world war 2": "world-war-ii",
  "world war ii": "world-war-ii",
  "sci fi": "science-fiction",
  "sci-fi": "science-fiction",
  "climate change": "climate",
  "ocean": "oceans",
  "track": "track-and-field",
  "track and field": "track-and-field",
  "football soccer": "soccer",
};

const readerFitAliases: Record<string, ReaderFitTagId> = {
  "fast paced": "fast-paced",
  "reluctant reader": "reluctant-reader-friendly",
  "advanced reader": "advanced-reader-friendly",
  "humor lover": "humor-lover",
  "history lover": "history-lover",
  "mythology lover": "mythology-lover",
};

function key(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const topicsByKey = new Map<string, TopicId>(topicIds.map((value) => [key(value), value]));
const readerTagsByKey = new Map<string, ReaderFitTagId>(readerFitTagIds.map((value) => [key(value), value]));

export function normalizeTopic(value: string): TopicId | null {
  const normalized = key(value);
  return topicAliases[normalized] ?? topicsByKey.get(normalized) ?? null;
}

export function normalizeReaderFitTag(value: string): ReaderFitTagId | null {
  const normalized = key(value);
  return readerFitAliases[normalized] ?? readerTagsByKey.get(normalized) ?? null;
}
