/**
 * Try-out blueprint (kisi-kisi) import: one row per item number, mapped to a
 * sub-competency of the try-out's subject (CLAUDE.md §7.1, §9.2 no. 1).
 */
import { matchCompetency, matchSubject, type CompetencyRef, type SubjectRef } from "../lookup";
import type { FieldSet } from "../mapping";
import { normalizeText, rankBySimilarity } from "../text";
import { type Issue, type RowInput, statusOf, type ValidationResult, type ValidatedRow } from "../types";
import { cellToString, isBlank, parseAnswerKey, parseInteger, parseYesNo } from "../values";

export const BLUEPRINT_FIELDS: FieldSet = {
  fields: [
    {
      key: "number",
      label: "Nomor Soal",
      required: true,
      synonyms: ["no", "no soal", "nomor", "nomor soal", "no butir", "nomor butir", "butir", "butir soal", "soal", "item", "no item"],
    },
    { key: "subject", label: "Mapel", synonyms: ["mapel", "mata pelajaran", "pelajaran", "subject", "bidang studi"] },
    { key: "element", label: "Elemen / Materi", synonyms: ["elemen", "materi", "materi pokok", "domain", "element", "lingkup materi"] },
    {
      key: "competency",
      label: "Sub-kompetensi",
      required: true,
      hint: "Nama atau kode sub-kompetensi, mis. MAT-SMP-ALJ-02",
      synonyms: [
        "sub kompetensi", "subkompetensi", "sub elemen", "subelemen", "sub materi", "submateri", "kompetensi",
        "kode kompetensi", "indikator", "indikator soal", "topik", "materi soal", "kompetensi yang diuji",
      ],
    },
    {
      key: "cognitive_level",
      label: "Level Kognitif",
      synonyms: ["level kognitif", "level", "lvl", "lv", "level soal", "level kognisi", "ranah kognitif", "kognitif", "dimensi", "dimensi kompetensi", "proses kognitif"],
    },
    {
      key: "difficulty",
      label: "Tingkat Kesulitan",
      synonyms: ["tingkat kesulitan", "kesulitan", "tingkat kesukaran", "taraf kesukaran", "kesukaran", "difficulty"],
    },
    {
      key: "answer_key",
      label: "Kunci Jawaban",
      synonyms: ["kunci", "kunci jawaban", "kunci jwb", "jawaban benar", "kunci soal", "key", "answer key"],
    },
    { key: "voided", label: "Dianulir", hint: "Isi \"Ya\" bila soal dibatalkan", synonyms: ["dianulir", "anulir", "batal", "dibatalkan", "gugur", "void"] },
  ],
};

export interface BlueprintContext {
  /** The try-out's subject. */
  subject: SubjectRef;
  /** All subjects of the same school level, to recognise a "Mapel" column. */
  subjects: readonly SubjectRef[];
  /** Sub-competencies (depth 2) of the subject. */
  competencies: readonly CompetencyRef[];
  /** Official cognitive levels / dimensions for this subject & level (may be empty). */
  cognitiveLevels: readonly string[];
}

export interface BlueprintItem {
  number: number;
  competencyId: string;
  competencyName: string;
  cognitiveLevel: string | null;
  difficulty: string | null;
  answerKey: string | null;
  isVoided: boolean;
}

const DIFFICULTY: Record<string, "mudah" | "sedang" | "sulit"> = {
  mudah: "mudah", easy: "mudah", rendah: "mudah", m: "mudah", lots: "mudah",
  sedang: "sedang", medium: "sedang", menengah: "sedang", s: "sedang", mots: "sedang",
  sulit: "sulit", sukar: "sulit", hard: "sulit", tinggi: "sulit", sk: "sulit", hots: "sulit",
};

/** "2", "L2", "Level 2", "aplikasi" -> "Level 2 — Aplikasi" (when the subject has official levels). */
export function normalizeCognitiveLevel(value: string, levels: readonly string[]): string | null {
  const key = normalizeText(value);
  if (!key) return null;
  const digit = /^(?:l|level|lvl|tingkat)?\s*([1-9])$/.exec(key)?.[1];
  if (digit) {
    const byNumber = levels.find((l) => new RegExp(`^level ${digit}\\b`).test(normalizeText(l)));
    if (byNumber) return byNumber;
  }
  const exact = levels.find((l) => normalizeText(l) === key);
  if (exact) return exact;
  // "Aplikasi" -> "Level 2 — Aplikasi"; "Penalaran" also matches an SD dimension name exactly above.
  const contains = levels.filter((l) => normalizeText(l).split(" ").join(" ").includes(key) && key.length >= 4);
  if (contains.length === 1) return contains[0]!;
  const best = rankBySimilarity(value, levels, (l) => l, 0.8)[0];
  return best?.item ?? null;
}

