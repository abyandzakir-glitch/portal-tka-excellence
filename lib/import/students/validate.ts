/**
 * Student master import (Fase 5, DECISIONS.md): adds or updates students by
 * NIS within a school and records their class for the active academic year.
 * Students missing from the file are NOT deactivated (separate action).
 */
import type { FieldSet } from "../mapping";
import { normalizeText, rankBySimilarity } from "../text";
import { type Issue, type RowInput, statusOf, type ValidationResult, type ValidatedRow } from "../types";
import { cellToString, isBlank, parseIdentifier } from "../values";

export const STUDENT_IMPORT_FIELDS: FieldSet = {
  fields: [
    { key: "nis", label: "NIS", required: true, synonyms: ["nis", "no induk", "nomor induk", "no induk siswa", "nomor induk siswa", "nipd"] },
    { key: "nisn", label: "NISN", synonyms: ["nisn", "nomor induk siswa nasional"] },
    { key: "name", label: "Nama Lengkap", required: true, synonyms: ["nama", "nama lengkap", "nama siswa", "nama peserta didik", "peserta didik"] },
    { key: "gender", label: "L/P", synonyms: ["l p", "jk", "jenis kelamin", "gender", "kelamin", "sex"] },
    { key: "class", label: "Kelas", hint: "mis. 6A; kelas yang belum ada akan dibuat", synonyms: ["kelas", "rombel", "rombongan belajar", "class", "nama rombel"] },
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
  /** `${schoolId}|${normalised class name}` of classes existing in the active year. */
  existingClasses: ReadonlySet<string>;
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

/** "6A" -> {name "6A", grade 6}; "VI-B" -> {name "6B", grade 6}; "Kelas 9 C" -> {name "9C", grade 9}. */
export function parseClass(value: string): { name: string; grade: number } | null {
  const cleaned = normalizeText(value).replace(/^kelas /, "");
  const m = /^(\d{1,2}|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\s*([a-z0-9]{0,6})$/.exec(cleaned.replace(/ /g, " ").trim()) ?? /^(\d{1,2}|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\s+(.+)$/.exec(cleaned);
  if (!m) return null;
  const grade = /^\d+$/.test(m[1]!) ? Number(m[1]) : ROMAN[m[1]!]!;
  if (!grade || grade < 1 || grade > 12) return null;
  const suffix = (m[2] ?? "").replace(/ /g, "").toUpperCase();
  return { name: `${grade}${suffix}`, grade };
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
  const newClasses = new Set<string>();

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
    if (classText) {
      const c = parseClass(classText);
      if (!c) issues.push({ level: "error", field: "class", message: `Kelas "${classText}" harus diawali tingkat, mis. 6A atau VI-B.` });
      else {
        className = c.name;
        grade = c.grade;
        if (schoolId && !ctx.existingClasses.has(classKey(schoolId, c.name)) && !newClasses.has(classKey(schoolId, c.name))) {
          newClasses.add(classKey(schoolId, c.name));
          issues.push({ level: "warning", field: "class", message: `Kelas ${c.name} belum ada di tahun ajaran aktif dan akan dibuat.` });
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
