/**
 * Loaders for the TKA dashboard pages (CLAUDE.md §7.2). Each loader runs a
 * handful of aggregate queries in the caller's RLS transaction and assembles a
 * plain, serialisable view model. All formulas come from lib/metrics.
 */
import { asc, desc, eq } from "drizzle-orm";
import type { RlsTx } from "@/lib/db/rls";
import { academicYears, competencies, interventions, profiles, schools, subjects } from "@/lib/db/schema";
import {
  addMasteryCounts,
  computeMastery,
  emptyMastery,
  MASTERY_STATUS_ORDER,
  masteryTrend,
  recentWindowStart,
  type Mastery,
  type MasteryStatus,
  type TrendDirection,
} from "@/lib/metrics/mastery";
import { recommendFocus } from "@/lib/metrics/recommend";
import { describeRisk } from "@/lib/metrics/risk";
import { accuracy, average, fiveNumberSummary, histogram, presentScores, type FiveNumber, type HistogramBin } from "@/lib/metrics/tryout-kpi";
import { loadTkaSettings, type TkaSettings } from "@/lib/settings/tka";
import {
  averageByTryout,
  indexScores,
  latestTwoForSchool,
  masteryOf,
  scoreKpi,
  scoreValue,
  studentStatus,
  toCountsMap,
  type ScoreKpi,
} from "./build";
import { resolvePeriod, type ResolvedPeriod, type SubjectCode, type TkaFilters } from "./filters";
import {
  blueprintWeights,
  competencyList,
  masteryCounts,
  practiceByWeek,
  scopeStudents,
  scoresFor,
  tryoutCompetencyCounts,
  tryoutsInPeriod,
  wrongItems,
  type CompetencyInfo,
  type Scope,
  type ScopeStudent,
  type TryoutInfo,
} from "./queries";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface SchoolRef {
  id: string;
  code: string;
  name: string;
  level: "sd" | "smp";
}
export interface SubjectRef {
  id: string;
  code: string;
  name: string;
  level: "sd" | "smp";
}

export interface TkaContext {
  filters: TkaFilters;
  year: { id: string; label: string; start: string; end: string };
  years: { label: string; isActive: boolean }[];
  period: ResolvedPeriod;
  recentStart: string;
  settings: TkaSettings;
  schools: SchoolRef[];
  subjects: SubjectRef[];
}

export async function loadContext(tx: RlsTx, filters: TkaFilters, today: string): Promise<TkaContext | null> {
  const yearRows = await tx.select().from(academicYears).orderBy(desc(academicYears.startDate));
  const year = yearRows.find((y) => y.label === filters.ta) ?? yearRows.find((y) => y.isActive) ?? yearRows[0];
  if (!year) return null;
  const [settings, schoolRows, subjectRows] = await Promise.all([
    loadTkaSettings(tx),
    tx.select({ id: schools.id, code: schools.schoolCode, name: schools.name, level: schools.level }).from(schools).orderBy(asc(schools.level), asc(schools.schoolCode)),
    tx.select({ id: subjects.id, code: subjects.code, name: subjects.name, level: subjects.level }).from(subjects).orderBy(asc(subjects.level), asc(subjects.sortOrder)),
  ]);
  const y = { id: year.id, label: year.label, start: year.startDate, end: year.endDate };
  const period = resolvePeriod(filters, y, today);
  return {
    filters,
    year: y,
    years: yearRows.map((r) => ({ label: r.label, isActive: r.isActive })),
    period,
    recentStart: recentWindowStart(period.asOf, settings.mastery.weights.recentWeeks),
    settings,
    schools: schoolRows,
    subjects: subjectRows,
  };
}

function scopeOf(ctx: TkaContext, extra: Partial<Scope> = {}, subject: SubjectCode | null = ctx.filters.mapel): Scope {
  return {
    academicYearId: ctx.year.id,
    start: ctx.period.start,
    // Data after "today" cannot exist; asOf keeps "recent" anchored correctly.
    end: ctx.period.end,
    recentStart: ctx.recentStart,
    subjectCode: subject,
    ...extra,
  };
}

