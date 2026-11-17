import "server-only";
import { desc, eq } from "drizzle-orm";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { academicYears, achievementParticipants, achievements, schools } from "@/lib/db/schema";
import { scopeStudents } from "@/lib/tka/queries";
import type { FormStudent, FormValues } from "@/components/prestasi/achievement-form";

/** Schools, students and (when editing) the record for the achievement form. RLS-scoped. */
export async function loadAchievementForm(id: string | null) {
  const user = await requireUser(["super_admin", "school_admin"]);
  return queryAsUser(async (tx) => {
    const [year] = await tx.select({ id: academicYears.id }).from(academicYears).orderBy(desc(academicYears.isActive), desc(academicYears.startDate)).limit(1);
    const schoolList = await tx.select({ id: schools.id, name: schools.name }).from(schools).orderBy(schools.schoolCode);
    const students = year ? await scopeStudents(tx, { academicYearId: year.id, schoolId: user.schoolId }) : [];
    const formStudents: FormStudent[] = students.map((s) => ({ id: s.id, name: s.fullName, nis: s.nis, className: s.className, schoolId: s.schoolId }));
    const lockedSchool = Boolean(user.schoolId);

    let values: FormValues = {
      schoolId: user.schoolId ?? "",
      date: "",
      competition: "",
      category: "",
      level: "",
      rank: "",
      organizer: "",
      evidence: "",
      notes: "",
      participants: [],
    };
    if (id) {
      const [a] = await tx.select().from(achievements).where(eq(achievements.id, id)).limit(1);
      if (!a) return null;
      const ps = await tx
        .select({ studentId: achievementParticipants.studentId, rawName: achievementParticipants.rawName })
        .from(achievementParticipants)
        .where(eq(achievementParticipants.achievementId, id));
      values = {
        id: a.id,
        schoolId: a.schoolId,
        date: a.achievedOn,
        competition: a.competitionName,
        category: a.category ?? "",
        level: a.level ?? "",
        rank: a.rank ?? "",
        organizer: a.organizer ?? "",
        evidence: a.evidenceUrl ?? "",
        notes: a.notes ?? "",
        participants: ps,
      };
    }
    return { values, schools: user.schoolId ? schoolList.filter((s) => s.id === user.schoolId) : schoolList, students: formStudents, lockedSchool };
  });
}