export function validateBlueprint(rows: readonly RowInput[], ctx: BlueprintContext): ValidationResult<BlueprintItem> {
  const fileIssues: Issue[] = [];
  const out: ValidatedRow<BlueprintItem>[] = [];
  const seen = new Map<number, number>(); // item number -> row number

  for (const { rowNumber, values } of rows) {
    const issues: Issue[] = [];
    const numberCell = values.number;
    const compCell = values.competency;

    // Unused template rows carry only a number (and subject): nothing to import.
    const contentless = [compCell, values.answer_key, values.cognitive_level, values.difficulty].every((c) => isBlank(c));
    if (contentless) {
      out.push({ rowNumber, status: "skipped", data: null, issues: [] });
      continue;
    }

    const number = parseInteger(numberCell);
    if (number == null || number < 1 || number > 200) {
      issues.push({
        level: "error",
        field: "number",
        message: isBlank(numberCell) ? "Nomor soal kosong." : `Nomor soal "${cellToString(numberCell)}" harus berupa angka 1–200.`,
      });
    } else if (seen.has(number)) {
      issues.push({ level: "error", field: "number", message: `Nomor soal ${number} sudah ada di baris ${seen.get(number)}.` });
    } else {
      seen.set(number, rowNumber);
    }

    if (!isBlank(values.subject)) {
      const subj = matchSubject(cellToString(values.subject), ctx.subjects);
      if (!subj || subj.id !== ctx.subject.id) {
        issues.push({
          level: "error",
          field: "subject",
          message: `Mapel "${cellToString(values.subject)}" tidak sama dengan mapel TO ini (${ctx.subject.name}).`,
        });
      }
    }

    let competency: BlueprintItem["competencyId"] | null = null;
    let competencyName = "";
    // Element + sub in separate columns: try "element - sub" first for disambiguation.
    const compText = cellToString(compCell);
    const elementText = cellToString(values.element);
    const match = compText
      ? (() => {
          const direct = matchCompetency(compText, ctx.competencies);
          if (direct.status === "matched" || !elementText) return direct;
          const combined = matchCompetency(`${elementText} - ${compText}`, ctx.competencies);
          return combined.status === "matched" ? combined : direct;
        })()
      : ({ status: "not_found", message: "Sub-kompetensi kosong." } as const);
    if (match.status === "matched") {
      competency = match.competency.id;
      competencyName = match.competency.name;
      if (match.warning) issues.push({ level: "warning", field: "competency", message: match.warning });
    } else {
      issues.push({ level: "error", field: "competency", message: match.message });
    }

    let cognitiveLevel: string | null = null;
    const cogText = cellToString(values.cognitive_level);
    if (cogText) {
      if (ctx.cognitiveLevels.length) {
        cognitiveLevel = normalizeCognitiveLevel(cogText, ctx.cognitiveLevels);
        if (!cognitiveLevel) {
          cognitiveLevel = cogText;
          issues.push({
            level: "warning",
            field: "cognitive_level",
            message: `Level kognitif "${cogText}" tidak ada di daftar resmi; disimpan apa adanya.`,
          });
        }
      } else {
        cognitiveLevel = cogText;
      }
    }

    let difficulty: string | null = null;
    const diffText = cellToString(values.difficulty);
    if (diffText) {
      difficulty = DIFFICULTY[normalizeText(diffText)] ?? null;
      if (!difficulty) {
        difficulty = diffText.toLowerCase();
        issues.push({
          level: "warning",
          field: "difficulty",
          message: `Tingkat kesulitan "${diffText}" tidak dikenali (pakai Mudah/Sedang/Sulit); disimpan apa adanya.`,
        });
      }
    }

    const answerKey = parseAnswerKey(values.answer_key);
    if (!isBlank(values.answer_key) && !answerKey) {
      issues.push({
        level: "error",
        field: "answer_key",
        message: `Kunci jawaban "${cellToString(values.answer_key)}" harus satu huruf A–E.`,
      });
    }

    let isVoided = parseYesNo(values.voided);
    if (isVoided == null) {
      issues.push({
        level: "warning",
        field: "voided",
        message: `Isian "Dianulir" ("${cellToString(values.voided)}") tidak dikenali; dianggap tidak dianulir.`,
      });
      isVoided = false;
    }

    const status = statusOf(issues);
    out.push({
      rowNumber,
      status,
      issues,
      data:
        status === "error" || number == null || !competency
          ? null
          : { number, competencyId: competency, competencyName, cognitiveLevel, difficulty, answerKey, isVoided },
    });
  }

  const valid = out.filter((r) => r.data).map((r) => r.data!);
  if (out.every((r) => r.status === "skipped")) {
    fileIssues.push({ level: "error", message: "Tidak ada baris soal yang bisa dibaca di file ini." });
  }
  if (valid.length) {
    const numbers = new Set(valid.map((v) => v.number));
    const max = Math.max(...numbers);
    const missing = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !numbers.has(n) && !seen.has(n));
    if (missing.length) {
      fileIssues.push({ level: "warning", message: `Nomor soal tidak berurutan; tidak ada nomor ${formatList(missing)}.` });
    }
    const noKey = valid.filter((v) => !v.answerKey).map((v) => v.number);
    if (noKey.length) {
      fileIssues.push({
        level: "warning",
        message: `${noKey.length} soal tanpa kunci jawaban (no. ${formatList(noKey)}). Hasil TO untuk soal ini harus diunggah dalam format 1/0.`,
      });
    }
  }
  return { rows: out, fileIssues };
}

/** [1,2,3,7] -> "1–3, 7" */
export function formatList(numbers: readonly number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!;
    let end = start;
    while (sorted[i + 1] === end + 1) end = sorted[++i]!;
    parts.push(end > start + 1 ? `${start}–${end}` : end === start + 1 ? `${start}, ${end}` : String(start));
  }
  return parts.join(", ");
}
