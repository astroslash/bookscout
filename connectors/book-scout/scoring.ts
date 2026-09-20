import type { Candidate } from "./candidates";
import { normalizeWords } from "./candidates";
import type { Book } from "./book";
import type { RecommendationInput, RecommendationReason } from "./schemas";

export type ScoreWeights = {
  likedBookSimilarity: number;
  interestMatch: number;
  ageFit: number;
  readingAbility: number;
  popularity: number;
  preferenceMatch: number;
  diversity: number;
};

export type RecommendationConfig = {
  weights: ScoreWeights;
  lowContentThreshold: number;
  lexileBands: Record<NonNullable<RecommendationInput["readingAbility"]>, readonly [number, number]>;
};

export const defaultRecommendationConfig: RecommendationConfig = {
  weights: {
    likedBookSimilarity: 25,
    interestMatch: 25,
    ageFit: 15,
    readingAbility: 15,
    popularity: 10,
    preferenceMatch: 5,
    diversity: 5,
  },
  lowContentThreshold: 75,
  // Broad scoring bands, used only when a provider supplies a real Lexile value.
  lexileBands: { beginner: [0, 650], average: [550, 1100], advanced: [900, 2000] },
};

export function validateRecommendationConfig(config: RecommendationConfig): void {
  const weights = Object.values(config.weights);
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0) ||
      Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 100) > 0.001 ||
      config.weights.diversity >= 100 ||
      !Number.isFinite(config.lowContentThreshold) || config.lowContentThreshold < 0 || config.lowContentThreshold > 100 ||
      Object.values(config.lexileBands).some(([minimum, maximum]) => !Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum)) {
    throw new Error("Recommendation weights must be non-negative, sum to 100, and use a valid content threshold.");
  }
}

export function passesHardFilters(candidate: Candidate, input: RecommendationInput, config: RecommendationConfig): boolean {
  const book = candidate.book;
  const title = normalizeWords(book.title);
  if ([...input.likedBooks, ...input.dislikedBooks].some((name) => normalizeWords(name) === title)) return false;
  if (input.age !== undefined && book.readingLevel?.minimumAge !== undefined && input.age < book.readingLevel.minimumAge) return false;
  if (input.preferences.romance === "low" && book.content?.romance !== undefined && book.content.romance >= config.lowContentThreshold) return false;
  if (input.preferences.scary === "low" && book.content?.scary !== undefined && book.content.scary >= config.lowContentThreshold) return false;
  return true;
}

function phraseMatch(phrase: string, text: string): number {
  const query = normalizeWords(phrase);
  const content = normalizeWords(text);
  if (!query || !content) return 0;
  if (content.includes(query)) return 1;
  const tokens = query.split(" ");
  const haystack = new Set(content.split(" "));
  const coverage = tokens.filter((token) => haystack.has(token)).length / tokens.length;
  return coverage === 1 ? 0.85 : coverage * 0.5;
}

function interestSignal(candidate: Candidate, input: RecommendationInput): { score: number; term: string } | undefined {
  if (input.interests.length === 0) return undefined;
  const book = candidate.book;
  const primaryText = [book.title, ...book.subjects].join(" ");
  const matches = input.interests.map((term) => ({
    term,
    score: Math.max(
      phraseMatch(term, primaryText),
      phraseMatch(term, book.description ?? "") * 0.7,
      candidate.matchedInterests.includes(term) ? 0.55 : 0,
    ),
  }));
  matches.sort((a, b) => b.score - a.score);
  const score = 0.7 * matches[0].score + 0.3 * (matches.reduce((sum, match) => sum + match.score, 0) / matches.length);
  return { score, term: matches[0].term };
}

function likedSignal(candidate: Candidate, input: RecommendationInput, references: Book[]): number | undefined {
  if (input.likedBooks.length === 0) return undefined;
  let signal = candidate.matchedLikedBooks.length > 0 ? 0.6 : 0;
  for (const reference of references) {
    if (reference.id === candidate.book.id) continue;
    if (reference.authors.some((author) => candidate.book.authors.some((other) => normalizeWords(author) === normalizeWords(other)))) {
      signal = Math.max(signal, 0.85);
    }
    if (reference.subjects.length && candidate.book.subjects.length) {
      const referenceSubjects = new Set(reference.subjects.map(normalizeWords));
      const overlap = candidate.book.subjects.filter((subject) => referenceSubjects.has(normalizeWords(subject))).length;
      if (overlap) signal = Math.max(signal, 0.55 + 0.25 * overlap / Math.max(reference.subjects.length, candidate.book.subjects.length));
    }
  }
  return signal > 0 ? signal : references.length ? 0.4 : undefined;
}

