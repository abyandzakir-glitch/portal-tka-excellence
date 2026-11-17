/**
 * Try-out KPIs (CLAUDE.md §7.2a). Inputs are plain score lists so the same
 * functions serve the network, a school, a class or a single student.
 * Absent students are excluded from averages and target rates and counted
 * as non-participants.
 */

export interface ScoreRow {
  /** Effective score (scaled if present, else raw); null when absent. */
  score: number | null;
  present: boolean;
}

export const round2 = (x: number) => Math.round(x * 100) / 100;

export function presentScores(rows: readonly ScoreRow[]): number[] {
  return rows.filter((r) => r.present && r.score != null).map((r) => r.score!);
}

export function average(values: readonly number[]): number | null {
  if (!values.length) return null;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Share (0..1) of present students with score >= target. */
export function shareMeetingTarget(rows: readonly ScoreRow[], target: number): number | null {
  const s = presentScores(rows);
  if (!s.length) return null;
  return s.filter((x) => x >= target).length / s.length;
}

/**
 * Participation (0..1) = students who sat the TO ÷ students expected to sit it
 * (active students of the participating schools/classes in scope).
 */
export function participationRate(presentCount: number, expectedCount: number): number | null {
  if (expectedCount <= 0) return null;
  return Math.min(1, presentCount / expectedCount);
}

/** Change of an average versus the previous one (null when either is missing). */
export function delta(current: number | null, previous: number | null): number | null {
  return current == null || previous == null ? null : round2(current - previous);
}

export interface HistogramBin {
  /** Inclusive lower bound. */
  from: number;
  /** Exclusive upper bound (the last bin includes 100). */
  to: number;
  label: string;
  count: number;
}

/** Score distribution in fixed-width bins over 0–100 (default width 10). */
export function histogram(values: readonly number[], width = 10): HistogramBin[] {
  const bins: HistogramBin[] = [];
  for (let from = 0; from < 100; from += width) {
    const to = Math.min(100, from + width);
    bins.push({ from, to, label: `${from}–${to === 100 ? 100 : to - 1}`, count: 0 });
  }
  for (const v of values) {
    const i = Math.min(bins.length - 1, Math.max(0, Math.floor(v / width)));
    bins[i]!.count++;
  }
  return bins;
}

export interface FiveNumber {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  n: number;
}

/** Linear-interpolation quantile (same as Excel QUARTILE.INC). */
export function quantile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return round2(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo));
}

export function fiveNumberSummary(values: readonly number[]): FiveNumber | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return { min: s[0]!, q1: quantile(s, 0.25), median: quantile(s, 0.5), q3: quantile(s, 0.75), max: s[s.length - 1]!, n: s.length };
}

/** Practice accuracy (0..1) from summed counts. */
export function accuracy(attempted: number, correct: number): number | null {
  return attempted > 0 ? correct / attempted : null;
}