/** Monday of the week containing `asOf`. */
function weekOf(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return new Date(d.getTime() - (dow - 1) * 86_400_000).toISOString().slice(0, 10);
}

export interface MasteryCell {
  ratio: number | null;
  items: number;
  status: MasteryStatus;
}
const cell = (m: Mastery): MasteryCell => ({ ratio: m.ratio, items: m.items, status: m.status });

export interface CompetencyRow {
  id: string;
  code: string;
  name: string;
  elementName: string | null;
  level: "sd" | "smp";
  subjectCode: string;
}
const compRow = (c: CompetencyInfo): CompetencyRow => ({
  id: c.id,
  code: c.code,
  name: c.name,
  elementName: c.elementName,
  level: c.level,
  subjectCode: c.subjectCode,
});

export interface TrendSeries {
  id: string;
  label: string;
  points: { date: string; tryoutName: string; average: number | null; n: number }[];
}

export interface PracticeSeries {
  id: string;
  label: string;
  weeks: { weekStart: string; attempted: number; accuracy: number | null }[];
}

export interface Kpis extends ScoreKpi {
  practiceThisWeek: number;
  practiceWeekStart: string;
  needsIntervention: number;
  atRisk: number;
  students: number;
  target: number | null;
}

/** Shared computation of KPI block + per-student statuses for a set of students. */
async function kpisFor(tx: RlsTx, ctx: TkaContext, students: ScopeStudent[], extra: Partial<Scope>) {
  const allTryouts = await tryoutsInPeriod(tx, { ...scopeOf(ctx, extra, null) });
  const allScores = await scoresFor(tx, allTryouts.map((t) => t.id), extra);
  const scoreIndex = indexScores(allScores);
  const subjectCounts = toCountsMap(await masteryCounts(tx, scopeOf(ctx, extra, null), "student", "subject"));
  const subjectTryouts = allTryouts.filter((t) => t.subjectCode === ctx.filters.mapel);
  const studentSchool = new Map(students.map((s) => [s.id, s.schoolId]));
  const targetFor = (subjectId: string, schoolId: string) => ctx.settings.targetFor(subjectId, schoolId);

  const statuses = new Map(
    students.map((st) => {
      const subjectIds = ctx.subjects.filter((s) => s.level === st.level).map((s) => s.id);
      return [
        st.id,
        studentStatus({
          studentId: st.id,
          schoolId: st.schoolId,
          subjectIds,
          subjectCounts,
          tryouts: allTryouts,
          scoreIndex,
          mastery: ctx.settings.mastery,
          risk: ctx.settings.risk,
          targetFor,
        }),
      ] as const;
    }),
  );

  const week = weekOf(ctx.period.asOf);
  const practice = await practiceByWeek(tx, { ...scopeOf(ctx, extra), start: week, end: week }, "network");
  const kpi = scoreKpi({ tryouts: subjectTryouts, scores: allScores, students: studentSchool, targetFor });
  const subjectForTarget = ctx.subjects.filter((s) => s.code === ctx.filters.mapel);
  const targets = [...new Set(students.map((s) => s.schoolId))].flatMap((sid) => {
    const school = ctx.schools.find((x) => x.id === sid);
    const subj = subjectForTarget.find((s) => s.level === school?.level);
    return subj ? [ctx.settings.targetFor(subj.id, sid)] : [];
  });

  const kpis: Kpis = {
    ...kpi,
    practiceThisWeek: practice.reduce((a, r) => a + r.attempted, 0),
    practiceWeekStart: week,
    needsIntervention: [...statuses.values()].filter((s) => s.needsIntervention).length,
    atRisk: [...statuses.values()].filter((s) => s.atRisk).length,
    students: students.length,
    target: targets.length && targets.every((t) => t === targets[0]) ? targets[0]! : null,
  };
  return { kpis, statuses, allTryouts, allScores, scoreIndex, subjectTryouts };
}

// ---------------------------------------------------------------------------
// Network overview (§7.2a)
// ---------------------------------------------------------------------------

export interface HeatmapData {
  rows: CompetencyRow[];
  cols: { id: string; label: string; level?: "sd" | "smp" }[];
  /** `${rowId}|${colId}` -> cell (absent = not applicable). */
  cells: Record<string, MasteryCell>;
}

