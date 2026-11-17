import "server-only";
import { and, asc, count, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import {
  academicYears,
  classEnrollments,
  classes,
  competencies,
  schools,
  students,
  subjects,
} from "@/lib/db/schema";
import type { RlsTx } from "@/lib/db/rls";

/**
 * Master-data read queries. Every function receives an RLS transaction
 * (queryAsUser), so a school admin only ever sees rows of their own school.
 */

export async function getActiveAcademicYear(tx: RlsTx) {
  const rows = await tx.select().from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
  return rows[0] ?? null;
}

export function listAcademicYears(tx: RlsTx) {
  return tx.select().from(academicYears).orderBy(sql`${academicYears.startDate} desc`);
}

/** Schools with their active student count (count is RLS-filtered). */
export function listSchoolsWithCounts(tx: RlsTx) {
  const activeStudents = tx
    .select({ schoolId: students.schoolId, total: count().as("total") })
    .from(students)
    .where(eq(students.isActive, true))
    .groupBy(students.schoolId)
    .as("active_students");

  return tx
    .select({
      id: schools.id,
      schoolCode: schools.schoolCode,
      name: schools.name,
      level: schools.level,
      city: schools.city,
      studentCount: sql<number>`coalesce(${activeStudents.total}, 0)`.mapWith(Number),
    })
    .from(schools)
    .leftJoin(activeStudents, eq(activeStudents.schoolId, schools.id))
    .orderBy(asc(schools.level), asc(schools.schoolCode));
}

export function listClasses(tx: RlsTx, academicYearId: string) {
  const enrolled = tx
    .select({ classId: classEnrollments.classId, total: count().as("total") })
    .from(classEnrollments)
    .groupBy(classEnrollments.classId)
    .as("enrolled");

  return tx
    .select({
      id: classes.id,
      name: classes.name,
      grade: classes.grade,
      schoolCode: schools.schoolCode,
      schoolName: schools.name,
      studentCount: sql<number>`coalesce(${enrolled.total}, 0)`.mapWith(Number),
    })
    .from(classes)
    .innerJoin(schools, eq(schools.id, classes.schoolId))
    .leftJoin(enrolled, eq(enrolled.classId, classes.id))
    .where(eq(classes.academicYearId, academicYearId))
    .orderBy(asc(schools.schoolCode), asc(classes.grade), asc(classes.name));
}

export interface StudentFilters {
  q?: string;
  schoolCode?: string;
  page: number;
  pageSize: number;
}

export async function listStudents(tx: RlsTx, academicYearId: string | null, f: StudentFilters) {
  const conditions: SQL[] = [];
  if (f.q) {
    const term = `%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conditions.push(or(ilike(students.fullName, term), ilike(students.nis, term), ilike(students.nisn, term))!);
  }
  if (f.schoolCode) conditions.push(eq(schools.schoolCode, f.schoolCode));
  const where = conditions.length ? and(...conditions) : undefined;

  const enrollment = academicYearId
    ? and(eq(classEnrollments.studentId, students.id), eq(classEnrollments.academicYearId, academicYearId))
    : sql`false`;

  const [rows, totals] = await Promise.all([
    tx
      .select({
        id: students.id,
        nis: students.nis,
        nisn: students.nisn,
        fullName: students.fullName,
        gender: students.gender,
        isActive: students.isActive,
        schoolCode: schools.schoolCode,
        className: classes.name,
      })
      .from(students)
      .innerJoin(schools, eq(schools.id, students.schoolId))
      .leftJoin(classEnrollments, enrollment)
      .leftJoin(classes, eq(classes.id, classEnrollments.classId))
      .where(where)
      .orderBy(asc(schools.schoolCode), asc(classes.name), asc(students.fullName))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    tx
      .select({ total: count() })
      .from(students)
      .innerJoin(schools, eq(schools.id, students.schoolId))
      .where(where),
  ]);

  return { rows, total: totals[0]?.total ?? 0 };
}

export function listSubjectsWithCounts(tx: RlsTx) {
  const comp = tx
    .select({ subjectId: competencies.subjectId, total: count().as("total") })
    .from(competencies)
    .where(eq(competencies.depth, 2))
    .groupBy(competencies.subjectId)
    .as("comp");

  return tx
    .select({
      id: subjects.id,
      code: subjects.code,
      name: subjects.name,
      level: subjects.level,
      subCompetencyCount: sql<number>`coalesce(${comp.total}, 0)`.mapWith(Number),
    })
    .from(subjects)
    .leftJoin(comp, eq(comp.subjectId, subjects.id))
    .orderBy(asc(subjects.level), asc(subjects.sortOrder));
}

export async function listCompetencyTree(tx: RlsTx) {
  const [subjectRows, compRows] = await Promise.all([
    tx.select().from(subjects).orderBy(asc(subjects.level), asc(subjects.sortOrder)),
    tx.select().from(competencies).orderBy(asc(competencies.depth), asc(competencies.sortOrder)),
  ]);
  return subjectRows.map((s) => {
    const own = compRows.filter((c) => c.subjectId === s.id);
    const elements = own
      .filter((c) => c.depth === 1)
      .map((el) => ({ ...el, children: own.filter((c) => c.parentId === el.id) }));
    return { ...s, elements };
  });
}
