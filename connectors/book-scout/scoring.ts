import type { Candidate } from "./candidates";
import { normalizeWords } from "./candidates";
import type { Book } from "./book";
import type { RecommendationInput, RecommendationReason } from "./schemas";
import { sameWorkTitle } from "./identity";
import { curatedInterestEvidence, providerInterestEvidence } from "./quality";

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
  minimumCuratedScore: number;
  minimumFallbackScore: number;
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
  // Old one-word results clustered around 59; evidence gates screen the higher-scoring false matches.
  minimumCuratedScore: 60,
  minimumFallbackScore: 54,
  // Broad scoring bands, used only when a provider supplies a real Lexile value.
  lexileBands: { beginner: [0, 650], average: [550, 1100], advanced: [900, 2000] },
};

export function validateRecommendationConfig(config: RecommendationConfig): void {
  const weights = Object.values(config.weights);
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0) ||
      Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 100) > 0.001 ||
      config.weights.diversity >= 100 ||
      !Number.isFinite(config.lowContentThreshold) || config.lowContentThreshold < 0 || config.lowContentThreshold > 100 ||
      !Number.isFinite(config.minimumCuratedScore) || config.minimumCuratedScore < 0 || config.minimumCuratedScore > 100 ||
      !Number.isFinite(config.minimumFallbackScore) || config.minimumFallbackScore < 0 || config.minimumFallbackScore > 100 ||
      Object.values(config.lexileBands).some(([minimum, maximum]) => !Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum)) {
    throw new Error("Recommendation weights must be non-negative, sum to 100, and use a valid content threshold.");
  }
}

export function passesHardFilters(candidate: Candidate, input: RecommendationInput, config: RecommendationConfig): boolean {
  const book = candidate.book;
  if (book.language && book.language.toLowerCase() !== input.language) return false;
  if (input.age !== undefined && input.age < 13 &&
    book.subjects.some((subject) => /young adult/i.test(subject)) &&
    !book.subjects.some((subject) => /juvenile|children|middle grade/i.test(subject)) &&
    candidate.curated?.readingFit?.minimumAge?.value === undefined) return false;
  if (input.likedBooks.some((name) => sameWorkTitle(name, book.title))) return false;
  if (input.dislikedBooks.some((name) => {
    if (sameWorkTitle(name, book.title)) return true;
    const disliked = normalizeWords(name);
    return disliked.split(" ").length >= 2 && normalizeWords(book.title).startsWith(`${disliked} `);
  })) return false;
  const minimumAge = candidate.curated?.readingFit?.minimumAge?.value ?? book.readingLevel?.minimumAge;
  const maximumAge = candidate.curated?.readingFit?.maximumAge?.value ?? book.readingLevel?.maximumAge;
  if (input.age !== undefined && minimumAge !== undefined && input.age < minimumAge) return false;
  if (input.age !== undefined && maximumAge !== undefined && input.age > maximumAge + 1) return false;
  const minimumGrade = candidate.curated?.readingFit?.minimumGrade?.value;
  const maximumGrade = candidate.curated?.readingFit?.maximumGrade?.value;
  if (input.grade !== undefined && minimumGrade !== undefined && input.grade < minimumGrade) return false;
  if (input.grade !== undefined && maximumGrade !== undefined && input.grade > maximumGrade + 1) return false;
  if (input.readingAbility === "advanced" && candidate.curated?.readingFit?.difficulty?.value === "beginner" &&
    (input.age ?? 10) >= 9) return false;
  const romance = candidate.curated?.traits.romance?.value === undefined ? book.content?.romance : candidate.curated.traits.romance.value * 20;
  const scary = candidate.curated?.traits.scary?.value === undefined ? book.content?.scary : candidate.curated.traits.scary.value * 20;
  if (input.preferences.romance === "low" && romance !== undefined && romance >= config.lowContentThreshold) return false;
  if (input.preferences.scary === "low" && scary !== undefined && scary >= config.lowContentThreshold) return false;
  return true;
}

