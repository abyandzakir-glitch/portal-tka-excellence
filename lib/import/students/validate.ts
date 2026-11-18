/**
 * Student master import (Fase 5, DECISIONS.md): adds or updates students by
 * NIS within a school and records their class for the active academic year.
 * Students missing from the file are NOT deactivated (separate action).
 */
import type { FieldSet } from "../mapping";
import { normalizeText, rankBySimilarity } from "../text";
import { type Issue, type RowInput, statusOf, type ValidationResult, type ValidatedRow } from "../types";
import { cellToString, parseIdentifier } from "../values";

export const STUDENT_IMPORT_FIELDS: FieldSet = {
  fields: [
    { key: "nis", label: "NIS", required: true, synonyms: ["nis", "no induk", "nomor induk", "no induk siswa", "nomor induk siswa", "nipd"] },
    { key: "nisn", label: "NISN", synonyms: ["nisn", "nomor induk siswa nasional"] },
    { key: "name", label: "Nama Lengkap", required: true, synonyms: ["nama", "nama lengkap", "nama siswa", "nama peserta didik", "peserta didik"] },
    { key: "gender", label: "L/P", synonyms: ["l p", "jk", "jenis kelamin", "gender", "kelamin", "sex"] },
    { key: "class", label: "Kelas", hint: "mis. 6A atau 9 Ibnu Majid; kelas yang belum ada akan dibuat", synonyms: ["kelas", "rombel", "rombongan belajar", "class", "nama rombel", "nama kelas"] },
    { key: "grade", label: "Tingkat", hint: "Angka tingkat kelas (mis. 9); perlu bila nama kelas tanpa angka, mis. Ibnu Majid", synonyms: ["tingkat", "tingkat kelas", "grade", "jenjang kelas"] },
    { key: "school", label: "Sekolah", hint: "Kode sekolah, untuk file berisi beberapa sekolah", synonyms: ["sekolah", "kode sekolah", "unit", "school"] },
  ],
};

export interface ExistingStudent {
  id: string;
  schoolId: string;
  nis: string;
  nisn: string | null;
  fullName: string;
  gender: "L" | "P" | null;
  isActive: boolean;
  className: string | null;
}

export interface StudentImportContext {
  schools: readonly { id: string; code: string; name: string }[];
  batchSchoolId: string | null;
  /** All students of the schools in scope (any status). */
  existing: readonly ExistingStudent[];
  /** NISN -> owner, across all schools the user can see (uniqueness check). */
  nisnOwners: ReadonlyMap<string, { schoolId: string; nis: string }>;
  /** Classes of the active academic year in the schools in scope. */
  existingClasses: readonly ExistingClass[];
}

export interface ExistingClass {
  schoolId: string;
  name: string;
  grade: number;
}

export interface StudentRow {
  schoolId: string;
  nis: string;
  nisn: string | null;
  fullName: string;
  gender: "L" | "P" | null;
  className: string | null;
  grade: number | null;
  /** Set when the student exists already (update). */
  existingId: string | null;
  changes: string[];
}

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
const ROMAN_RE = "XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I";
const SEP = String.raw`[\s\-./:]`;

