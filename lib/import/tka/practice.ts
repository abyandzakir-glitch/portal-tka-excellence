/**
 * Weekly practice log import (CLAUDE.md §7.1, §9.2 no. 3): per student, per
 * week, per subject (and optionally per sub-competency): attempted / correct.
 * Logs without a sub-competency count for volume & accuracy only (DECISIONS.md).
 */
import { describeSuggestions, matchCompetency, matchSubject, type CompetencyRef, type Roster, type SubjectRef } from "../lookup";
import type { ColumnMapping, FieldSet } from "../mapping";
import { type Issue, type RowInput, statusOf, type ValidationResult, type ValidatedRow } from "../types";
import { cellToString, isBlank, parseIdentifier, parseInteger, parseWeekStart } from "../values";
import { isFooterRow, STUDENT_FIELDS } from "./results";

export const PRACTICE_FIELDS: FieldSet = {
  fields: [
    ...STUDENT_FIELDS,
    {
      key: "week",
      label: "Pekan",
      hint: "Tanggal mana pun di pekan itu, mis. 10/11/2026",
      synonyms: ["pekan", "minggu", "minggu ke", "pekan ke", "tanggal", "tgl", "tanggal latihan", "periode", "week", "awal pekan", "tanggal mulai"],
    },
    { key: "subject", label: "Mapel", required: true, synonyms: ["mapel", "mata pelajaran", "pelajaran", "subject", "bidang studi"] },
    {
      key: "competency",
      label: "Sub-kompetensi (opsional)",
      synonyms: ["sub kompetensi", "subkompetensi", "kompetensi", "sub elemen", "submateri", "sub materi", "materi", "topik", "kode kompetensi"],
    },
    {
      key: "attempted",
      label: "Jumlah Dikerjakan",
      required: true,
      synonyms: [
        "jumlah dikerjakan", "dikerjakan", "soal dikerjakan", "jumlah soal", "jml soal", "jumlah soal dikerjakan", "total soal",
        "banyak soal", "attempted", "jml dikerjakan",
      ],
    },
    {
      key: "correct",
      label: "Jumlah Benar",
      synonyms: ["jumlah benar", "benar", "jml benar", "soal benar", "jawaban benar", "correct", "total benar", "banyak benar"],
    },
    { key: "wrong", label: "Jumlah Salah", hint: "Dipakai bila kolom Benar tidak ada", synonyms: ["jumlah salah", "salah", "jml salah", "soal salah", "wrong"] },
  ],
};

export interface PracticeContext {
  roster: Roster;
  /** Subjects of the school's level. */
  subjects: readonly SubjectRef[];
  /** Sub-competencies per subject id. */
  competenciesBySubject: ReadonlyMap<string, readonly CompetencyRef[]>;
  /** Monday used when the file has no week column (chosen on the upload form). */
  defaultWeek: string | null;
  /** Today in Asia/Jakarta ("YYYY-MM-DD"), to reject weeks in the future. */
  today: string;
  /** Keys of logs already stored for this school, to warn about replacements. */
  existingKeys?: ReadonlySet<string>;
}

export interface PracticeRow {
  studentId: string;
  studentName: string;
  nis: string;
  weekStart: string;
  subjectId: string;
  competencyId: string | null;
  attempted: number;
  correct: number;
}

export function practiceKey(r: { studentId: string; weekStart: string; subjectId: string; competencyId: string | null }) {
  return `${r.studentId}|${r.weekStart}|${r.subjectId}|${r.competencyId ?? "-"}`;
}

