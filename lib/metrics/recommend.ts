/**
 * Intervention focus (CLAUDE.md §7.2c, DECISIONS.md Fase 3 — disetujui):
 *   priority = (1 − mastery) × weight
 * weight = share of the competency's items among all blueprint items of the
 * subject's try-outs in the period. Only competencies with enough data and not
 * yet "Mahir" are candidates; the top N (default 3) are returned.
 */
import type { Mastery } from "./mastery";

export interface CompetencyCandidate {
  competencyId: string;
  mastery: Mastery;
  /** Number of blueprint items mapped to this competency (in the period). */
  blueprintItems: number;
  /** Total blueprint items of the same subject (in the period). */
  subjectItems: number;
}

export interface Recommendation {
  competencyId: string;
  priority: number;
  ratio: number;
  weight: number;
}

export function recommendFocus(candidates: readonly CompetencyCandidate[], limit = 3): Recommendation[] {
  return candidates
    .filter((c) => c.mastery.status !== "kurang_data" && c.mastery.status !== "mahir" && c.mastery.ratio != null)
    .map((c) => {
      const weight = c.subjectItems > 0 ? c.blueprintItems / c.subjectItems : 0;
      return { competencyId: c.competencyId, ratio: c.mastery.ratio!, weight, priority: (1 - c.mastery.ratio!) * weight };
    })
    .filter((r) => r.weight > 0)
    .sort((a, b) => b.priority - a.priority || a.ratio - b.ratio)
    .slice(0, limit);
}
