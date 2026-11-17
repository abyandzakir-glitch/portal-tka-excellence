/**
 * Try-out results import (CLAUDE.md §7.1, §9.2 no. 2).
 *
 * Two levels of detail:
 *   1. Per item (preferred): a student × item matrix holding answer letters
 *      (compared against the blueprint key) or already-scored 1/0 values.
 *   2. Total score only (fallback): stored with has_item_detail = false.
 *
 * Approved rules (DECISIONS.md, Fase 2): all answers blank -> absent; a blank
 * answer on some items -> "unanswered" (counts as wrong).
 */
import { computeRawScore } from "@/lib/metrics/tryout-score";
import { describeSuggestions, type Roster } from "../lookup";
import type { ColumnMapping, FieldSet } from "../mapping";
import type { Cell } from "../sheet";
import { normalizeText } from "../text";
import { type Issue, type RowInput, statusOf, type ValidationResult, type ValidatedRow } from "../types";
import { cellToString, detectAnswerMode, isBlank, parseAnswer, parseIdentifier, parseNumber } from "../values";
import { formatList } from "./blueprint";

export const ITEM_PREFIX = "item:";
const ITEM_HEADER = /^(?:no|nomor|nmr|soal|butir|item|q|s|b)?\.?\s*[-.#:]?\s*(\d{1,3})\.?$/i;

export function itemKey(n: number) {
  return `${ITEM_PREFIX}${n}`;
}
export function itemNumberOf(key: string): number | null {
  return key.startsWith(ITEM_PREFIX) ? Number(key.slice(ITEM_PREFIX.length)) : null;
}

export const STUDENT_FIELDS = [
  { key: "nis", label: "NIS", synonyms: ["nis", "no induk", "nomor induk", "no induk siswa", "nomor induk siswa", "nipd", "id siswa"] },
  { key: "nisn", label: "NISN", synonyms: ["nisn", "nomor induk siswa nasional", "no induk nasional"] },
  {
    key: "name",
    label: "Nama Siswa",
    synonyms: ["nama", "nama siswa", "nama lengkap", "nama peserta", "nama peserta didik", "peserta", "siswa", "nama murid", "student name"],
  },
  { key: "class", label: "Kelas", hint: "Hanya untuk dibaca; kelas diambil dari master siswa", synonyms: ["kelas", "rombel", "nama kelas", "class", "rombongan belajar"] },
] as const;

export const RESULTS_FIELDS: FieldSet = {
  fields: [
    ...STUDENT_FIELDS,
    {
      key: "total_score",
      label: "Nilai Total",
      hint: "Dipakai bila tidak ada jawaban per soal",
      synonyms: ["nilai", "nilai total", "nilai akhir", "skor", "skor total", "total nilai", "nilai to", "score", "jumlah nilai", "nilai murni"],
    },
    {
      key: "scaled_score",
      label: "Nilai Skala (penyelenggara)",
      synonyms: ["nilai skala", "skor skala", "nilai standar", "skor standar", "scaled score", "nilai terstandar"],
    },
    { key: "attendance", label: "Kehadiran", synonyms: ["kehadiran", "hadir", "keterangan", "ket", "status", "absensi", "presensi"] },
  ],
  dynamic: (header) => {
    const m = ITEM_HEADER.exec(header.trim());
    if (!m) return null;
    const n = Number(m[1]);
    return n >= 1 && n <= 200 ? itemKey(n) : null;
  },
  dynamicLabel: (key) => {
    const n = itemNumberOf(key);
    return n == null ? key : `Soal no. ${n}`;
  },
};

export interface ResultsItem {
  id: string;
  number: number;
  answerKey: string | null;
  isVoided: boolean;
}

export interface ResultsContext {
  /** Blueprint items of the try-out; empty when the TO has no blueprint yet. */
  items: readonly ResultsItem[];
  roster: Roster;
}

export interface ResultResponse {
  itemId: string;
  answer: string | null;
  isCorrect: boolean | null;
}

export interface ResultRow {
  studentId: string;
  studentName: string;
  nis: string;
  status: "present" | "absent";
  rawScore: number | null;
  scaledScore: number | null;
  hasItemDetail: boolean;
  responses: ResultResponse[];
}

const ABSENT = new Set(["absen", "tidak hadir", "th", "a", "alpa", "alpha", "sakit", "izin", "ijin", "i", "tidak ikut", "tidak mengikuti", "x"]);
const PRESENT = new Set(["hadir", "h", "ikut", "ya", "v", "present"]);
const FOOTER = /^(jumlah|total|rata rata|rata2|rerata|nilai rata rata|mengetahui|kepala sekolah|wali kelas|keterangan|catatan)\b/;

/** Is this row a summary/footer line rather than a student? */
export function isFooterRow(values: Record<string, Cell>): boolean {
  if (!isBlank(values.nis) || !isBlank(values.nisn)) return false;
  return FOOTER.test(normalizeText(values.name));
}

export function validateResults(
  rows: readonly RowInput[],
  columns: ColumnMapping,
  ctx: ResultsContext,
): ValidationResult<ResultRow> & { mode: "items" | "total"; answerMode: "letter" | "binary" | null } {
  const fileIssues: Issue[] = [];
  const mapped = new Set(columns.filter((c): c is string => Boolean(c)));
  const fileItemNumbers = [...mapped].map(itemNumberOf).filter((n): n is number => n != null);
  const byNumber = new Map(ctx.items.map((it) => [it.number, it]));

  if (!mapped.has("nis") && !mapped.has("nisn") && !mapped.has("name")) {
    fileIssues.push({ level: "error", message: "Kolom NIS, NISN, atau Nama Siswa tidak ditemukan. Atur pemetaan kolom terlebih dahulu." });
  }

  let mode: "items" | "total" = fileItemNumbers.length ? "items" : "total";
  if (mode === "items" && ctx.items.length === 0) {
    if (mapped.has("total_score")) {
      mode = "total";
      fileIssues.push({
        level: "warning",
        message: "TO ini belum punya kisi-kisi, jadi jawaban per soal diabaikan dan hanya nilai total yang disimpan.",
      });
    } else {
      fileIssues.push({
        level: "error",
        message: "TO ini belum punya kisi-kisi. Unggah kisi-kisi TO terlebih dahulu, atau sertakan kolom Nilai Total.",
      });
    }
  }
  if (mode === "total" && !mapped.has("total_score") && ctx.items.length > 0) {
    fileIssues.push({
      level: "error",
      message: "Tidak ada kolom jawaban per soal (1, 2, 3, …) maupun kolom Nilai Total. Periksa pemetaan kolom.",
    });
  }

  let answerMode: "letter" | "binary" | null = null;
  const usedItems: ResultsItem[] = [];
  if (mode === "items") {
    const unknown = fileItemNumbers.filter((n) => !byNumber.has(n));
    if (unknown.length) {
      fileIssues.push({ level: "warning", message: `Kolom soal no. ${formatList(unknown)} tidak ada di kisi-kisi TO ini dan diabaikan.` });
    }
    const missing = ctx.items.filter((it) => !fileItemNumbers.includes(it.number)).map((it) => it.number);
    if (missing.length) {
      fileIssues.push({
        level: "warning",
        message: `Soal no. ${formatList(missing)} tidak ada di file; dianggap tidak dijawab oleh semua siswa.`,
      });
    }
    usedItems.push(...ctx.items);
    const allCells = rows.flatMap((r) => fileItemNumbers.map((n) => r.values[itemKey(n)] ?? null));
    answerMode = detectAnswerMode(allCells);
    if (answerMode === "letter") {
      const noKey = ctx.items.filter((it) => !it.answerKey && fileItemNumbers.includes(it.number) && !it.isVoided).map((it) => it.number);
      if (noKey.length) {
        fileIssues.push({
          level: "error",
          message: `File berisi pilihan jawaban (A/B/C/D), tetapi kunci jawaban soal no. ${formatList(noKey)} belum diisi di kisi-kisi. Lengkapi kisi-kisi atau unggah dalam format 1/0.`,
        });
      }
    }
  }

  const out: ValidatedRow<ResultRow>[] = [];
  const seenStudent = new Map<string, number>();

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
    if (match.status === "not_found") {
      issues.push({ level: "error", field: nis ? "nis" : "name", message: match.message + describeSuggestions(match.suggestions) });
      out.push({ rowNumber, status: "error", data: null, issues });
      continue;
    }
    if (match.warning) issues.push({ level: "warning", field: "name", message: match.warning });
    const student = match.student;
    const prev = seenStudent.get(student.id);
    if (prev != null) {
      issues.push({ level: "error", field: "nis", message: `${student.fullName} sudah muncul di baris ${prev}. Hapus salah satunya.` });
      out.push({ rowNumber, status: "error", data: null, issues });
      continue;
    }
    seenStudent.set(student.id, rowNumber);

    const attendanceText = normalizeText(values.attendance);
    let markedAbsent = false;
    if (attendanceText) {
      if (ABSENT.has(attendanceText)) markedAbsent = true;
      else if (!PRESENT.has(attendanceText)) {
        issues.push({
          level: "warning",
          field: "attendance",
          message: `Isian kehadiran "${cellToString(values.attendance)}" tidak dikenali; kehadiran ditentukan dari jawaban.`,
        });
      }
    }

    let scaledScore: number | null = null;
    if (!isBlank(values.scaled_score)) {
      scaledScore = parseNumber(values.scaled_score);
      if (scaledScore == null || scaledScore < 0 || scaledScore > 1000) {
        issues.push({ level: "error", field: "scaled_score", message: `Nilai skala "${cellToString(values.scaled_score)}" bukan angka yang valid.` });
        scaledScore = null;
      }
    }

    const base = { studentId: student.id, studentName: student.fullName, nis: student.nis };

    if (mode === "items") {
      const responses: ResultResponse[] = [];
      let answered = 0;
      for (const it of usedItems) {
        const key = itemKey(it.number);
        const parsed = parseAnswer(values[key], answerMode ?? "binary");
        if (parsed.kind === "invalid") {
          issues.push({ level: "error", field: key, message: `Jawaban soal no. ${it.number} tidak dikenali: "${parsed.raw}". Gunakan A–E atau 1/0.` });
          responses.push({ itemId: it.id, answer: null, isCorrect: null });
        } else if (parsed.kind === "blank") {
          responses.push({ itemId: it.id, answer: null, isCorrect: null });
        } else if (parsed.kind === "letter") {
          answered++;
          responses.push({ itemId: it.id, answer: parsed.letter, isCorrect: it.answerKey ? parsed.letter === it.answerKey : null });
        } else {
          answered++;
          responses.push({ itemId: it.id, answer: parsed.correct ? "1" : "0", isCorrect: parsed.correct });
        }
      }

      if (answered === 0) {
        if (!markedAbsent) issues.push({ level: "warning", message: "Semua jawaban kosong; siswa dicatat absen." });
        const status = statusOf(issues);
        out.push({
          rowNumber,
          status,
          issues,
          data: status === "error" ? null : { ...base, status: "absent", rawScore: null, scaledScore, hasItemDetail: false, responses: [] },
        });
        continue;
      }
      if (markedAbsent) {
        issues.push({ level: "warning", field: "attendance", message: "Ditandai tidak hadir, tetapi ada jawaban; siswa dicatat hadir." });
      }

      const rawScore = computeRawScore(usedItems.map((it, i) => ({ isVoided: it.isVoided, isCorrect: responses[i]!.isCorrect })));
      const fileTotal = parseNumber(values.total_score);
      if (fileTotal != null && rawScore != null && Math.abs(fileTotal - rawScore) > 1) {
        issues.push({
          level: "warning",
          field: "total_score",
          message: `Nilai di file (${fileTotal}) berbeda dengan hasil hitung dari jawaban (${rawScore}). Sistem memakai hasil hitung.`,
        });
      }
      const status = statusOf(issues);
      out.push({
        rowNumber,
        status,
        issues,
        data: status === "error" ? null : { ...base, status: "present", rawScore, scaledScore, hasItemDetail: true, responses },
      });
      continue;
    }

    // Total score only (fallback).
    const totalCell = values.total_score;
    if (isBlank(totalCell)) {
      if (!markedAbsent) issues.push({ level: "warning", field: "total_score", message: "Nilai kosong; siswa dicatat absen." });
      const status = statusOf(issues);
      out.push({
        rowNumber,
        status,
        issues,
        data: status === "error" ? null : { ...base, status: "absent", rawScore: null, scaledScore, hasItemDetail: false, responses: [] },
      });
      continue;
    }
    const total = parseNumber(totalCell);
    if (total == null || total < 0 || total > 100) {
      issues.push({ level: "error", field: "total_score", message: `Nilai "${cellToString(totalCell)}" harus berupa angka 0–100.` });
    }
    const status = statusOf(issues);
    out.push({
      rowNumber,
      status,
      issues,
      data:
        status === "error" || total == null
          ? null
          : { ...base, status: "present", rawScore: Math.round(total * 100) / 100, scaledScore, hasItemDetail: false, responses: [] },
    });
  }

  if (!out.some((r) => r.status !== "skipped")) {
    fileIssues.push({ level: "error", message: "Tidak ada baris siswa yang bisa dibaca di file ini." });
  }
  if (mode === "total" && !fileIssues.some((i) => i.level === "error")) {
    fileIssues.push({
      level: "warning",
      message: "File hanya berisi nilai total: nilai masuk ke tren, tetapi tidak dihitung untuk analisis kompetensi.",
    });
  }
  return { rows: out, fileIssues, mode, answerMode };
}