export interface NetworkView {
  kpis: Kpis;
  trend: TrendSeries[];
  distribution: { id: string; label: string; tryoutName: string | null; bins: HistogramBin[]; summary: FiveNumber | null }[];
  heatmap: HeatmapData;
  weakest: (CompetencyRow & MasteryCell)[];
  practice: PracticeSeries[];
}

export async function loadNetworkView(tx: RlsTx, ctx: TkaContext): Promise<NetworkView> {
  const students = await scopeStudents(tx, { academicYearId: ctx.year.id });
  const { kpis, allScores, subjectTryouts } = await kpisFor(tx, ctx, students, {});

  const bySchool = new Map<string, Set<string>>();
  for (const s of students) {
    if (!bySchool.has(s.schoolId)) bySchool.set(s.schoolId, new Set());
    bySchool.get(s.schoolId)!.add(s.id);
  }
  const schoolsWithStudents = ctx.schools.filter((s) => bySchool.has(s.id));

  const trend: TrendSeries[] = schoolsWithStudents.map((sc) => ({
    id: sc.id,
    label: sc.code,
    points: averageByTryout(subjectTryouts.filter((t) => t.schoolIds.includes(sc.id)), allScores, bySchool.get(sc.id)!, sc.id).map((p) => ({
      date: p.date,
      tryoutName: p.name,
      average: p.average,
      n: p.n,
    })),
  }));

  const distribution = schoolsWithStudents.map((sc) => {
    const latest = latestTwoForSchool(subjectTryouts, allScores, sc.id).latest;
    const vals = latest
      ? presentScores(allScores.filter((s) => s.tryoutId === latest.id && s.schoolId === sc.id).map((s) => ({ score: scoreValue(s), present: s.present })))
      : [];
    return { id: sc.id, label: sc.code, tryoutName: latest?.name ?? null, bins: histogram(vals), summary: fiveNumberSummary(vals) };
  });

  const [comps, schoolCounts, networkCounts, practiceRows] = await Promise.all([
    competencyList(tx, ctx.filters.mapel),
    masteryCounts(tx, scopeOf(ctx), "school", "competency").then(toCountsMap),
    masteryCounts(tx, scopeOf(ctx), "network", "competency").then(toCountsMap),
    practiceByWeek(tx, scopeOf(ctx), "school"),
  ]);

  const heatmap: HeatmapData = {
    rows: comps.map(compRow),
    cols: schoolsWithStudents.map((s) => ({ id: s.id, label: s.code, level: s.level })),
    cells: {},
  };
  for (const c of comps) {
    for (const sc of schoolsWithStudents) {
      if (sc.level !== c.level) continue;
      heatmap.cells[`${c.id}|${sc.id}`] = cell(masteryOf(schoolCounts, sc.id, c.id, ctx.settings.mastery));
    }
  }

  const weakest = comps
    .map((c) => ({ ...compRow(c), ...cell(masteryOf(networkCounts, "network", c.id, ctx.settings.mastery)) }))
    .filter((c) => c.status !== "kurang_data" && c.ratio != null)
    .sort((a, b) => a.ratio! - b.ratio!)
    .slice(0, 5);

  const practice = practiceSeries(practiceRows, schoolsWithStudents.map((s) => ({ id: s.id, label: s.code })));
  return { kpis, trend, distribution, heatmap, weakest, practice };
}

function practiceSeries(rows: { groupId: string; weekStart: string; attempted: number; correct: number }[], groups: { id: string; label: string }[]): PracticeSeries[] {
  const weeks = [...new Set(rows.map((r) => r.weekStart))].sort();
  return groups.map((g) => ({
    id: g.id,
    label: g.label,
    weeks: weeks.map((w) => {
      const rs = rows.filter((r) => r.groupId === g.id && r.weekStart === w);
      const a = rs.reduce((x, r) => x + r.attempted, 0);
      const c = rs.reduce((x, r) => x + r.correct, 0);
      return { weekStart: w, attempted: a, accuracy: accuracy(a, c) };
    }),
  }));
}

// ---------------------------------------------------------------------------
// School dashboard (§7.2b)
// ---------------------------------------------------------------------------