function ageSignal(book: Book, input: RecommendationInput): number | undefined {
  if (input.age === undefined || !book.readingLevel) return undefined;
  const { minimumAge, maximumAge } = book.readingLevel;
  if (minimumAge === undefined && maximumAge === undefined) return undefined;
  if (minimumAge !== undefined && input.age < minimumAge) return 0;
  if (maximumAge !== undefined && input.age > maximumAge) return 0.6;
  return 1;
}

function readingSignal(book: Book, input: RecommendationInput, config: RecommendationConfig): number | undefined {
  const lexile = book.readingLevel?.lexile;
  if (lexile === undefined || !input.readingAbility) return undefined;
  const [minimum, maximum] = config.lexileBands[input.readingAbility];
  const distance = lexile < minimum ? minimum - lexile : lexile > maximum ? lexile - maximum : 0;
  return Math.max(0, 1 - distance / 500);
}

function preferenceSignal(book: Book, input: RecommendationInput): number | undefined {
  const known: number[] = [];
  const values: Array<["humor" | "romance" | "scary", number | undefined]> = [
    ["humor", book.attributes?.humor], ["romance", book.content?.romance], ["scary", book.content?.scary],
  ];
  for (const [kind, value] of values) {
    const desired = input.preferences[kind];
    if (desired === undefined || value === undefined) continue;
    const unit = value / 100;
    known.push(desired === "high" ? unit : desired === "low" ? 1 - unit : 1 - Math.abs(unit - 0.5) * 2);
  }
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : undefined;
}

export type ScoredCandidate = Candidate & { matchScore: number; reasons: RecommendationReason[] };

export function scoreCandidate(candidate: Candidate, input: RecommendationInput, references: Book[], config: RecommendationConfig = defaultRecommendationConfig): ScoredCandidate {
  const interest = interestSignal(candidate, input);
  const liked = likedSignal(candidate, input, references);
  const age = ageSignal(candidate.book, input);
  const reading = readingSignal(candidate.book, input, config);
  const preference = preferenceSignal(candidate.book, input);
  const signals: Array<[number, number | undefined]> = [
    [config.weights.likedBookSimilarity, liked],
    [config.weights.interestMatch, interest?.score],
    [config.weights.ageFit, age],
    [config.weights.readingAbility, reading],
    [config.weights.popularity, candidate.book.popularity === undefined ? undefined : candidate.book.popularity / 100],
    [config.weights.preferenceMatch, preference],
  ];
  const matchWeight = signals.reduce((sum, [weight]) => sum + weight, 0);
  const total = signals.reduce((sum, [weight, value]) => sum + weight * (value ?? 0.5), 0);
  const matchScore = Math.round(100 * total / matchWeight);
  const reasons: RecommendationReason[] = [];
  if (interest && interest.score >= 0.6) reasons.push({ code: "interest_match", message: `Matches your interest in ${interest.term}.` });
  if (liked !== undefined && liked >= 0.6) reasons.push({ code: "liked_book_similarity", message: "Found through or similar to a book you liked." });
  if (age !== undefined && age >= 0.9) reasons.push({ code: "age_fit", message: "Available age guidance fits the reader." });
  if (reading !== undefined && reading >= 0.8) reasons.push({ code: "reading_fit", message: "Available reading-level data fits the stated ability." });
  if (preference !== undefined && preference >= 0.7) reasons.push({ code: "preference_match", message: "Known book attributes fit a stated preference." });
  if (candidate.book.popularity !== undefined && candidate.book.popularity >= 70) reasons.push({ code: "popularity_signal", message: "Has a strong catalog popularity signal." });
  if (!reasons.length) reasons.push({ code: "catalog_match", message: "Relevant to a catalog search from the reader profile." });
  return { ...candidate, matchScore, reasons };
}