function interestSignal(candidate: Candidate, input: RecommendationInput): { score: number; term: string } | undefined {
  if (input.interests.length === 0) return undefined;
  const matches = input.interests.map((term) => ({
    term,
    score: candidate.curated ? curatedInterestEvidence(candidate.curated, term) : providerInterestEvidence(candidate.book, term),
  }));
  matches.sort((a, b) => b.score - a.score);
  const score = 0.7 * matches[0].score + 0.3 * (matches.reduce((sum, match) => sum + match.score, 0) / matches.length);
  return { score, term: matches[0].term };
}

function likedSignal(candidate: Candidate, input: RecommendationInput, references: Book[]): number | undefined {
  if (input.likedBooks.length === 0) return undefined;
  let signal = candidate.relationshipStrength ?? 0;
  for (const reference of references) {
    if (reference.id === candidate.book.id || sameWorkTitle(reference.title, candidate.book.title)) continue;
    if (reference.authors.some((author) => candidate.book.authors.some((other) => normalizeWords(author) === normalizeWords(other)))) {
      signal = Math.max(signal, 0.7);
    }
    if (reference.subjects.length && candidate.book.subjects.length) {
      const referenceSubjects = new Set(reference.subjects.map(normalizeWords));
      const overlap = candidate.book.subjects.filter((subject) => referenceSubjects.has(normalizeWords(subject))).length;
      if (overlap && referenceSubjects.size > 1) signal = Math.max(signal, 0.45 + 0.2 * overlap / Math.max(reference.subjects.length, candidate.book.subjects.length));
    }
  }
  return signal > 0 ? signal : undefined;
}

function ageSignal(candidate: Candidate, input: RecommendationInput): number | undefined {
  const minimumAge = candidate.curated?.readingFit?.minimumAge?.value ?? candidate.book.readingLevel?.minimumAge;
  const maximumAge = candidate.curated?.readingFit?.maximumAge?.value ?? candidate.book.readingLevel?.maximumAge;
  const minimumGrade = candidate.curated?.readingFit?.minimumGrade?.value;
  const maximumGrade = candidate.curated?.readingFit?.maximumGrade?.value;
  if (input.grade !== undefined && (minimumGrade !== undefined || maximumGrade !== undefined)) {
    if (minimumGrade !== undefined && input.grade < minimumGrade) return 0;
    if (maximumGrade !== undefined && input.grade > maximumGrade) return 0.6;
    return 1;
  }
  if (input.age === undefined) return undefined;
  if (minimumAge === undefined && maximumAge === undefined) return undefined;
  if (minimumAge !== undefined && input.age < minimumAge) return 0;
  if (maximumAge !== undefined && input.age > maximumAge) return 0.6;
  return 1;
}

function readingSignal(candidate: Candidate, input: RecommendationInput, config: RecommendationConfig): number | undefined {
  const difficulty = candidate.curated?.readingFit?.difficulty?.value;
  if (difficulty && input.readingAbility) return difficulty === input.readingAbility ? 1 : 0.5;
  if (input.readingAbility === "advanced" && candidate.curated?.readerFitTags.some((tag) => tag.value === "advanced-reader-friendly")) return 1;
  const lexile = candidate.curated?.readingFit?.lexile?.value ?? candidate.book.readingLevel?.lexile;
  if (lexile === undefined || !input.readingAbility) return undefined;
  const [minimum, maximum] = config.lexileBands[input.readingAbility];
  const distance = lexile < minimum ? minimum - lexile : lexile > maximum ? lexile - maximum : 0;
  return Math.max(0, 1 - distance / 500);
}

function preferenceSignal(candidate: Candidate, input: RecommendationInput): number | undefined {
  const known: number[] = [];
  const values: Array<["humor" | "romance" | "scary", number | undefined]> = [
    ["humor", candidate.curated?.traits.humor?.value === undefined ? candidate.book.attributes?.humor : candidate.curated.traits.humor.value * 20],
    ["romance", candidate.curated?.traits.romance?.value === undefined ? candidate.book.content?.romance : candidate.curated.traits.romance.value * 20],
    ["scary", candidate.curated?.traits.scary?.value === undefined ? candidate.book.content?.scary : candidate.curated.traits.scary.value * 20],
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
  const age = ageSignal(candidate, input);
  const reading = readingSignal(candidate, input, config);
  const preference = preferenceSignal(candidate, input);
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
  const matchScore = Math.max(0, Math.round(100 * total / matchWeight) -
    (!candidate.curated && candidate.book.language === undefined ? 5 : 0));
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