/** Removes "Kelas", surrounding quotes/brackets and extra spaces. */
function cleanClassText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^kelas\b\.?\s*/i, "")
    .replace(/^["'([]+|["')\]]+$/g, "")
    .trim();
}

/** "IBNU MAJID" / "ibnu majid" -> "Ibnu Majid"; mixed case is kept as written. */
function tidyRombel(text: string): string {
  const t = text.replace(/^["'([]+|["')\]]+$/g, "").replace(/\s+/g, " ").trim();
  if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t;
  return t.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());
}

/** Canonical class name: short suffixes stick to the grade ("6A"), names get a space ("9 Ibnu Majid"). */
export function classNameFor(grade: number, rombel: string): string {
  const r = cleanClassText(rombel);
  if (!r) return String(grade);
  if (/^[A-Za-z0-9]{1,2}$/.test(r)) return `${grade}${r.toUpperCase()}`;
  return `${grade} ${tidyRombel(r)}`;
}

/**
 * Class text that starts with the grade (arabic or roman numerals):
 * "6A" -> 6A, "VI-B" -> 6B, "Kelas 9 C" -> 9C, "9 Ibnu Majid" / "IX - IBNU MAJID" -> "9 Ibnu Majid".
 * Returns null when no grade can be read (e.g. "Ibnu Majid").
 */
export function parseClass(value: string): { name: string; grade: number } | null {
  const t = cleanClassText(value);
  const m =
    new RegExp(`^(\\d{1,2})${SEP}*(.*)$`).exec(t) ??
    new RegExp(`^(${ROMAN_RE})(?:${SEP}+(.*)|([A-Za-z0-9]{1,2}))?$`, "i").exec(t);
  if (!m) return null;
  const grade = /^\d+$/.test(m[1]!) ? Number(m[1]) : ROMAN[m[1]!.toLowerCase()]!;
  if (!grade || grade < 1 || grade > 12) return null;
  return { name: classNameFor(grade, m[2] ?? m[3] ?? ""), grade };
}

/** Reads a grade cell: "9", "IX", "Kelas 9". */
export function parseGrade(value: string): number | null {
  const t = cleanClassText(value);
  const n = /^\d{1,2}$/.test(t) ? Number(t) : ROMAN[t.toLowerCase()];
  return n && n >= 1 && n <= 12 ? n : null;
}

const stripGrade = (name: string) => name.replace(new RegExp(`^(\\d{1,2})(?:${SEP}+|(?=[A-Za-z]))`), "");

export type ClassResolution =
  | { ok: true; name: string; grade: number; isNew: boolean }
  | { ok: false; message: string };

/**
 * Resolves a class cell against the classes of the active year, in order:
 * exact existing name -> name with grade read from the text -> grade column ->
 * an existing class with the same rombel name ("Ibnu Majid" -> "9 Ibnu Majid")
 * when it is unambiguous.
 */
export function resolveClass(text: string, gradeText: string, schoolId: string, existing: readonly ExistingClass[]): ClassResolution {
  const inSchool = existing.filter((c) => c.schoolId === schoolId);
  const find = (name: string) => inSchool.find((c) => classKey(schoolId, c.name) === classKey(schoolId, name));
  const hit = (c: ExistingClass): ClassResolution => ({ ok: true, name: c.name, grade: c.grade, isNew: false });

  const exact = find(cleanClassText(text));
  if (exact) return hit(exact);

  const gradeCol = gradeText.trim() ? parseGrade(gradeText) : null;
  if (gradeText.trim() && gradeCol == null) return { ok: false, message: `Tingkat "${gradeText}" tidak dikenali. Isi angka 1–12, mis. 9.` };

  const parsed = parseClass(text);
  if (parsed) {
    if (gradeCol != null && gradeCol !== parsed.grade) {
      return { ok: false, message: `Kelas "${text}" tertulis tingkat ${parsed.grade}, tetapi kolom Tingkat berisi ${gradeCol}.` };
    }
    const known = find(parsed.name);
    return known ? hit(known) : { ok: true, ...parsed, isNew: true };
  }

  if (gradeCol != null) {
    const name = classNameFor(gradeCol, cleanClassText(text));
    const known = find(name);
    return known ? hit(known) : { ok: true, name, grade: gradeCol, isNew: true };
  }

  const rombel = normalizeText(cleanClassText(text)).replace(/ /g, "");
  const same = inSchool.filter((c) => normalizeText(stripGrade(c.name)).replace(/ /g, "") === rombel);
  if (same.length === 1) return hit(same[0]!);
  if (same.length > 1) {
    return { ok: false, message: `Ada beberapa kelas bernama "${text}" (${same.map((c) => c.name).join(", ")}). Tulis lengkap dengan tingkatnya, mis. ${same[0]!.name}.` };
  }
  return {
    ok: false,
    message: `Tingkat kelas "${text}" tidak diketahui. Tulis dengan angka tingkat (mis. "9 ${tidyRombel(cleanClassText(text))}"), tambahkan kolom Tingkat, atau buat kelasnya dulu di Master Data → Kelas.`,
  };
}

export function parseGender(value: string): "L" | "P" | null | undefined {
  if (!value.trim()) return null;
  const k = normalizeText(value);
  if (["l", "lk", "laki laki", "laki", "pria", "male", "m"].includes(k)) return "L";
  if (["p", "pr", "perempuan", "wanita", "female", "f", "w"].includes(k)) return "P";
  return undefined; // not understood
}

export const classKey = (schoolId: string, name: string) => `${schoolId}|${normalizeText(name).replace(/ /g, "")}`;

export function validateStudents(rows: readonly RowInput[], ctx: StudentImportContext): ValidationResult<StudentRow> {
  const out: ValidatedRow<StudentRow>[] = [];
  const fileIssues: Issue[] = [];
  const seenNis = new Map<string, number>();
  const seenNisn = new Map<string, number>();
  const byKey = new Map(ctx.existing.map((s) => [`${s.schoolId}|${s.nis.toUpperCase()}`, s]));
  const newClasses = new Map<string, ExistingClass>();

  for (const { rowNumber, values } of rows) {
    const issues: Issue[] = [];
    const nis = parseIdentifier(values.nis);
    const name = cellToString(values.name).replace(/\s+/g, " ");
    if (!nis && !name) {
      out.push({ rowNumber, status: "skipped", data: null, issues: [] });
      continue;
    }

    let schoolId = ctx.batchSchoolId;
    const schoolText = cellToString(values.school);
    if (schoolText) {
      const key = normalizeText(schoolText).replace(/ /g, "");
      const s = ctx.schools.find((x) => x.code.toLowerCase() === key) ?? rankBySimilarity(schoolText, ctx.schools, (x) => x.name, 0.85)[0]?.item;
      if (!s) issues.push({ level: "error", field: "school", message: `Sekolah "${schoolText}" tidak dikenali. Gunakan kode sekolah, mis. SDTJBDG.` });
      else if (ctx.batchSchoolId && s.id !== ctx.batchSchoolId) issues.push({ level: "error", field: "school", message: `Baris ini milik ${s.code}, bukan sekolah yang dipilih saat unggah.` });
      else schoolId = s.id;
    } else if (!schoolId) {
      issues.push({ level: "error", field: "school", message: "Kolom Sekolah kosong. Isi kode sekolah, atau pilih sekolah saat mengunggah." });
    }

    if (!nis) issues.push({ level: "error", field: "nis", message: "NIS kosong." });
    if (!name) issues.push({ level: "error", field: "name", message: "Nama siswa kosong." });

    const nisn = parseIdentifier(values.nisn);
    if (nisn && !/^\d{10}$/.test(nisn)) issues.push({ level: "warning", field: "nisn", message: `NISN "${nisn}" biasanya 10 digit. Periksa kembali.` });

    let gender: "L" | "P" | null = null;
    const g = parseGender(cellToString(values.gender));
    if (g === undefined) issues.push({ level: "warning", field: "gender", message: `Jenis kelamin "${cellToString(values.gender)}" tidak dikenali (pakai L/P); dikosongkan.` });
    else gender = g;

    let className: string | null = null;
    let grade: number | null = null;
    const classText = cellToString(values.class);
    if (classText && schoolId) {
      const c = resolveClass(classText, cellToString(values.grade), schoolId, [...ctx.existingClasses, ...newClasses.values()]);
      if (!c.ok) issues.push({ level: "error", field: "class", message: c.message });
      else {
        className = c.name;
        grade = c.grade;
        if (c.isNew) {
          newClasses.set(classKey(schoolId, c.name), { schoolId, name: c.name, grade: c.grade });
          issues.push({ level: "warning", field: "class", message: `Kelas ${c.name} (tingkat ${c.grade}) belum ada di tahun ajaran aktif dan akan dibuat.` });
        }
      }
    }

    let existing: ExistingStudent | undefined;
    const changes: string[] = [];
    if (schoolId && nis) {
      const key = `${schoolId}|${nis}`;
      const prev = seenNis.get(key);
      if (prev != null) issues.push({ level: "error", field: "nis", message: `NIS ${nis} sudah muncul di baris ${prev}.` });
      else seenNis.set(key, rowNumber);
      existing = byKey.get(key);
      if (nisn) {
        const owner = ctx.nisnOwners.get(nisn);
        if (owner && !(owner.schoolId === schoolId && owner.nis.toUpperCase() === nis)) {
          issues.push({ level: "error", field: "nisn", message: `NISN ${nisn} sudah dipakai siswa lain (NIS ${owner.nis}).` });
        }
        const prevN = seenNisn.get(nisn);
        if (prevN != null) issues.push({ level: "error", field: "nisn", message: `NISN ${nisn} sudah muncul di baris ${prevN}.` });
        else seenNisn.set(nisn, rowNumber);
      }
      if (existing) {
        if (name && existing.fullName !== name) {
          changes.push(`nama: ${existing.fullName} → ${name}`);
          if (rankBySimilarity(name, [existing], (s) => s.fullName)[0]!.score < 0.5) {
            issues.push({ level: "warning", field: "name", message: `Nama sangat berbeda dari data tersimpan ("${existing.fullName}"). Pastikan NIS-nya benar.` });
          }
        }
        if (nisn && nisn !== existing.nisn) changes.push(`NISN: ${existing.nisn ?? "–"} → ${nisn}`);
        if (gender && gender !== existing.gender) changes.push(`L/P: ${existing.gender ?? "–"} → ${gender}`);
        if (className && className !== existing.className) changes.push(`kelas: ${existing.className ?? "–"} → ${className}`);
        if (!existing.isActive) changes.push("diaktifkan kembali");
      }
    }

    const status = statusOf(issues);
    if (status !== "error" && existing && changes.length === 0) {
      out.push({ rowNumber, status: "skipped", data: null, issues: [{ level: "warning", message: "Sudah sesuai data tersimpan; tidak ada perubahan." }] });
      continue;
    }
    out.push({
      rowNumber,
      status,
      issues,
      data:
        status === "error" || !schoolId || !nis || !name
          ? null
          : { schoolId, nis, nisn: nisn ?? existing?.nisn ?? null, fullName: name, gender: gender ?? existing?.gender ?? null, className, grade, existingId: existing?.id ?? null, changes },
    });
  }

  const added = out.filter((r) => r.data && !r.data.existingId).length;
  const updated = out.filter((r) => r.data?.existingId).length;
  if (!out.some((r) => r.status !== "skipped")) {
    fileIssues.push(out.length ? { level: "warning", message: "Semua siswa di file sudah sesuai data tersimpan. Tidak ada perubahan." } : { level: "error", message: "Tidak ada baris siswa yang bisa dibaca." });
  } else {
    fileIssues.push({ level: "warning", message: `${added} siswa baru akan ditambahkan dan ${updated} siswa diperbarui. Siswa yang tidak ada di file tidak diubah.` });
  }
  return { rows: out, fileIssues };
}