export interface StudentTableRow {
  id: string;
  nis: string;
  fullName: string;
  className: string | null;
  lastScore: number | null;
  lastTryoutName: string | null;
  change: number | null;
  practiceAccuracy: number | null;
  weakest: { id: string; name: string; ratio: number } | null;
  status: MasteryStatus;
  subjectStatus: MasteryStatus;
  atRisk: boolean;
  riskReasons: string[];
}

export interface SchoolView {
  school: SchoolRef;
  kpis: Kpis;
  trend: TrendSeries[];
  distribution: NetworkView["distribution"];
  heatmap: HeatmapData;
  weakest: (CompetencyRow & MasteryCell)[];
  practice: PracticeSeries[];
  students: StudentTableRow[];
}

export async function loadSchoolView(tx: RlsTx, ctx: TkaContext, school: SchoolRef): Promise<SchoolView> {
  const extra = { schoolId: school.id };
  const students = await scopeStudents(tx, { academicYearId: ctx.year.id, schoolId: school.id });
  const { kpis, statuses, allScores, subjectTryouts, scoreIndex } = await kpisFor(tx, ctx, students, extra);
  const tryouts = subjectTryouts.filter((t) => t.schoolIds.includes(school.id));

  const classes = [...new Map(students.filter((s) => s.classId).map((s) => [s.classId!, s.className ?? "?"])).entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const byClass = new Map(classes.map((c) => [c.id, new Set(students.filter((s) => s.classId === c.id).map((s) => s.id))]));

  const trend = classes.map((c) => ({
    id: c.id,
    label: `Kelas ${c.label}`,
    points: averageByTryout(tryouts, allScores, byClass.get(c.id)!).map((p) => ({ date: p.date, tryoutName: p.name, average: p.average, n: p.n })),
  }));
  const latest = tryouts.filter((t) => allScores.some((s) => s.tryoutId === t.id)).at(-1) ?? null;
  const previous = latest ? tryouts.filter((t) => t.date < latest.date || (t.date === latest.date && t.id !== latest.id && t.name < latest.name)).filter((t) => allScores.some((s) => s.tryoutId === t.id)).at(-1) ?? null : null;
  const distribution = classes.map((c) => {
    const vals = latest
      ? presentScores(allScores.filter((s) => s.tryoutId === latest.id && byClass.get(c.id)!.has(s.studentId)).map((s) => ({ score: scoreValue(s), present: s.present })))
      : [];
    return { id: c.id, label: `Kelas ${c.label}`, tryoutName: latest?.name ?? null, bins: histogram(vals), summary: fiveNumberSummary(vals) };
  });

  const [comps, classCounts, schoolCounts, studentCompCounts, practiceRows, practiceByStudent] = await Promise.all([
    competencyList(tx, ctx.filters.mapel).then((cs) => cs.filter((c) => c.level === school.level)),
    masteryCounts(tx, scopeOf(ctx, extra), "class", "competency").then(toCountsMap),
    masteryCounts(tx, scopeOf(ctx, extra), "school", "competency").then(toCountsMap),
    masteryCounts(tx, scopeOf(ctx, extra), "student", "competency").then(toCountsMap),
    practiceByWeek(tx, scopeOf(ctx, extra), "class"),
    practiceByWeek(tx, scopeOf(ctx, extra), "student"),
  ]);

  const heatmap: HeatmapData = { rows: comps.map(compRow), cols: classes.map((c) => ({ id: c.id, label: c.label })), cells: {} };
  for (const c of comps) for (const cl of classes) heatmap.cells[`${c.id}|${cl.id}`] = cell(masteryOf(classCounts, cl.id, c.id, ctx.settings.mastery));

  const weakest = comps
    .map((c) => ({ ...compRow(c), ...cell(masteryOf(schoolCounts, school.id, c.id, ctx.settings.mastery)) }))
    .filter((c) => c.status !== "kurang_data" && c.ratio != null)
    .sort((a, b) => a.ratio! - b.ratio!)
    .slice(0, 5);

  const subject = ctx.subjects.find((s) => s.code === ctx.filters.mapel && s.level === school.level);
  const practiceTotals = new Map<string, { a: number; c: number }>();
  for (const r of practiceByStudent) {
    const t = practiceTotals.get(r.groupId) ?? { a: 0, c: 0 };
    t.a += r.attempted;
    t.c += r.correct;
    practiceTotals.set(r.groupId, t);
  }

  const table: StudentTableRow[] = students.map((st) => {
    const status = statuses.get(st.id)!;
    const last = latest ? scoreIndex.get(`${latest.id}|${st.id}`) : undefined;
    const prev = previous ? scoreIndex.get(`${previous.id}|${st.id}`) : undefined;
    const lastScore = last ? scoreValue(last) : null;
    const prevScore = prev ? scoreValue(prev) : null;
    let weakestComp: StudentTableRow["weakest"] = null;
    for (const c of comps) {
      const m = masteryOf(studentCompCounts, st.id, c.id, ctx.settings.mastery);
      if (m.status === "kurang_data" || m.ratio == null) continue;
      if (!weakestComp || m.ratio < weakestComp.ratio) weakestComp = { id: c.id, name: c.name, ratio: m.ratio };
    }
    const p = practiceTotals.get(st.id);
    return {
      id: st.id,
      nis: st.nis,
      fullName: st.fullName,
      className: st.className,
      lastScore,
      lastTryoutName: latest?.name ?? null,
      change: lastScore != null && prevScore != null ? Math.round((lastScore - prevScore) * 100) / 100 : null,
      practiceAccuracy: p ? accuracy(p.a, p.c) : null,
      weakest: weakestComp,
      status: status.overall,
      subjectStatus: subject ? (status.bySubject.get(subject.id)?.status ?? "kurang_data") : "kurang_data",
      atRisk: status.atRisk,
      riskReasons: [...status.risk.entries()].flatMap(([sid, r]) => {
        const name = ctx.subjects.find((s) => s.id === sid)?.name ?? "";
        return r.reasons.map((x) => `${name}: ${describeRisk(x)}`);
      }),
    };
  });

  return {
    school,
    kpis,
    trend,
    distribution,
    heatmap,
    weakest,
    practice: practiceSeries(practiceRows, classes.map((c) => ({ id: c.id, label: `Kelas ${c.label}` }))),
    students: table,
  };
}

// ---------------------------------------------------------------------------
// Competency drill-down (heatmap click): weakest students
// ---------------------------------------------------------------------------

export interface CompetencyStudentsView {
  competency: CompetencyRow;
  pooled: MasteryCell;
  students: { id: string; fullName: string; nis: string; schoolCode: string; className: string | null; mastery: MasteryCell }[];
}

export async function loadCompetencyStudents(tx: RlsTx, ctx: TkaContext, competencyId: string, schoolId: string | null, classId: string | null): Promise<CompetencyStudentsView | null> {
  const comps = await competencyList(tx, null);
  const comp = comps.find((c) => c.id === competencyId);
  if (!comp) return null;
  const extra = { schoolId, classId };
  const subject = comp.subjectCode as SubjectCode;
  const [students, counts] = await Promise.all([
    scopeStudents(tx, { academicYearId: ctx.year.id, schoolId, classId }),
    masteryCounts(tx, scopeOf(ctx, extra, subject), "student", "competency").then(toCountsMap),
  ]);
  const relevant = students.filter((s) => s.level === comp.level);
  // Pooled over the listed students (same definition as the heatmap cell).
  const total = emptyMastery();
  for (const s of relevant) {
    const c = counts.get(s.id)?.get(comp.id);
    if (c) addMasteryCounts(total, c);
  }
  const list = relevant
    .map((s) => ({ id: s.id, fullName: s.fullName, nis: s.nis, schoolCode: s.schoolCode, className: s.className, mastery: cell(masteryOf(counts, s.id, comp.id, ctx.settings.mastery)) }))
    .sort((a, b) => statusRank(a.mastery.status) - statusRank(b.mastery.status) || (a.mastery.ratio ?? 2) - (b.mastery.ratio ?? 2));
  return { competency: compRow(comp), pooled: cell(computeMastery(total, ctx.settings.mastery)), students: list };
}

function statusRank(s: MasteryStatus) {
  const i = MASTERY_STATUS_ORDER.indexOf(s);
  return i < 0 ? MASTERY_STATUS_ORDER.length : i;
}

// ---------------------------------------------------------------------------
// Student profile (§7.2c)
// ---------------------------------------------------------------------------

export interface StudentView {
  student: ScopeStudent;
  overall: MasteryStatus;
  atRisk: boolean;
  riskReasons: string[];
  subjects: {
    id: string;
    code: string;
    name: string;
    target: number;
    status: MasteryCell;
    scores: { tryoutId: string; name: string; date: string; score: number | null; present: boolean; hasItemDetail: boolean }[];
    competencies: (CompetencyRow & MasteryCell & { trend: TrendDirection; trendDelta: number | null })[];
    practice: { weekStart: string; attempted: number; accuracy: number | null }[];
    wrong: { tryoutId: string; tryoutName: string; byCompetency: { competencyId: string | null; name: string; items: { number: number; answer: string | null; key: string | null }[] }[] }[];
  }[];
  recommendations: { competencyId: string; name: string; subjectName: string; ratio: number; weight: number; priority: number }[];
  interventions: { id: string; action: string; status: "planned" | "in_progress" | "done"; notes: string | null; outcome: string | null; startedAt: string | null; endedAt: string | null; competencyName: string | null; ownerName: string | null; createdAt: Date }[];
}

export async function loadStudentView(tx: RlsTx, ctx: TkaContext, studentId: string): Promise<StudentView | null> {
  const [student] = await scopeStudents(tx, { academicYearId: ctx.year.id, studentId });
  if (!student) return null;
  const extra = { studentId, schoolId: student.schoolId };
  const subjectList = ctx.subjects.filter((s) => s.level === student.level);

  const [tryouts, compCounts, subjectCounts, comps, practiceRows] = await Promise.all([
    tryoutsInPeriod(tx, scopeOf(ctx, { schoolId: student.schoolId }, null)),
    masteryCounts(tx, scopeOf(ctx, extra, null), "student", "competency").then(toCountsMap),
    masteryCounts(tx, scopeOf(ctx, extra, null), "student", "subject").then(toCountsMap),
    competencyList(tx, null).then((cs) => cs.filter((c) => c.level === student.level)),
    practiceByWeek(tx, scopeOf(ctx, extra, null), "student"),
  ]);
  const scores = await scoresFor(tx, tryouts.map((t) => t.id), { studentId });
  const scoreIndex = indexScores(scores);
  const [weights, wrong] = await Promise.all([
    blueprintWeights(tx, tryouts.map((t) => t.id)),
    wrongItems(tx, studentId, scores.filter((s) => s.hasItemDetail && s.present).map((s) => s.tryoutId)),
  ]);
  const status = studentStatus({
    studentId,
    schoolId: student.schoolId,
    subjectIds: subjectList.map((s) => s.id),
    subjectCounts,
    tryouts,
    scoreIndex,
    mastery: ctx.settings.mastery,
    risk: ctx.settings.risk,
    targetFor: (sid, sch) => ctx.settings.targetFor(sid, sch),
  });

  const compName = new Map(comps.map((c) => [c.id, c.name]));
  const candidates: Parameters<typeof recommendFocus>[0][number][] = [];
  const subjectsOut = subjectList.map((subj) => {
    const subjComps = comps.filter((c) => c.subjectId === subj.id);
    const subjectItems = subjComps.reduce((a, c) => a + (weights.get(c.id) ?? 0), 0);
    const competenciesOut = subjComps.map((c) => {
      const counts = compCounts.get(studentId)?.get(c.id);
      const m = masteryOf(compCounts, studentId, c.id, ctx.settings.mastery);
      const trend = counts ? masteryTrend(counts, ctx.settings.mastery) : { direction: "tidak_diketahui" as const, delta: null };
      candidates.push({ competencyId: c.id, mastery: m, blueprintItems: weights.get(c.id) ?? 0, subjectItems });
      return { ...compRow(c), ...cell(m), trend: trend.direction, trendDelta: trend.delta };
    });
    const subjTryouts = tryouts.filter((t) => t.subjectId === subj.id);
    const weeks = [...new Set(practiceRows.filter((r) => r.subjectCode === subj.code).map((r) => r.weekStart))].sort();
    return {
      id: subj.id,
      code: subj.code,
      name: subj.name,
      target: ctx.settings.targetFor(subj.id, student.schoolId),
      status: cell(status.bySubject.get(subj.id)!),
      scores: subjTryouts.map((t) => {
        const s = scoreIndex.get(`${t.id}|${studentId}`);
        return { tryoutId: t.id, name: t.name, date: t.date, score: s ? scoreValue(s) : null, present: s?.present ?? false, hasItemDetail: s?.hasItemDetail ?? false };
      }),
      competencies: competenciesOut,
      practice: weeks.map((w) => {
        const rs = practiceRows.filter((r) => r.subjectCode === subj.code && r.weekStart === w);
        const a = rs.reduce((x, r) => x + r.attempted, 0);
        return { weekStart: w, attempted: a, accuracy: accuracy(a, rs.reduce((x, r) => x + r.correct, 0)) };
      }),
      wrong: subjTryouts
        .filter((t) => wrong.some((w) => w.tryoutId === t.id))
        .reverse()
        .map((t) => {
          const items = wrong.filter((w) => w.tryoutId === t.id);
          const groups = new Map<string, typeof items>();
          for (const it of items) groups.set(it.competencyId ?? "-", [...(groups.get(it.competencyId ?? "-") ?? []), it]);
          return {
            tryoutId: t.id,
            tryoutName: t.name,
            byCompetency: [...groups.entries()].map(([cid, its]) => ({
              competencyId: cid === "-" ? null : cid,
              name: cid === "-" ? "Tanpa kompetensi" : (compName.get(cid) ?? "?"),
              items: its.map((i) => ({ number: i.number, answer: i.answer, key: i.answerKey })),
            })),
          };
        }),
    };
  });

  const recs = recommendFocus(candidates).map((r) => {
    const c = comps.find((x) => x.id === r.competencyId)!;
    return { ...r, name: c.name, subjectName: ctx.subjects.find((s) => s.id === c.subjectId)?.name ?? "" };
  });

  const ivs = await tx
    .select({
      id: interventions.id,
      action: interventions.action,
      status: interventions.status,
      notes: interventions.notes,
      outcome: interventions.outcome,
      startedAt: interventions.startedAt,
      endedAt: interventions.endedAt,
      createdAt: interventions.createdAt,
      competencyName: competencies.name,
      ownerName: profiles.fullName,
    })
    .from(interventions)
    .leftJoin(competencies, eq(competencies.id, interventions.competencyId))
    .leftJoin(profiles, eq(profiles.id, interventions.ownerUserId))
    .where(eq(interventions.studentId, studentId))
    .orderBy(desc(interventions.createdAt));

  return {
    student,
    overall: status.overall,
    atRisk: status.atRisk,
    riskReasons: [...status.risk.entries()].flatMap(([sid, r]) => r.reasons.map((x) => `${ctx.subjects.find((s) => s.id === sid)?.name}: ${describeRisk(x)}`)),
    subjects: subjectsOut,
    recommendations: recs,
    interventions: ivs,
  };
}

// ---------------------------------------------------------------------------
// Intervention groups (§7.2d)
// ---------------------------------------------------------------------------

export interface InterventionGroup {
  competency: CompetencyRow;
  students: { id: string; fullName: string; nis: string; className: string | null; ratio: number | null; status: MasteryStatus }[];
}

export async function loadInterventionGroups(tx: RlsTx, ctx: TkaContext, school: SchoolRef, includeDeveloping: boolean): Promise<InterventionGroup[]> {
  const extra = { schoolId: school.id };
  const [students, comps, counts] = await Promise.all([
    scopeStudents(tx, { academicYearId: ctx.year.id, schoolId: school.id }),
    competencyList(tx, ctx.filters.mapel).then((cs) => cs.filter((c) => c.level === school.level)),
    masteryCounts(tx, scopeOf(ctx, extra), "student", "competency").then(toCountsMap),
  ]);
  const wanted: MasteryStatus[] = includeDeveloping ? ["intervensi", "berkembang"] : ["intervensi"];
  return comps
    .map((c) => ({
      competency: compRow(c),
      students: students
        .map((s) => {
          const m = masteryOf(counts, s.id, c.id, ctx.settings.mastery);
          return { id: s.id, fullName: s.fullName, nis: s.nis, className: s.className, ratio: m.ratio, status: m.status };
        })
        .filter((s) => wanted.includes(s.status))
        .sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0)),
    }))
    .filter((g) => g.students.length > 0)
    .sort((a, b) => b.students.length - a.students.length);
}

