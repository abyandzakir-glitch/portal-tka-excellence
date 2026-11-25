/**
 * Pure helpers that turn aggregate query rows into dashboard numbers.
 * Kept free of database access so they can be unit-tested and re-used by the
 * manual-verification script.
 */
import {
  addMasteryCounts,
  computeMastery,
  emptyMastery,
  worstStatus,
  type Mastery,
  type MasteryCounts,
  type MasterySettings,
  type MasteryStatus,
} from "@/lib/metrics/mastery";
import { evaluateRisk, type RiskResult, type RiskRules } from "@/lib/metrics/risk";
import { effectiveScore } from "@/lib/metrics/tryout-score";
import { average, delta, participationRate, presentScores, round2, shareMeetingTarget } from "@/lib/metrics/tryout-kpi";
import type { CountRow, ScoreInfo, TryoutInfo } from "./queries";

/** The day a school sat the TO (schools share one TO but may sit it on different days). */
export function dateFor(t: Pick<TryoutInfo, "date" | "schoolDates">, schoolId: string): string {
  return t.schoolDates[schoolId] ?? t.date;
}

/** groupId -> keyId -> counts */
export type CountsMap = Map<string, Map<string, MasteryCounts>>;

export function toCountsMap(rows: readonly CountRow[]): CountsMap {
  const out: CountsMap = new Map();
  for (const r of rows) {
    let g = out.get(r.groupId);
    if (!g) out.set(r.groupId, (g = new Map()));
    let c = g.get(r.keyId);
    if (!c) g.set(r.keyId, (c = emptyMastery()));
    const slot = c[r.source][r.recent ? "recent" : "older"];
    slot.attempted += r.attempted;
    slot.correct += r.correct;
  }
  return out;
}

export function masteryOf(map: CountsMap, groupId: string, keyId: string, s: MasterySettings): Mastery {
  return computeMastery(map.get(groupId)?.get(keyId) ?? emptyMastery(), s);
}