export function validatePractice(rows: readonly RowInput[], columns: ColumnMapping, ctx: PracticeContext): ValidationResult<PracticeRow> {
  const fileIssues: Issue[] = [];
  const mapped = new Set(columns.filter((c): c is string => Boolean(c)));

  if (!mapped.has("nis") && !mapped.has("nisn") && !mapped.has("name")) {
    fileIssues.push({ level: "error", message: "Kolom NIS, NISN, atau Nama Siswa tidak ditemukan. Atur pemetaan kolom terlebih dahulu." });
  }
  if (!mapped.has("week") && !ctx.defaultWeek) {
    fileIssues.push({
      level: "error",
      message: "Kolom Pekan/Tanggal tidak ditemukan. Tambahkan kolom Pekan di file, atau pilih pekan saat mengunggah.",
    });
  }
  if (!mapped.has("subject")) fileIssues.push({ level: "error", message: "Kolom Mapel tidak ditemukan. Atur pemetaan kolom terlebih dahulu." });
  if (!mapped.has("attempted")) {
    fileIssues.push({ level: "error", message: "Kolom Jumlah Dikerjakan tidak ditemukan. Atur pemetaan kolom terlebih dahulu." });
  }
  if (!mapped.has("correct") && !mapped.has("wrong")) {
    fileIssues.push({ level: "error", message: "Kolom Jumlah Benar (atau Jumlah Salah) tidak ditemukan. Atur pemetaan kolom terlebih dahulu." });
  }

  const thisMonday = parseWeekStart(ctx.today)!;
  const out: ValidatedRow<PracticeRow>[] = [];
  const seen = new Map<string, number>();
  let replaced = 0;

  for (const { rowNumber, values } of rows) {
    const issues: Issue[] = [];
    const nis = parseIdentifier(values.nis);
    const nisn = parseIdentifier(values.nisn);
    const name = cellToString(values.name) || null;
    if ((!nis && !nisn && !name) || isFooterRow(values)) {
      out.push({ rowNumber, status: "skipped", data: null, issues: [] });
      continue;
    }

    const match = ctx.roster.match({ nis, nisn, name });
    let studentId: string | null = null;
    let studentName = name ?? "";
    let studentNis = nis ?? "";
    if (match.status === "not_found") {
      issues.push({ level: "error", field: nis ? "nis" : "name", message: match.message + describeSuggestions(match.suggestions) });
    } else {
      studentId = match.student.id;
      studentName = match.student.fullName;
      studentNis = match.student.nis;
      if (match.warning) issues.push({ level: "warning", field: "name", message: match.warning });
    }

    let weekStart: string | null = null;
    if (isBlank(values.week)) {
      weekStart = ctx.defaultWeek;
      if (!weekStart && mapped.has("week")) issues.push({ level: "error", field: "week", message: "Pekan kosong." });
    } else {
      weekStart = parseWeekStart(values.week);
      if (!weekStart) {
        issues.push({
          level: "error",
          field: "week",
          message: `Pekan "${cellToString(values.week)}" tidak dikenali. Tulis tanggal di pekan tersebut, mis. 10/11/2026.`,
        });
      }
    }
    if (weekStart && weekStart > thisMonday) {
      issues.push({ level: "error", field: "week", message: `Pekan yang dimulai ${weekStart} belum terjadi.` });
    }

    let subjectId: string | null = null;
    const subjectText = cellToString(values.subject);
    if (!subjectText) {
      issues.push({ level: "error", field: "subject", message: "Mapel kosong." });
    } else {
      const subject = matchSubject(subjectText, ctx.subjects);
      if (subject) subjectId = subject.id;
      else {
        issues.push({
          level: "error",
          field: "subject",
          message: `Mapel "${subjectText}" tidak dikenali. Pilihan: ${ctx.subjects.map((s) => s.name).join(", ")}.`,
        });
      }
    }

    let competencyId: string | null = null;
    const compText = cellToString(values.competency);
    if (compText && subjectId) {
      const m = matchCompetency(compText, ctx.competenciesBySubject.get(subjectId) ?? []);
      if (m.status === "matched") {
        competencyId = m.competency.id;
        if (m.warning) issues.push({ level: "warning", field: "competency", message: m.warning });
      } else {
        issues.push({
          level: "error",
          field: "competency",
          message: `${m.message} Kosongkan kolom ini bila latihannya campuran.`,
        });
      }
    }

    const attempted = parseInteger(values.attempted);
    if (attempted == null || attempted < 0) {
      issues.push({
        level: "error",
        field: "attempted",
        message: isBlank(values.attempted)
          ? "Jumlah dikerjakan kosong."
          : `Jumlah dikerjakan "${cellToString(values.attempted)}" harus berupa bilangan bulat 0 atau lebih.`,
      });
    }

    let correct: number | null = null;
    if (!isBlank(values.correct)) {
      correct = parseInteger(values.correct);
      if (correct == null || correct < 0) {
        issues.push({ level: "error", field: "correct", message: `Jumlah benar "${cellToString(values.correct)}" harus berupa bilangan bulat 0 atau lebih.` });
        correct = null;
      }
    } else if (!isBlank(values.wrong) && attempted != null) {
      const wrong = parseInteger(values.wrong);
      if (wrong == null || wrong < 0 || wrong > attempted) {
        issues.push({ level: "error", field: "wrong", message: `Jumlah salah "${cellToString(values.wrong)}" tidak valid.` });
      } else correct = attempted - wrong;
    } else {
      issues.push({ level: "error", field: "correct", message: "Jumlah benar kosong." });
    }
    if (attempted != null && correct != null && correct > attempted) {
      issues.push({ level: "error", field: "correct", message: `Jumlah benar (${correct}) lebih besar dari jumlah dikerjakan (${attempted}).` });
    }

    if (attempted === 0 && !issues.some((i) => i.level === "error")) {
      out.push({ rowNumber, status: "skipped", data: null, issues: [{ level: "warning", message: "Tidak ada soal yang dikerjakan; baris dilewati." }] });
      continue;
    }

    let status = statusOf(issues);
    let data: PracticeRow | null = null;
    if (status !== "error" && studentId && weekStart && subjectId && attempted != null && correct != null) {
      data = { studentId, studentName, nis: studentNis, weekStart, subjectId, competencyId, attempted, correct };
      const key = practiceKey(data);
      const prev = seen.get(key);
      if (prev != null) {
        issues.push({
          level: "error",
          message: `Data siswa, pekan, mapel, dan sub-kompetensi yang sama sudah ada di baris ${prev}. Gabungkan atau hapus salah satunya.`,
        });
        data = null;
      } else {
        seen.set(key, rowNumber);
        if (ctx.existingKeys?.has(key)) replaced++;
      }
      status = statusOf(issues);
    }
    out.push({ rowNumber, status, data: status === "error" ? null : data, issues });
  }

  if (!out.some((r) => r.status !== "skipped")) {
    fileIssues.push({ level: "error", message: "Tidak ada baris latihan yang bisa dibaca di file ini." });
  }
  if (replaced > 0) {
    fileIssues.push({
      level: "warning",
      message: `${replaced} baris akan menggantikan data latihan yang sudah tersimpan (siswa, pekan, dan mapel yang sama).`,
    });
  }
  return { rows: out, fileIssues };
}