// ---------------------------------------------------------------------------
// Try-out comparison (§7.2e)
// ---------------------------------------------------------------------------

export interface ComparisonView {
  a: TryoutInfo;
  b: TryoutInfo;
  averageA: number | null;
  averageB: number | null;
  students: { id: string; fullName: string; nis: string; schoolCode: string; className: string | null; scoreA: number | null; scoreB: number | null; change: number | null }[];
  competencies: (CompetencyRow & { ratioA: number | null; ratioB: number | null; change: number | null; itemsA: number; itemsB: number })[];
}

export async function listComparableTryouts(tx: RlsTx, ctx: TkaContext, schoolId: string | null) {
  const list = await tryoutsInPeriod(tx, { academicYearId: ctx.year.id, start: ctx.year.start, end: ctx.year.end, subjectCode: null, schoolId });
  return list;
}

export async function loadComparison(tx: RlsTx, ctx: TkaContext, aId: string, bId: string, schoolId: string | null): Promise<ComparisonView | null> {
  const all = await listComparableTryouts(tx, ctx, schoolId);
  const a = all.find((t) => t.id === aId);
  const b = all.find((t) => t.id === bId);
  if (!a || !b || a.subjectId !== b.subjectId) return null;
  const [students, scores, ca, cb, comps] = await Promise.all([
    scopeStudents(tx, { academicYearId: ctx.year.id, schoolId }),
    scoresFor(tx, [a.id, b.id], { schoolId }),
    tryoutCompetencyCounts(tx, a.id, schoolId),
    tryoutCompetencyCounts(tx, b.id, schoolId),
    competencyList(tx, a.subjectCode).then((cs) => cs.filter((c) => c.subjectId === a.subjectId)),
  ]);
  const idx = indexScores(scores);
  const rows = students
    .filter((s) => idx.has(`${a.id}|${s.id}`) || idx.has(`${b.id}|${s.id}`))
    .map((s) => {
      const sa = idx.get(`${a.id}|${s.id}`);
      const sb = idx.get(`${b.id}|${s.id}`);
      const scoreA = sa ? scoreValue(sa) : null;
      const scoreB = sb ? scoreValue(sb) : null;
      return {
        id: s.id,
        fullName: s.fullName,
        nis: s.nis,
        schoolCode: s.schoolCode,
        className: s.className,
        scoreA,
        scoreB,
        change: scoreA != null && scoreB != null ? Math.round((scoreB - scoreA) * 100) / 100 : null,
      };
    });
  const avg = (t: TryoutInfo) =>
    average(presentScores(scores.filter((s) => s.tryoutId === t.id).map((s) => ({ score: scoreValue(s), present: s.present }))));
  const mapA = new Map(ca.map((r) => [r.competencyId, r]));
  const mapB = new Map(cb.map((r) => [r.competencyId, r]));
  return {
    a,
    b,
    averageA: avg(a),
    averageB: avg(b),
    students: rows,
    competencies: comps
      .map((c) => {
        const ra = mapA.get(c.id);
        const rb = mapB.get(c.id);
        const ratioA = ra && ra.attempted ? ra.correct / ra.attempted : null;
        const ratioB = rb && rb.attempted ? rb.correct / rb.attempted : null;
        return {
          ...compRow(c),
          ratioA,
          ratioB,
          change: ratioA != null && ratioB != null ? ratioB - ratioA : null,
          itemsA: ra?.attempted ?? 0,
          itemsB: rb?.attempted ?? 0,
        };
      })
      .filter((c) => c.itemsA || c.itemsB),
  };
}
