/**
 * Competency mastery (CLAUDE.md §7.3, DECISIONS.md Fase 3 — disetujui).
 *
 *   ratio(source) = (correct_recent × m + correct_older) / (attempted_recent × m + attempted_older)
 *   mastery       = w_to × ratio(TO) + w_practice × ratio(practice)      (weights renormalised
 *                   over the sources that have data: one source alone counts 100%)
 *
 * "Recent" = within the last `recentWeeks` weeks before the end of the selected
 * period; m = `recentMultiplier`. Fewer than `minItems` items (both sources
 * together, unweighted) -> "Data belum cukup" (no status).
 *
 * Pooling: a group (class, school) is evaluated by summing the counts of all
 * its students first, then applying the same formula.
 */

export interface Counts {
  attempted: number;
  correct: number;
}

/** Counts split by recency. */
export interface WeightedCounts {
  recent: Counts;
  older: Counts;
}

export interface MasteryCounts {
  tryout: WeightedCounts;
  practice: WeightedCounts;
}

export interface MasteryWeights {
  tryout: number;
  practice: number;
  recentWeeks: number;
  recentMultiplier: number;
}

/** Lower bounds (inclusive), as ratios. */
export interface MasteryThresholds {
  berkembang: number;
  cakap: number;
  mahir: number;
}

export interface MasterySettings {
  weights: MasteryWeights;
  thresholds: MasteryThresholds;
  minItems: number;
}

export type MasteryStatus = "intervensi" | "berkembang" | "cakap" | "mahir" | "kurang_data";

export const MASTERY_STATUS_LABEL: Record<MasteryStatus, string> = {
  intervensi: "Perlu Intervensi",
  berkembang: "Berkembang",
  cakap: "Cakap",
  mahir: "Mahir",
  kurang_data: "Data belum cukup",
};

/** Lowest first: used to pick the "worst" status. */
export const MASTERY_STATUS_ORDER: readonly MasteryStatus[] = ["intervensi", "berkembang", "cakap", "mahir"];

export interface Mastery {
  /** 0..1, null when there is no data at all. */
  ratio: number | null;
  /** Unweighted number of items behind the ratio (TO + practice). */
  items: number;
  status: MasteryStatus;
}

export const emptyCounts = (): Counts => ({ attempted: 0, correct: 0 });
export const emptyWeighted = (): WeightedCounts => ({ recent: emptyCounts(), older: emptyCounts() });
export const emptyMastery = (): MasteryCounts => ({ tryout: emptyWeighted(), practice: emptyWeighted() });

/** Adds `b` into `a` (mutates and returns `a`). */
export function addMasteryCounts(a: MasteryCounts, b: MasteryCounts): MasteryCounts {
  for (const src of ["tryout", "practice"] as const) {
    for (const when of ["recent", "older"] as const) {
      a[src][when].attempted += b[src][when].attempted;
      a[src][when].correct += b[src][when].correct;
    }
  }
  return a;
}

export function weightedRatio(c: WeightedCounts, multiplier: number): number | null {
  const den = c.recent.attempted * multiplier + c.older.attempted;
  if (den <= 0) return null;
  return (c.recent.correct * multiplier + c.older.correct) / den;
}

export function totalItems(c: MasteryCounts): number {
  return c.tryout.recent.attempted + c.tryout.older.attempted + c.practice.recent.attempted + c.practice.older.attempted;
}

export function statusForRatio(ratio: number, t: MasteryThresholds): Exclude<MasteryStatus, "kurang_data"> {
  // Compare in whole hundredths of a percent to avoid 0.7 - 1e-16 style misclassification.
  const r = Math.round(ratio * 10_000) / 10_000;
  if (r >= t.mahir) return "mahir";
  if (r >= t.cakap) return "cakap";
  if (r >= t.berkembang) return "berkembang";
  return "intervensi";
}

export function computeMastery(c: MasteryCounts, s: MasterySettings): Mastery {
  const m = s.weights.recentMultiplier;
  const to = weightedRatio(c.tryout, m);
  const pr = weightedRatio(c.practice, m);
  let ratio: number | null = null;
  if (to != null && pr != null) {
    const wsum = s.weights.tryout + s.weights.practice;
    ratio = wsum > 0 ? (s.weights.tryout * to + s.weights.practice * pr) / wsum : (to + pr) / 2;
  } else {
    ratio = to ?? pr;
  }
  const items = totalItems(c);
  if (ratio == null || items < s.minItems) return { ratio, items, status: "kurang_data" };
  return { ratio, items, status: statusForRatio(ratio, s.thresholds) };
}

/** The lowest status among the given ones, ignoring "kurang_data" unless nothing else is known. */
export function worstStatus(statuses: readonly MasteryStatus[]): MasteryStatus {
  for (const s of MASTERY_STATUS_ORDER) if (statuses.includes(s)) return s;
  return "kurang_data";
}

/**
 * Is a dated observation "recent"? True when date is within
 * (periodEnd − recentWeeks×7 days, periodEnd]. Dates are ISO "YYYY-MM-DD".
 */
export function isRecent(date: string, periodEnd: string, recentWeeks: number): boolean {
  if (date > periodEnd) return false;
  const end = Date.UTC(+periodEnd.slice(0, 4), +periodEnd.slice(5, 7) - 1, +periodEnd.slice(8, 10));
  const d = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  return end - d < recentWeeks * 7 * 86_400_000;
}

/** First day of the recent window (inclusive), as ISO date — for SQL filters. */
export function recentWindowStart(periodEnd: string, recentWeeks: number): string {
  const end = Date.UTC(+periodEnd.slice(0, 4), +periodEnd.slice(5, 7) - 1, +periodEnd.slice(8, 10));
  return new Date(end - (recentWeeks * 7 - 1) * 86_400_000).toISOString().slice(0, 10);
}

export type TrendDirection = "naik" | "turun" | "stagnan" | "tidak_diketahui";

/** Minimum change (in ratio points) to call a trend up or down. */
export const TREND_DELTA = 0.05;

/**
 * Trend of one competency: mastery from recent data vs. mastery from older
 * data (each side must have enough items on its own).
 */
export function masteryTrend(c: MasteryCounts, s: MasterySettings): { direction: TrendDirection; delta: number | null } {
  const only = (when: "recent" | "older"): MasteryCounts => ({
    tryout: { recent: when === "recent" ? c.tryout.recent : emptyCounts(), older: when === "older" ? c.tryout.older : emptyCounts() },
    practice: { recent: when === "recent" ? c.practice.recent : emptyCounts(), older: when === "older" ? c.practice.older : emptyCounts() },
  });
  const recent = computeMastery(only("recent"), s);
  const older = computeMastery(only("older"), s);
  if (recent.status === "kurang_data" || older.status === "kurang_data" || recent.ratio == null || older.ratio == null) {
    return { direction: "tidak_diketahui", delta: null };
  }
  const delta = recent.ratio - older.ratio;
  return { direction: delta >= TREND_DELTA ? "naik" : delta <= -TREND_DELTA ? "turun" : "stagnan", delta };
}
