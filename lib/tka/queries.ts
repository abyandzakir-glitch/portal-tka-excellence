/**
 * Aggregate queries for the TKA dashboard. The database only sums counts;
 * every formula lives in lib/metrics (pure, unit-tested). All queries run in
 * the caller's RLS transaction, so a school admin's numbers can only ever come
 * from their own school.
 */
import { sql, type SQL } from "drizzle-orm";
import type { RlsTx } from "@/lib/db/rls";

export interface Scope {
  academicYearId: string;
  start: string;
  end: string;
  /** First day of the "recent" window (inclusive). */
  recentStart: string;
  /** null = both subjects. */
  subjectCode: string | null;
  schoolId?: string | null;
  classId?: string | null;
  studentId?: string | null;
}

export type GroupBy = "network" | "school" | "class" | "student";
export type KeyBy = "competency" | "subject";

export interface CountRow {
  groupId: string;
  keyId: string;
  source: "tryout" | "practice";
  recent: boolean;
  attempted: number;
  correct: number;
}

function groupExpr(by: GroupBy, alias: string): SQL {
  switch (by) {
    case "network":
      return sql`'network'`;
    case "school":
      return sql.raw(`${alias}.school_id::text`);
    case "student":
      return sql.raw(`${alias}.student_id::text`);
    case "class":
      return sql.raw(`e.class_id::text`);
  }
}

/**
 * Correct/attempted per group × competency (or subject) × source × recency.
 * TO: every non-voided item response with a competency (unanswered = wrong).
 * Practice: logs that name a competency (mixed practice is volume-only).
 */
export async function masteryCounts(tx: RlsTx, scope: Scope, groupBy: GroupBy, keyBy: KeyBy): Promise<CountRow[]> {
  const key = keyBy === "competency" ? sql.raw("c.id::text") : sql.raw("c.subject_id::text");
  const enrollJoin = (alias: string) =>
    groupBy === "class" || scope.classId
      ? sql`join public.class_enrollments e on e.student_id = ${sql.raw(alias)}.student_id and e.academic_year_id = ${scope.academicYearId}`
      : sql``;
  const filters = (alias: string) => sql`
    ${scope.subjectCode ? sql`and s.code = ${scope.subjectCode}` : sql``}
    ${scope.schoolId ? sql`and ${sql.raw(alias)}.school_id = ${scope.schoolId}` : sql``}
    ${scope.studentId ? sql`and ${sql.raw(alias)}.student_id = ${scope.studentId}` : sql``}
    ${scope.classId ? sql`and e.class_id = ${scope.classId}` : sql``}`;

  const rows = await tx.execute<{ g: string; k: string; src: "tryout" | "practice"; recent: boolean; attempted: number; correct: number }>(sql`
    select ${groupExpr(groupBy, "r")} as g, ${key} as k, 'tryout' as src, (t.date >= ${scope.recentStart}) as recent,
           count(*)::int as attempted, count(*) filter (where r.is_correct)::int as correct
      from public.item_responses r
      join public.tryout_items i on i.id = r.item_id and not i.is_voided
      join public.competencies c on c.id = i.competency_id
      join public.tryouts t on t.id = r.tryout_id
      join public.subjects s on s.id = t.subject_id
      ${enrollJoin("r")}
     where t.academic_year_id = ${scope.academicYearId} and t.date between ${scope.start} and ${scope.end}
       ${filters("r")}
     group by 1, 2, 3, 4
    union all
    select ${groupExpr(groupBy, "p")}, ${key}, 'practice', (p.week_start >= ${scope.recentStart}),
           sum(p.attempted)::int, sum(p.correct)::int
      from public.practice_logs p
      join public.competencies c on c.id = p.competency_id
      join public.subjects s on s.id = p.subject_id
      ${enrollJoin("p")}
     where p.week_start between ${scope.start} and ${scope.end}
       ${filters("p")}
     group by 1, 2, 3, 4`);
  return rows.map((r) => ({ groupId: r.g, keyId: r.k, source: r.src, recent: r.recent, attempted: r.attempted, correct: r.correct }));
}

export interface ScopeStudent {
  id: string;
  nis: string;
  nisn: string | null;
  fullName: string;
  schoolId: string;
  schoolCode: string;
  schoolName: string;
  level: "sd" | "smp";
  classId: string | null;
  className: string | null;
}

