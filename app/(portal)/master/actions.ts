"use server";

import { and, desc, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { academicYears, classEnrollments, classes, competencies, students } from "@/lib/db/schema";
import { academicYearRange } from "@/lib/format/id";
import { classNameFor, parseClass, parseGrade } from "@/lib/import/students/validate";

/**
 * Master data maintenance (Fase 5; CLAUDE.md §7.1 "bisa ditambah/diedit lewat
 * menu master data"). RLS enforces scope: school admins write only their own
 * school's students/classes; academic years and competencies are Super Admin.
 * Every change is recorded by the audit triggers.
 */

export interface MasterState {
  error?: string;
  message?: string;
}

const WRITERS = ["super_admin", "school_admin"] as const;
const opt = (s: z.ZodType) => z.preprocess((v) => (v === "" || v == null ? undefined : v), s.optional());

class Problem extends Error {}

async function run(fn: () => Promise<string>): Promise<MasterState> {
  try {
    const message = await fn();
    refresh();
    return { message };
  } catch (e) {
    if (e instanceof Problem) return { error: e.message };
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
    if (/duplicate key|unique/i.test(cause)) return { error: "Data yang sama sudah ada (mis. NISN, NIS, atau nama kelas dipakai data lain)." };
    if (/row-level security|permission denied/i.test(cause)) return { error: "Anda tidak punya akses untuk mengubah data ini." };
    console.error("[master]", e instanceof Error ? (e.cause ?? e.message) : e);
    return { error: "Perubahan belum bisa disimpan. Coba lagi." };
  }
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

const studentSchema = z.object({
  id: z.uuid(),
  nama: z.string().trim().min(2, "Nama minimal 2 karakter.").max(200),
  nisn: opt(z.string().trim().regex(/^\d{10}$/, "NISN harus 10 digit.")),
  jk: opt(z.enum(["L", "P"])),
  kelas: opt(z.uuid()),
});

export async function saveStudent(_prev: MasterState, fd: FormData): Promise<MasterState> {
  await requireUser(WRITERS);
  const p = studentSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Isian belum lengkap." };
  const d = p.data;
  return run(() =>
    queryAsUser(async (tx) => {
      const [st] = await tx
        .update(students)
        .set({ fullName: d.nama, nisn: (d.nisn as string | undefined) ?? null, gender: (d.jk as "L" | "P" | undefined) ?? null })
        .where(eq(students.id, d.id))
        .returning({ id: students.id, schoolId: students.schoolId });
      if (!st) throw new Problem("Siswa tidak ditemukan atau Anda tidak punya akses.");
      const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
      if (year && d.kelas) {
        const [cls] = await tx.select({ id: classes.id }).from(classes).where(and(eq(classes.id, d.kelas as string), eq(classes.schoolId, st.schoolId), eq(classes.academicYearId, year.id))).limit(1);
        if (!cls) throw new Problem("Kelas tidak valid untuk sekolah ini.");
        await tx.delete(classEnrollments).where(and(eq(classEnrollments.studentId, st.id), eq(classEnrollments.academicYearId, year.id)));
        await tx.insert(classEnrollments).values({ studentId: st.id, classId: cls.id, academicYearId: year.id, schoolId: st.schoolId });
      }
      return "Data siswa tersimpan.";
    }),
  );
}

export async function setStudentActive(_prev: MasterState, fd: FormData): Promise<MasterState> {
  await requireUser(WRITERS);
  const id = z.uuid().safeParse(fd.get("id"));
  const active = fd.get("aktif") === "1";
  if (!id.success) return { error: "Data tidak valid." };
  return run(() =>
    queryAsUser(async (tx) => {
      const r = await tx.update(students).set({ isActive: active }).where(eq(students.id, id.data)).returning({ id: students.id });
      if (!r.length) throw new Problem("Siswa tidak ditemukan atau Anda tidak punya akses.");
      return active ? "Siswa diaktifkan kembali." : "Siswa dinonaktifkan. Datanya tetap tersimpan dan tidak lagi dihitung di dashboard.";
    }),
  );
}

// ---------------------------------------------------------------------------
// Classes & academic years
// ---------------------------------------------------------------------------

export async function addClass(_prev: MasterState, fd: FormData): Promise<MasterState> {
  const user = await requireUser(WRITERS);
  const schoolId = user.schoolId ?? String(fd.get("sekolah") ?? "");
  if (!z.uuid().safeParse(schoolId).success) return { error: "Pilih sekolah." };
  const nameText = String(fd.get("nama") ?? "").trim();
  const gradeText = String(fd.get("tingkat") ?? "").trim();
  if (!nameText) return { error: "Isi nama kelas." };
  const fromName = parseClass(nameText);
  const gradeField = gradeText ? parseGrade(gradeText) : null;
  if (fromName && gradeField != null && fromName.grade !== gradeField) {
    return { error: `Nama kelas tertulis tingkat ${fromName.grade}, tetapi tingkat yang dipilih ${gradeField}.` };
  }
  const parsed = fromName ?? (gradeField != null ? { name: classNameFor(gradeField, nameText), grade: gradeField } : null);
  if (!parsed) return { error: "Pilih tingkat kelas, atau tulis nama kelas diawali tingkat (mis. 6A atau 9 Ibnu Majid)." };
  return run(() =>
    queryAsUser(async (tx) => {
      const [year] = await tx.select({ id: academicYears.id, label: academicYears.label }).from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
      if (!year) throw new Problem("Belum ada tahun ajaran aktif.");
      await tx.insert(classes).values({ schoolId, academicYearId: year.id, name: parsed.name, grade: parsed.grade });
      return `Kelas ${parsed.name} ditambahkan untuk TA ${year.label}.`;
    }),
  );
}

export async function addAcademicYear(_prev: MasterState, fd: FormData): Promise<MasterState> {
  await requireUser(["super_admin"]);
  const label = String(fd.get("label") ?? "").trim();
  let range: { start: string; end: string };
  try {
    range = academicYearRange(label);
  } catch {
    return { error: "Tulis tahun ajaran seperti 2027/2028." };
  }
  return run(() =>
    queryAsUser(async (tx) => {
      await tx.insert(academicYears).values({ label, startDate: range.start, endDate: range.end, isActive: false });
      return `TA ${label} ditambahkan. Aktifkan bila tahun ajaran sudah dimulai.`;
    }),
  );
}

export async function setActiveYear(_prev: MasterState, fd: FormData): Promise<MasterState> {
  await requireUser(["super_admin"]);
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Data tidak valid." };
  return run(() =>
    queryAsUser(async (tx) => {
      // Only one active year (partial unique index): switch off first.
      await tx.update(academicYears).set({ isActive: false }).where(eq(academicYears.isActive, true));
      const [y] = await tx.update(academicYears).set({ isActive: true }).where(eq(academicYears.id, id.data)).returning({ label: academicYears.label });
      if (!y) throw new Problem("Tahun ajaran tidak ditemukan.");
      return `TA ${y.label} sekarang aktif. Kelas dan penempatan siswa untuk tahun ini dibuat lewat Impor Data Siswa.`;
    }),
  );
}

// ---------------------------------------------------------------------------
// Competencies (Super Admin)
// ---------------------------------------------------------------------------

const compSchema = z.object({ id: z.uuid(), nama: z.string().trim().min(3, "Nama kompetensi minimal 3 karakter.").max(300) });

export async function renameCompetency(_prev: MasterState, fd: FormData): Promise<MasterState> {
  await requireUser(["super_admin"]);
  const p = compSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Isian tidak valid." };
  return run(() =>
    queryAsUser(async (tx) => {
      const r = await tx.update(competencies).set({ name: p.data.nama }).where(eq(competencies.id, p.data.id)).returning({ id: competencies.id });
      if (!r.length) throw new Problem("Kompetensi tidak ditemukan.");
      return "Nama kompetensi diperbarui.";
    }),
  );
}

export async function addSubCompetency(_prev: MasterState, fd: FormData): Promise<MasterState> {
  await requireUser(["super_admin"]);
  const parent = z.uuid().safeParse(fd.get("parentId"));
  const name = z.string().trim().min(3).max(300).safeParse(fd.get("nama"));
  if (!parent.success || !name.success) return { error: "Isi nama sub-kompetensi (minimal 3 karakter)." };
  return run(() =>
    queryAsUser(async (tx) => {
      const [el] = await tx.select().from(competencies).where(eq(competencies.id, parent.data)).limit(1);
      if (!el) throw new Problem("Elemen tidak ditemukan.");
      const siblings = await tx.select({ code: competencies.code, sortOrder: competencies.sortOrder }).from(competencies).where(eq(competencies.parentId, el.id)).orderBy(desc(competencies.sortOrder));
      // Next free code "<ELEMENT>-NN".
      const used = new Set(siblings.map((s) => s.code));
      let n = siblings.length + 1;
      while (used.has(`${el.code}-${String(n).padStart(2, "0")}`)) n++;
      await tx.insert(competencies).values({
        subjectId: el.subjectId,
        parentId: el.id,
        code: `${el.code}-${String(n).padStart(2, "0")}`,
        name: name.data,
        depth: el.depth + 1,
        sortOrder: (siblings[0]?.sortOrder ?? 0) + 1,
      });
      return "Sub-kompetensi ditambahkan.";
    }),
  );
}