/** Sums all keys of a group (e.g. every competency of a subject). */
export function pooledOver(map: CountsMap, groupId: string, keys?: ReadonlySet<string>): MasteryCounts {
  const total = emptyMastery();
  for (const [k, c] of map.get(groupId) ?? []) if (!keys || keys.has(k)) addMasteryCounts(total, c);
  return total;
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export const scoreValue = (s: ScoreInfo) => (s.present ? effectiveScore({ rawScore: s.rawScore, scaledScore: s.scaledScore }) : null);

/**
 * The latest and the previous try-out (by date) that a school sat for the
 * subject within the period, considering only try-outs with at least one score.
 */
export function latestTwoForSchool(tryouts: readonly TryoutInfo[], scores: readonly ScoreInfo[], schoolId: string) {
  const withScores = new Set(scores.filter((s) => s.schoolId === schoolId).map((s) => s.tryoutId));
  const list = bySchoolDate(tryouts.filter((t) => t.schoolIds.includes(schoolId) && withScores.has(t.id)), schoolId);
  return { latest: list.at(-1) ?? null, previous: list.at(-2) ?? null };
}

/** Try-outs in the order a school sat them. */
export function bySchoolDate<T extends Pick<TryoutInfo, "date" | "schoolDates" | "name">>(tryouts: readonly T[], schoolId: string): T[] {
  return [...tryouts].sort((a, b) => dateFor(a, schoolId).localeCompare(dateFor(b, schoolId)) || a.name.localeCompare(b.name));
}

export interface ScoreKpi {
  average: number | null;
  previousAverage: number | null;
  delta: number | null;
  shareMeetingTarget: number | null;
  participation: number | null;
  present: number;
  expected: number;
}

/**
 * KPIs over a set of students for the latest TO each school sat:
 * students are compared against their own school's latest TO and target.
 */
export function scoreKpi(input: {
  tryouts: readonly TryoutInfo[];
  scores: readonly ScoreInfo[];
  /** student id -> school id (students in scope). */
  students: ReadonlyMap<string, string>;
  targetFor: (subjectId: string, schoolId: string) => number;
}): ScoreKpi {
  const schools = new Set(input.students.values());
  const latestRows: { score: number | null; present: boolean; target: number }[] = [];
  const previousRows: { score: number | null; present: boolean }[] = [];
  let expected = 0;
  for (const schoolId of schools) {
    const { latest, previous } = latestTwoForSchool(input.tryouts, input.scores, schoolId);
    if (!latest) continue;
    const studentIds = [...input.students].filter(([, sc]) => sc === schoolId).map(([id]) => id);
    expected += studentIds.length;
    const target = input.targetFor(latest.subjectId, schoolId);
    const ids = new Set(studentIds);
    for (const s of input.scores) {
      if (!ids.has(s.studentId)) continue;
      if (s.tryoutId === latest.id) latestRows.push({ score: scoreValue(s), present: s.present, target });
      if (previous && s.tryoutId === previous.id) previousRows.push({ score: scoreValue(s), present: s.present });
    }
  }
  const avg = average(presentScores(latestRows));
  const prev = average(presentScores(previousRows));
  const meeting = latestRows.filter((r) => r.present && r.score != null);
  const present = meeting.length;
  return {
    average: avg,
    previousAverage: prev,
    delta: delta(avg, prev),
    // Each student against the target of their own school (targets may differ per school).
    shareMeetingTarget: present ? meeting.filter((r) => r.score! >= r.target).length / present : null,
    participation: participationRate(present, expected),
    present,
    expected,
  };
}

/**
 * Average score per TO for a set of students (trend lines). With a school, each
 * point sits on the day that school sat the TO.
 */
export function averageByTryout(tryouts: readonly TryoutInfo[], scores: readonly ScoreInfo[], studentIds: ReadonlySet<string>, schoolId?: string) {
  return (schoolId ? bySchoolDate(tryouts, schoolId) : tryouts).map((t) => {
    const rows = scores.filter((s) => s.tryoutId === t.id && studentIds.has(s.studentId)).map((s) => ({ score: scoreValue(s), present: s.present }));
    const vals = presentScores(rows);
    return { tryoutId: t.id, date: schoolId ? dateFor(t, schoolId) : t.date, name: t.name, average: average(vals), n: vals.length };
  });
}

// ---------------------------------------------------------------------------
// Student status
// ---------------------------------------------------------------------------

export interface StudentStatus {
  /** Status per subject id. */
  bySubject: Map<string, Mastery>;
  overall: MasteryStatus;
  risk: Map<string, RiskResult>;
  atRisk: boolean;
  /** Perlu Intervensi OR at risk (KPI definition, DECISIONS.md Fase 3). */
  needsIntervention: boolean;
}

export function studentStatus(input: {
  studentId: string;
  schoolId: string;
  subjectIds: readonly string[];
  /** student × subject counts (keyBy subject). */
  subjectCounts: CountsMap;
  tryouts: readonly TryoutInfo[];
  /** indexScores() of all scores in scope. */
  scoreIndex: ReadonlyMap<string, ScoreInfo>;
  mastery: MasterySettings;
  risk: RiskRules;
  targetFor: (subjectId: string, schoolId: string) => number;
}): StudentStatus {
  const bySubject = new Map<string, Mastery>();
  const risk = new Map<string, RiskResult>();
  for (const subjectId of input.subjectIds) {
    bySubject.set(subjectId, masteryOf(input.subjectCounts, input.studentId, subjectId, input.mastery));
    const series = bySchoolDate(input.tryouts.filter((t) => t.subjectId === subjectId), input.schoolId)
      .map((t) => {
        const s = input.scoreIndex.get(`${t.id}|${input.studentId}`);
        return s ? { date: dateFor(t, input.schoolId), score: scoreValue(s) } : null;
      })
      .filter((x): x is { date: string; score: number | null } => x != null);
    risk.set(subjectId, evaluateRisk(series, input.targetFor(subjectId, input.schoolId), input.risk));
  }
  const overall = worstStatus([...bySubject.values()].map((m) => m.status));
  const atRisk = [...risk.values()].some((r) => r.atRisk);
  return { bySubject, overall, risk, atRisk, needsIntervention: overall === "intervensi" || atRisk };
}

/** tryoutId|studentId -> score, for O(1) lookups. */
export function indexScores(scores: readonly ScoreInfo[]): Map<string, ScoreInfo> {
  return new Map(scores.map((s) => [`${s.tryoutId}|${s.studentId}`, s]));
}

export { round2, shareMeetingTarget };