/** Active students in scope with their class in the academic year. */
export function scopeStudents(tx: RlsTx, scope: Pick<Scope, "academicYearId" | "schoolId" | "classId" | "studentId">): Promise<ScopeStudent[]> {
  return tx.execute<ScopeStudent & Record<string, unknown>>(sql`
    select st.id, st.nis, st.nisn, st.full_name as "fullName", st.school_id as "schoolId", sc.school_code as "schoolCode",
           sc.name as "schoolName", sc.level, e.class_id as "classId", cl.name as "className"
      from public.students st
      join public.schools sc on sc.id = st.school_id
      left join public.class_enrollments e on e.student_id = st.id and e.academic_year_id = ${scope.academicYearId}
      left join public.classes cl on cl.id = e.class_id
     where st.is_active
       ${scope.schoolId ? sql`and st.school_id = ${scope.schoolId}` : sql``}
       ${scope.classId ? sql`and e.class_id = ${scope.classId}` : sql``}
       ${scope.studentId ? sql`and st.id = ${scope.studentId}` : sql``}
     order by sc.school_code, cl.name nulls last, st.full_name`) as unknown as Promise<ScopeStudent[]>;
}

export interface TryoutInfo {
  id: string;
  name: string;
  date: string;
  level: "sd" | "smp";
  subjectId: string;
  subjectCode: string;
  /** Non-voided items. */
  itemCount: number;
  schoolIds: string[];
}

export async function tryoutsInPeriod(tx: RlsTx, scope: Pick<Scope, "academicYearId" | "start" | "end" | "subjectCode" | "schoolId">): Promise<TryoutInfo[]> {
  const rows = await tx.execute<Omit<TryoutInfo, "schoolIds"> & { schoolIds: string[] | null } & Record<string, unknown>>(sql`
    select t.id, t.name, t.date::text as date, t.level, t.subject_id as "subjectId", s.code as "subjectCode",
           (select count(*)::int from public.tryout_items i where i.tryout_id = t.id and not i.is_voided) as "itemCount",
           (select array_agg(ts.school_id::text) from public.tryout_schools ts where ts.tryout_id = t.id) as "schoolIds"
      from public.tryouts t join public.subjects s on s.id = t.subject_id
     where t.academic_year_id = ${scope.academicYearId} and t.date between ${scope.start} and ${scope.end}
       ${scope.subjectCode ? sql`and s.code = ${scope.subjectCode}` : sql``}
       ${scope.schoolId ? sql`and exists (select 1 from public.tryout_schools ts where ts.tryout_id = t.id and ts.school_id = ${scope.schoolId})` : sql``}
     order by t.date, t.name`);
  return rows.map((r) => ({ ...r, schoolIds: r.schoolIds ?? [] }));
}

export interface ScoreInfo {
  tryoutId: string;
  studentId: string;
  schoolId: string;
  rawScore: number | null;
  scaledScore: number | null;
  present: boolean;
  hasItemDetail: boolean;
}

export async function scoresFor(tx: RlsTx, tryoutIds: readonly string[], scope: Pick<Scope, "schoolId" | "studentId"> = {}): Promise<ScoreInfo[]> {
  if (!tryoutIds.length) return [];
  const rows = await tx.execute<{ t: string; st: string; sc: string; raw: string | null; scaled: string | null; status: string; detail: boolean }>(sql`
    select tryout_id as t, student_id as st, school_id as sc, raw_score::text as raw, scaled_score::text as scaled, status, has_item_detail as detail
      from public.tryout_scores
     where tryout_id in (${sql.join(tryoutIds.map((id) => sql`${id}`), sql`, `)})
       ${scope.schoolId ? sql`and school_id = ${scope.schoolId}` : sql``}
       ${scope.studentId ? sql`and student_id = ${scope.studentId}` : sql``}`);
  return rows.map((r) => ({
    tryoutId: r.t,
    studentId: r.st,
    schoolId: r.sc,
    rawScore: r.raw == null ? null : Number(r.raw),
    scaledScore: r.scaled == null ? null : Number(r.scaled),
    present: r.status === "present",
    hasItemDetail: r.detail,
  }));
}

export interface PracticeWeekRow {
  groupId: string;
  weekStart: string;
  subjectCode: string;
  attempted: number;
  correct: number;
}

