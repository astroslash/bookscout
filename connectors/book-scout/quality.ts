import type { Book } from "./book";
import type { Candidate } from "./candidates";
import type { CuratedBookProfile } from "./curation/schemas";
import { normalizeTopic } from "./curation/taxonomy";
import { normalizeBookText, sameWork } from "./identity";
import type { RecommendationInput } from "./schemas";

const genericInterests = new Set(["adventure", "fantasy", "mystery", "science", "history", "sports", "funny", "humor"]);

export function curatedInterestEvidence(profile: CuratedBookProfile, interest: string): number {
  const term = normalizeBookText(interest);
  const topic = normalizeTopic(interest);
  const topics = new Set(profile.topics.map((item) => item.value));
  const tags = new Set(profile.readerFitTags.map((item) => item.value));
  if (topic && topics.has(topic)) return 1;
  if (topic?.endsWith("mythology") && topics.has("mythology")) return 0.75;
  if (term === "mythology" && [...topics].some((item) => item.endsWith("mythology"))) return 0.9;
  if (term === "history" && [...topics].some((item) => item.includes("history") || item === "world-war-ii")) return 0.85;
  if ((term === "mythology" || term === "greek mythology") && tags.has("mythology-lover")) return 0.8;
  if (term === "history" && tags.has("history-lover")) return 0.8;
  if ((term === "funny" || term === "funny books" || term === "humor") && tags.has("humor-lover")) return 0.8;
  if (term === "fantasy" && (topics.has("magic") || topics.has("dragons"))) return 0.8;
  const trait = term === "funny" || term === "funny books" || term === "humor" ? "humor" :
    term === "fantasy" ? "fantasy" : term === "adventure" ? "adventure" :
      term === "mystery" ? "mystery" : term === "science fiction" ? "scienceFiction" : undefined;
  if (trait) {
    const value = profile.traits[trait as keyof typeof profile.traits]?.value;
    if (value !== undefined && value >= 3.5) return value / 5;
  }
  return 0;
}

export function curatedRelevance(profile: CuratedBookProfile, input: RecommendationInput, relationshipStrength = 0): number {
  const evidence = input.interests.map((term) => curatedInterestEvidence(profile, term));
  const strong = evidence.filter((value) => value >= 0.7);
  const specific = input.interests.some((term, index) => !genericInterests.has(normalizeBookText(term)) && evidence[index] >= 0.7);
  return relationshipStrength >= 0.6 || specific || strong.length >= 2 ?
    Math.max(relationshipStrength, ...evidence, 0) : 0;
}

export function curatedCandidateEligible(profile: CuratedBookProfile, input: RecommendationInput): boolean {
  if (profile.book.pageCount === undefined && (profile.book.description?.length ?? 0) < 80) return false;
  if (input.age !== undefined && input.age >= 10 && input.readingAbility === "advanced") {
    if (profile.book.pageCount !== undefined && profile.book.pageCount < 80) return false;
  }
  return true;
}

function phraseIn(text: string, phrase: string): boolean {
  const normalized = normalizeBookText(text);
  const value = normalizeBookText(phrase);
  return Boolean(value && ` ${normalized} `.includes(` ${value} `));
}

export function providerInterestEvidence(book: Book, interest: string): number {
  if (book.subjects.some((subject) => phraseIn(subject, interest))) return 1;
  if (book.description && phraseIn(book.description, interest)) return 0.85;
  const term = normalizeBookText(interest);
  const description = normalizeBookText(book.description ?? "");
  if (term === "greek mythology" && /\bgreek(?:\s+\w+){0,3}\s+(?:mythology|myths|gods)\b/.test(description)) return 0.8;
  return 0;
}

export function fallbackEligible(candidate: Candidate, input: RecommendationInput, likedReferences: Book[]): boolean {
  const book = candidate.book;
  if (genericInterests.has(normalizeBookText(book.title))) return false;
  if (book.language && book.language.toLowerCase() !== input.language) return false;
  if (!book.authors.length || !book.description || book.description.length < 60 ||
    !(book.isbn13 || book.isbn10) || !book.subjects.length) return false;
  if (input.age !== undefined && input.age >= 10 && input.readingAbility === "advanced") {
    if (book.pageCount !== undefined && book.pageCount < 80) return false;
    if (/\b(little kids|preschool|kindergarten|toddlers|first big book)\b/i.test(book.title)) return false;
  }
  const juvenile = book.subjects.some((subject) =>
    /juvenile|young adult|children|middle grade/i.test(subject));
  if (!juvenile && input.age !== undefined && input.age < 18) return false;
  const specificMatch = input.interests.some((term) => !genericInterests.has(normalizeBookText(term)) &&
    providerInterestEvidence(book, term) >= 0.7);
  const genericMatches = input.interests.filter((term) =>
    book.subjects.some((subject) => phraseIn(subject, term)) &&
    phraseIn(book.description!, term)).length;
  const likedAuthor = likedReferences.some((reference) => !sameWork(reference, book) &&
    reference.authors.some((author) => book.authors.some((other) =>
      normalizeBookText(author) === normalizeBookText(other))));
  return specificMatch || genericMatches >= 2 || likedAuthor;
}
