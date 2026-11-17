/**
 * Try-out raw score (DECISIONS.md, Fase 0 — disetujui):
 *   raw_score = (correct answers on non-voided items ÷ number of non-voided items) × 100
 * Voided (annulled) items are removed from both numerator and denominator.
 * Unanswered items (isCorrect = null) count as not correct.
 */
export interface ScoredItem {
  isVoided: boolean;
  /** null = unanswered. */
  isCorrect: boolean | null;
}

/** 0–100 rounded to 2 decimals, or null when the try-out has no countable items. */
export function computeRawScore(items: readonly ScoredItem[]): number | null {
  let counted = 0;
  let correct = 0;
  for (const it of items) {
    if (it.isVoided) continue;
    counted++;
    if (it.isCorrect === true) correct++;
  }
  if (counted === 0) return null;
  return Math.round((correct / counted) * 100 * 100) / 100;
}

/** Score used against the target: the organiser's scaled score when present, otherwise the raw score. */
export function effectiveScore(score: { rawScore: number | null; scaledScore: number | null }): number | null {
  return score.scaledScore ?? score.rawScore;
}