/** Weekly practice volume (all logs, with or without competency). */
export async function practiceByWeek(tx: RlsTx, scope: Scope, groupBy: GroupBy): Promise<PracticeWeekRow[]> {
  const rows = await tx.execute<{ g: string; w: string; s: string; a: number; c: number }>(sql`
    select ${groupExpr(groupBy, "p")} as g, p.week_start::text as w, s.code as s, sum(p.attempted)::int as a, sum(p.correct)::int as c
      from public.practice_logs p
      join public.subjects s on s.id = p.subject_id
      ${groupBy === "class" || scope.classId ? sql`join public.class_enrollments e on e.student_id = p.student_id and e.academic_year_id = ${scope.academicYearId}` : sql``}
     where p.week_start between ${scope.start} and ${scope.end}
       ${scope.subjectCode ? sql`and s.code = ${scope.subjectCode}` : sql``}
       ${scope.schoolId ? sql`and p.school_id = ${scope.schoolId}` : sql``}
       ${scope.studentId ? sql`and p.student_id = ${scope.studentId}` : sql``}
       ${scope.classId ? sql`and e.class_id = ${scope.classId}` : sql``}
     group by 1, 2, 3 order by 2`);
  return rows.map((r) => ({ groupId: r.g, weekStart: r.w, subjectCode: r.s, attempted: r.a, correct: r.c }));
}

export interface CompetencyInfo {
  id: string;
  code: string;
  name: string;
  elementName: string | null;
  subjectId: string;
  subjectCode: string;
  level: "sd" | "smp";
  sortKey: string;
}

/** Sub-competencies (leaves) with element names, in framework order. */
export async function competencyList(tx: RlsTx, subjectCode: string | null): Promise<CompetencyInfo[]> {
  return tx.execute<CompetencyInfo & Record<string, unknown>>(sql`
    select c.id, c.code, c.name, p.name as "elementName", c.subject_id as "subjectId", s.code as "subjectCode", s.level,
           lpad(s.sort_order::text, 3, '0') || lpad(coalesce(p.sort_order, 0)::text, 3, '0') || lpad(c.sort_order::text, 3, '0') as "sortKey"
      from public.competencies c
      join public.subjects s on s.id = c.subject_id
      left join public.competencies p on p.id = c.parent_id
     where not exists (select 1 from public.competencies ch where ch.parent_id = c.id) and c.depth > 1
       ${subjectCode ? sql`and s.code = ${subjectCode}` : sql``}
     order by s.level, "sortKey"`) as unknown as Promise<CompetencyInfo[]>;
}

/** Number of non-voided blueprint items per competency for the given try-outs. */
export async function blueprintWeights(tx: RlsTx, tryoutIds: readonly string[]): Promise<Map<string, number>> {
  if (!tryoutIds.length) return new Map();
  const rows = await tx.execute<{ c: string; n: number }>(sql`
    select competency_id as c, count(*)::int as n from public.tryout_items
     where tryout_id in (${sql.join(tryoutIds.map((id) => sql`${id}`), sql`, `)}) and not is_voided and competency_id is not null
     group by 1`);
  return new Map(rows.map((r) => [r.c, r.n]));
}

export interface WrongItem {
  tryoutId: string;
  number: number;
  competencyId: string | null;
  answer: string | null;
  answerKey: string | null;
}

/** Items a student answered wrongly or left blank (non-voided), per try-out. */
export function wrongItems(tx: RlsTx, studentId: string, tryoutIds: readonly string[]): Promise<WrongItem[]> {
  if (!tryoutIds.length) return Promise.resolve([]);
  return tx.execute<WrongItem & Record<string, unknown>>(sql`
    select r.tryout_id as "tryoutId", i.number, i.competency_id as "competencyId", r.answer, i.answer_key as "answerKey"
      from public.item_responses r join public.tryout_items i on i.id = r.item_id
     where r.student_id = ${studentId} and not i.is_voided and coalesce(r.is_correct, false) = false
       and r.tryout_id in (${sql.join(tryoutIds.map((id) => sql`${id}`), sql`, `)})
     order by i.number`) as unknown as Promise<WrongItem[]>;
}

/** Per-competency correct/attempted inside one try-out (for TO comparison). */
export async function tryoutCompetencyCounts(tx: RlsTx, tryoutId: string, schoolId: string | null) {
  return tx.execute<{ competencyId: string; attempted: number; correct: number }>(sql`
    select i.competency_id as "competencyId", count(*)::int as attempted, count(*) filter (where r.is_correct)::int as correct
      from public.item_responses r join public.tryout_items i on i.id = r.item_id
     where r.tryout_id = ${tryoutId} and not i.is_voided and i.competency_id is not null
       ${schoolId ? sql`and r.school_id = ${schoolId}` : sql``}
     group by 1`);
}
