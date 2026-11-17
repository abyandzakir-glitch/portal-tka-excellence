/**
 * At-risk students (CLAUDE.md §7.3): below target on N consecutive try-outs,
 * OR a drop of more than X points versus the previous try-out (both configurable).
 *
 * Evaluated per subject on the student's try-outs in date order. Absences are
 * skipped: "consecutive" means consecutive try-outs the student actually sat,
 * and the drop compares the last two scores the student has.
 */

export interface RiskRules {
  consecutiveBelowTarget: number;
  maxDropPoints: number;
}

export interface ScoredTryout {
  date: string;
  /** Effective score (scaled if present, else raw); null when absent. */
  score: number | null;
}

export type RiskReason =
  | { kind: "below_target"; count: number; target: number }
  | { kind: "drop"; from: number; to: number; points: number };

export interface RiskResult {
  atRisk: boolean;
  reasons: RiskReason[];
}

export function evaluateRisk(tryouts: readonly ScoredTryout[], target: number, rules: RiskRules): RiskResult {
  const scores = [...tryouts]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => t.score)
    .filter((s): s is number => s != null);
  const reasons: RiskReason[] = [];

  const n = Math.max(1, rules.consecutiveBelowTarget);
  if (scores.length >= n && scores.slice(-n).every((s) => s < target)) {
    reasons.push({ kind: "below_target", count: n, target });
  }
  if (scores.length >= 2) {
    const from = scores[scores.length - 2]!;
    const to = scores[scores.length - 1]!;
    const points = Math.round((from - to) * 100) / 100;
    if (points > rules.maxDropPoints) reasons.push({ kind: "drop", from, to, points });
  }
  return { atRisk: reasons.length > 0, reasons };
}

export function describeRisk(r: RiskReason): string {
  if (r.kind === "below_target") return `Di bawah target (${r.target}) pada ${r.count} TO terakhir`;
  return `Turun ${r.points.toLocaleString("id-ID")} poin (${r.from.toLocaleString("id-ID")} → ${r.to.toLocaleString("id-ID")})`;
}
