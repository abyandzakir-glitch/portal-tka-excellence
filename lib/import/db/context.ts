/**
 * Loads the master data each validator needs. Every query runs in the
 * caller's transaction, so with an RLS transaction a school admin can only
 * ever match against their own school's students.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { RlsTx } from "@/lib/db/rls";
import { academicYears, classEnrollments, classes, competencies, practiceLogs, students, subjects, tryoutItems } from "@/lib/db/schema";
import { COGNITIVE_LEVELS } from "@/lib/tka/cognitive-levels";
import { dedupKey, fieldFromNotes } from "../achievements/validate";
import { Roster, type CompetencyRef, type SubjectRef } from "../lookup";
import { practiceKey } from "../tka/practice";
import type { ResultsItem } from "../tka/results";

export async function loadRoster(tx: RlsTx, schoolId: string): Promise<Roster> {
  const year = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
  const yearId = year[0]?.id ?? null;
  const rows = await tx
    .select({ id: students.id, nis: students.nis, nisn: students.nisn, fullName: students.fullName, className: classes.name })
    .from(students)
    .leftJoin(
      classEnrollments,
      and(eq(classEnrollments.studentId, students.id), yearId ? eq(classEnrollments.academicYearId, yearId) : sql`false`),
    )
    .leftJoin(classes, eq(classes.id, classEnrollments.classId))
    .where(and(eq(students.schoolId, schoolId), eq(students.isActive, true)))
    .orderBy(asc(classes.name), asc(students.fullName));
  return new Roster(rows);
}

export function loadSubjects(tx: RlsTx, level: "sd" | "smp"): Promise<(SubjectRef & { level: "sd" | "smp" })[]> {
  return tx
    .select({ id: subjects.id, code: subjects.code, name: subjects.name, level: subjects.level })
    .from(subjects)
    .where(eq(subjects.level, level))
    .orderBy(asc(subjects.sortOrder));
}

/** Sub-competencies (deepest level) of the given subjects, with their element name. */
export async function loadCompetencies(tx: RlsTx, subjectIds: readonly string[]): Promise<Map<string, CompetencyRef[]>> {
  const out = new Map<string, CompetencyRef[]>(subjectIds.map((id) => [id, []]));
  if (!subjectIds.length) return out;
  const all = await tx
    .select({
      id: competencies.id,
      subjectId: competencies.subjectId,
      parentId: competencies.parentId,
      code: competencies.code,
      name: competencies.name,
      depth: competencies.depth,
    })
    .from(competencies)
    .where(inArray(competencies.subjectId, [...subjectIds]))
    .orderBy(asc(competencies.depth), asc(competencies.sortOrder));
  const byId = new Map(all.map((c) => [c.id, c]));
  const parents = new Set(all.map((c) => c.parentId).filter(Boolean));
  for (const c of all) {
    if (parents.has(c.id) || c.depth === 1) continue; // leaves only (sub-competencies)
    out.get(c.subjectId)!.push({
      id: c.id,
      code: c.code,
      name: c.name,
      elementName: c.parentId ? (byId.get(c.parentId)?.name ?? null) : null,
    });
  }
  return out;
}

export function cognitiveLevelsFor(level: "sd" | "smp", subjectCode: string): readonly string[] {
  return COGNITIVE_LEVELS[level]?.[subjectCode] ?? [];
}

export async function loadTryoutItems(tx: RlsTx, tryoutId: string): Promise<ResultsItem[]> {
  return tx
    .select({ id: tryoutItems.id, number: tryoutItems.number, answerKey: tryoutItems.answerKey, isVoided: tryoutItems.isVoided })
    .from(tryoutItems)
    .where(eq(tryoutItems.tryoutId, tryoutId))
    .orderBy(asc(tryoutItems.number));
}

/**
 * Duplicate keys of achievements already stored for the given schools, so a
 * re-uploaded cumulative recap only adds new rows (DECISIONS.md Fase 4).
 */
export async function loadAchievementKeys(tx: RlsTx, schoolIds: readonly string[]): Promise<Set<string>> {
  if (!schoolIds.length) return new Set();
  const rows = await tx.execute<{ school_id: string; achieved_on: string; competition_name: string; notes: string | null; names: string[] | null }>(sql`
    select a.school_id, a.achieved_on::text, a.competition_name, a.notes,
           (select array_agg(p.raw_name) from public.achievement_participants p where p.achievement_id = a.id) as names
      from public.achievements a
     where a.school_id in (${sql.join(schoolIds.map((id) => sql`${id}`), sql`, `)})`);
  return new Set(
    rows.map((r) =>
      dedupKey({ schoolId: r.school_id, achievedOn: r.achieved_on, competitionName: r.competition_name, field: fieldFromNotes(r.notes), names: r.names ?? [] }),
    ),
  );
}

/** Keys of practice logs already stored for a school (to warn before replacing them). */
export async function loadPracticeKeys(tx: RlsTx, schoolId: string): Promise<Set<string>> {
  const rows = await tx
    .select({
      studentId: practiceLogs.studentId,
      weekStart: practiceLogs.weekStart,
      subjectId: practiceLogs.subjectId,
      competencyId: practiceLogs.competencyId,
    })
    .from(practiceLogs)
    .where(eq(practiceLogs.schoolId, schoolId));
  return new Set(rows.map(practiceKey));
}
