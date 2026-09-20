import type { CuratedBookProfile } from "./schemas";

export type DerivedSimilarity = { score: number; confidence: number; reasons: string[] };

function jaccard(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  return [...a].filter((value) => b.has(value)).length / new Set([...a, ...b]).size;
}

export function compareCuratedBooks(a: CuratedBookProfile, b: CuratedBookProfile): DerivedSimilarity {
  const signals: Array<{ weight: number; score: number; reason: string }> = [];
  if (a.topics.length && b.topics.length) {
    const score = jaccard(a.topics.map((item) => item.value), b.topics.map((item) => item.value));
    signals.push({ weight: 0.3, score, reason: "Shared curated topics" });
  }
  if (a.readerFitTags.length && b.readerFitTags.length) {
    const score = jaccard(a.readerFitTags.map((item) => item.value), b.readerFitTags.map((item) => item.value));
    signals.push({ weight: 0.2, score, reason: "Similar reader-fit tags" });
  }
  const sharedTraits = Object.keys(a.traits).filter((key) =>
    a.traits[key as keyof typeof a.traits] !== undefined && b.traits[key as keyof typeof b.traits] !== undefined);
  if (sharedTraits.length) {
    const score = sharedTraits.reduce((sum, key) => {
      const left = a.traits[key as keyof typeof a.traits]!.value;
      const right = b.traits[key as keyof typeof b.traits]!.value;
      return sum + 1 - Math.abs(left - right) / 5;
    }, 0) / sharedTraits.length;
    signals.push({ weight: 0.25, score, reason: "Similar book traits" });
  }
  const difficultyA = a.readingFit?.difficulty?.value;
  const difficultyB = b.readingFit?.difficulty?.value;
  if (difficultyA && difficultyB) {
    signals.push({ weight: 0.15, score: difficultyA === difficultyB ? 1 : 0.3, reason: "Similar reading difficulty" });
  }
  const minA = a.readingFit?.minimumAge?.value;
  const maxA = a.readingFit?.maximumAge?.value;
  const minB = b.readingFit?.minimumAge?.value;
  const maxB = b.readingFit?.maximumAge?.value;
  if (minA !== undefined && maxA !== undefined && minB !== undefined && maxB !== undefined) {
    const overlap = Math.max(0, Math.min(maxA, maxB) - Math.max(minA, minB) + 1);
    const union = Math.max(maxA, maxB) - Math.min(minA, minB) + 1;
    signals.push({ weight: 0.1, score: overlap / union, reason: "Compatible age ranges" });
  }
  const observedWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  if (!observedWeight) return { score: 0.5, confidence: 0, reasons: [] };
  const score = signals.reduce((sum, signal) => sum + signal.weight * signal.score, 0) / observedWeight;
  return {
    score: Math.round(score * 100) / 100,
    confidence: Math.round(observedWeight * 100) / 100,
    reasons: signals.filter((signal) => signal.score >= 0.7).map((signal) => signal.reason),
  };
}
