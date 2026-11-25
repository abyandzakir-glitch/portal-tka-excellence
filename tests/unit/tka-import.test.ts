/**
 * Fase 2 acceptance criterion (CLAUDE.md §11): "file template contoh dan file
 * dengan header berantakan sama-sama bisa diimpor dengan benar".
 *
 * For each import type we build (a) the official template filled in and (b) a
 * messy file as a school might send it (title rows, merged cells, renamed and
 * reordered columns, other value formats, footer rows). Both go through the
 * real pipeline: read file -> detect sheet/header -> auto-map -> validate.
 * The normalised output must be identical.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { Roster, type CompetencyRef } from "@/lib/import/lookup";
import { missingRequired } from "@/lib/import/mapping";
import { buildRowInputs, detectLayout, fieldSetFor, type TkaImportKind } from "@/lib/import/pipeline";
import { readTabularFile, type Cell } from "@/lib/import/sheet";
import { BLUEPRINT_FIELDS, normalizeCognitiveLevel, validateBlueprint } from "@/lib/import/tka/blueprint";
import { validatePractice } from "@/lib/import/tka/practice";
import { validateResults, type ResultsItem } from "@/lib/import/tka/results";
import { buildBlueprintTemplate, buildPracticeTemplate, buildResultsTemplate } from "@/lib/import/templates/tka";
import { canCommit } from "@/lib/import/types";
import { COGNITIVE_LEVELS, subCode, SUBJECTS } from "../../scripts/seed/competencies";

// ---------------------------------------------------------------------------
// Dummy master data (no real students)
// ---------------------------------------------------------------------------
const MAT_SMP = SUBJECTS.find((s) => s.code === "MAT" && s.level === "smp")!;
const BIN_SMP = SUBJECTS.find((s) => s.code === "BIN" && s.level === "smp")!;
const compsOf = (s: typeof MAT_SMP): CompetencyRef[] =>
  s.elements.flatMap((el) => el.subs.map((name, i) => ({ id: subCode(s, el, i), code: subCode(s, el, i), name, elementName: el.name })));
const MAT_COMPS = compsOf(MAT_SMP);
const BIN_COMPS = compsOf(BIN_SMP);
const SUBJECT_REFS = [
  { id: "subj-mat", code: "MAT", name: "Matematika" },
  { id: "subj-bin", code: "BIN", name: "Bahasa Indonesia" },
];

const STUDENTS = [
  { id: "st-1", nis: "20245001", nisn: "9900000011", fullName: "Ahmad Fauzi", className: "9A" },
  { id: "st-2", nis: "20245002", nisn: "9900000012", fullName: "Nurul Hidayah", className: "9A" },
  { id: "st-3", nis: "20245003", nisn: "9900000013", fullName: "Dimas Saputra", className: "9A" },
  { id: "st-4", nis: "20245004", nisn: "9900000014", fullName: "Putri Ramadhani", className: "9B" },
  { id: "st-5", nis: "20245005", nisn: "9900000015", fullName: "Rafi Akbar", className: "9B" },
];
const roster = new Roster(STUDENTS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fillSheet(bytes: Uint8Array, sheetName: string, rows: Cell[][]): Uint8Array {
  const wb = XLSX.read(bytes, { type: "array" });
  XLSX.utils.sheet_add_aoa(wb.Sheets[sheetName]!, rows, { origin: "A2" });
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

function workbook(sheets: { name: string; rows: Cell[][]; merges?: XLSX.Range[] }[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.merges) ws["!merges"] = s.merges;
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

/** Runs the generic steps and returns validator input, asserting auto-mapping found every required field. */
function prepare(bytes: Uint8Array, filename: string, kind: TkaImportKind) {
  const sheets = readTabularFile(bytes, filename);
  const set = fieldSetFor(kind);
  const layout = detectLayout(sheets, set);
  expect(layout, "layout detected").not.toBeNull();
  expect(missingRequired(layout!.columns, set).map((f) => f.key)).toEqual([]);
  const rows = buildRowInputs(sheets[layout!.sheetIndex]!.rows, layout!.headerRowIndex, layout!.columns);
  return { rows, columns: layout!.columns, layout: layout!, sheetName: sheets[layout!.sheetIndex]!.name };
}

const m = (n: number) => MAT_COMPS[n]!;

// ---------------------------------------------------------------------------
// 1. Kisi-kisi
// ---------------------------------------------------------------------------
describe("level kognitif Matematika SD", () => {
  const SD = COGNITIVE_LEVELS.sd.MAT;
  it.each([
    ["Level 1 — Pengetahuan dan Pemahaman", "Level 1 — Pengetahuan dan Pemahaman"],
    ["Level 2 - Aplikasi", "Level 2 — Aplikasi"],
    ["L3", "Level 3 — Penalaran"],
    ["2", "Level 2 — Aplikasi"],
    ["aplikasi", "Level 2 — Aplikasi"],
    ["Penalaran", "Penalaran"],
    ["Pemecahan masalah", "Pemecahan masalah matematis"],
    ["koneksi matematis", "Koneksi matematis"],
  ])("%s -> %s", (input, expected) => expect(normalizeCognitiveLevel(input, SD)).toBe(expected));
});

describe("impor kisi-kisi TO: template vs file berantakan", () => {
  const ctx = {
    subject: SUBJECT_REFS[0]!,
    subjects: SUBJECT_REFS,
    competencies: MAT_COMPS,
    cognitiveLevels: COGNITIVE_LEVELS.smp.MAT,
  };
  const LV = COGNITIVE_LEVELS.smp.MAT;
  // number, competency index, level index, difficulty, key, voided
  const ITEMS: [number, number, number, string, string, boolean][] = [
    [1, 0, 0, "Mudah", "A", false],
    [2, 1, 1, "Sedang", "C", false],
    [3, 2, 2, "Sulit", "B", false],
    [4, 3, 0, "Mudah", "D", false],
    [5, 4, 1, "Sedang", "A", true],
    [6, 5, 2, "Sulit", "E", false],
    [7, 8, 1, "Sedang", "B", false],
    [8, 9, 0, "Mudah", "C", false],
  ];

  const neat = fillSheet(
    buildBlueprintTemplate({ subjectName: "Matematika", levelLabel: "SMP", competencies: MAT_COMPS, cognitiveLevels: LV, itemCount: 10 }),
    "Kisi-kisi",
    ITEMS.map(([n, c, l, d, k, v]) => [n, "Matematika", null, m(c).name, LV[l]!, d, k, v ? "Ya" : null]),
  );

  const messy = workbook([
    { name: "Catatan", rows: [["File ini berisi kisi-kisi TO 2"], ["Disusun oleh tim kurikulum"]] },
    {
      name: "KISI TO2",
      rows: [
        ["KISI-KISI TRY OUT 2 MATEMATIKA", null, null, null, null, null, null],
        ["SMP Talenta Juara — TA 2026/2027", null, null, null, null, null, null],
        [null, null, null, null, null, null, null],
        ["No. Butir", "Kunci Jwb", "Materi", "Submateri", "Lvl", "Tingkat Kesukaran", "Anulir?", "Keterangan"],
        // code instead of name, lowercase key, "L1"/"2"/"aplikasi" levels, "sukar"/"easy" difficulty, "x" for voided
        [1, "a", "Bilangan", m(0).code, "L1", "easy", null, "soal cerita"],
        [2, "c", "Aljabar", "Persamaan dan Pertidaksamaan Linear", "2", "medium", "tidak", null], // typo: Linear
        [3, "B", "Aljabar", m(2).name, "Level 3", "sukar", null, null],
        [4, " D ", "Aljabar", `Aljabar - ${m(3).name}`, "pengetahuan dan pemahaman", "rendah", null, null],
        [5, "A", "Aljabar", m(4).name, "aplikasi", "sedang", "x", "dianulir panitia"],
        [6, "E", "Geometri dan Pengukuran", m(5).name.toUpperCase(), "3", "HOTS", null, null],
        [7, "b", "Data dan Peluang", m(8).name, "L2", "S", null, null],
        [8, "C", "Data dan Peluang", m(9).name, "1", "M", null, null],
        [null, null, null, null, null, null, null, null],
        ["Jumlah soal: 8", null, null, null, null, null, null, null],
      ],
      merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }],
    },
  ]);

  it("template rapi terbaca tanpa error", () => {
    const { rows } = prepare(neat, "Template_Kisi_TO.xlsx", "tryout_blueprint");
    const res = validateBlueprint(rows, ctx);
    expect(res.fileIssues.filter((i) => i.level === "error")).toEqual([]);
    expect(res.rows.filter((r) => r.status === "error")).toEqual([]);
    expect(res.rows.filter((r) => r.data)).toHaveLength(ITEMS.length);
    expect(canCommit(res)).toBe(true);
  });

  it("file berantakan menghasilkan kisi-kisi yang sama persis", () => {
    const a = validateBlueprint(prepare(neat, "Template_Kisi_TO.xlsx", "tryout_blueprint").rows, ctx);
    const prepared = prepare(messy, "kisi to2 FINAL.xlsx", "tryout_blueprint");
    expect(prepared.sheetName).toBe("KISI TO2");
    expect(prepared.layout.headerRowIndex).toBe(3);
    const b = validateBlueprint(prepared.rows, ctx);
    expect(b.rows.filter((r) => r.status === "error")).toEqual([]);
    const items = (res: typeof a) => res.rows.filter((r) => r.data).map((r) => r.data);
    expect(items(b)).toEqual(items(a));
    // The fuzzy competency match is flagged for confirmation.
    expect(b.rows.find((r) => r.rowNumber === 6)?.status).toBe("warning");
    expect(items(a).find((i) => i!.number === 5)?.isVoided).toBe(true);
  });

  it("menolak kompetensi asing, kunci tidak valid, dan nomor ganda dengan pesan yang jelas", () => {
    const res = validateBlueprint(
      [
        { rowNumber: 2, values: { number: 1, competency: "Trigonometri", answer_key: "A" } },
        { rowNumber: 3, values: { number: 2, competency: m(0).name, answer_key: "AB" } },
        { rowNumber: 4, values: { number: 2, competency: m(1).name, answer_key: "B" } },
        { rowNumber: 5, values: { number: 4, competency: m(1).name, subject: "Bahasa Indonesia" } },
      ],
      ctx,
    );
    expect(res.rows.map((r) => r.status)).toEqual(["error", "error", "error", "error"]);
    expect(res.rows[0]!.issues[0]!.message).toMatch(/Trigonometri" tidak dikenali/);
    expect(res.rows[1]!.issues[0]!.message).toMatch(/harus satu huruf A–E/);
    expect(res.rows[2]!.issues[0]!.message).toBe("Nomor soal 2 sudah ada di baris 3.");
    expect(res.rows[3]!.issues[0]!.message).toMatch(/tidak sama dengan mapel TO ini/);
  });
});

// ---------------------------------------------------------------------------
// 2. Hasil TO
// ---------------------------------------------------------------------------
describe("impor hasil TO: template vs file berantakan", () => {
  const KEYS = ["A", "C", "B", "D", "A", "E", "B", "C"];
  const items: ResultsItem[] = KEYS.map((k, i) => ({ id: `item-${i + 1}`, number: i + 1, answerKey: k, isVoided: i + 1 === 5 }));
  // Per student: answers (null = blank). st-4 absent, st-5 answers nothing on items 7-8.
  const ANSWERS: Record<string, (string | null)[]> = {
    "st-1": ["A", "C", "B", "D", "A", "E", "B", "C"],
    "st-2": ["A", "B", "B", "A", "C", "E", "D", "C"],
    "st-3": ["D", "C", "A", "D", "A", "A", "B", "B"],
    "st-4": [null, null, null, null, null, null, null, null],
    "st-5": ["A", "C", "C", "D", "B", "E", null, null],
  };
  const binary = (sid: string) => ANSWERS[sid]!.map((a, i) => (a == null ? null : a === KEYS[i] ? 1 : 0));

  const neat = fillSheet(
    buildResultsTemplate({ tryoutName: "TO 2 Matematika SMP", schoolName: "SMP TJ", itemNumbers: items.map((i) => i.number), students: STUDENTS }),
    "Hasil TO",
    STUDENTS.map((s) => [s.nis, s.nisn, s.fullName, s.className, ...ANSWERS[s.id]!, null]),
  );

  // CSV with semicolons, title lines, renamed headers, 1/0 answers, a total column, a footer row.
  const csvLines = [
    "REKAP NILAI TRY OUT 2;;;;;;;;;;;;",
    ";;;;;;;;;;;;",
    "No;No Induk;Nama Peserta;Rombel;S1;S2;S3;S4;S5;S6;S7;S8;Skor",
    ...STUDENTS.map((s, idx) =>
      [idx + 1, s.nis, s.fullName.toUpperCase(), s.className, ...binary(s.id).map((v) => (v == null ? "" : String(v))), ""].join(";"),
    ),
    ";;Rata-rata;;;;;;;;;;",
  ];
  const messy = new TextEncoder().encode(csvLines.join("\r\n"));

  const summary = (res: ReturnType<typeof validateResults>) =>
    res.rows
      .filter((r) => r.data)
      .map((r) => ({
        studentId: r.data!.studentId,
        status: r.data!.status,
        rawScore: r.data!.rawScore,
        correct: r.data!.responses.map((x) => x.isCorrect),
      }));

  it("template rapi: nilai dihitung dari kunci, soal anulir tidak dihitung, semua kosong = absen", () => {
    const { rows, columns } = prepare(neat, "Template_Hasil_TO.xlsx", "tryout_results");
    const res = validateResults(rows, columns, { items, roster });
    expect(res.mode).toBe("items");
    expect(res.answerMode).toBe("letter");
    expect(res.fileIssues.filter((i) => i.level === "error")).toEqual([]);
    const byId = new Map(summary(res).map((s) => [s.studentId, s]));
    expect(byId.get("st-1")).toMatchObject({ status: "present", rawScore: 100 }); // 7/7 counted items
    // st-2: A✓ B✗ B✓ A✗ [no. 5 dianulir] E✓ D✗ C✓ -> 4 benar dari 7 butir yang dihitung
    expect(byId.get("st-2")!.rawScore).toBe(57.14);
    expect(byId.get("st-4")).toMatchObject({ status: "absent", rawScore: null });
    expect(byId.get("st-5")!.correct.slice(6)).toEqual([null, null]); // unanswered
  });

  it("file berantakan (CSV, 1/0, header lain) menghasilkan nilai yang sama persis", () => {
    const a = prepare(neat, "Template_Hasil_TO.xlsx", "tryout_results");
    const b = prepare(messy, "rekap nilai to2.csv", "tryout_results");
    expect(b.layout.headerRowIndex).toBe(2);
    const ra = validateResults(a.rows, a.columns, { items, roster });
    const rb = validateResults(b.rows, b.columns, { items, roster });
    expect(rb.answerMode).toBe("binary");
    expect(rb.rows.filter((r) => r.status === "error")).toEqual([]);
    expect(rb.rows.at(-1)?.status).toBe("skipped"); // "Rata-rata" footer
    expect(summary(rb)).toEqual(summary(ra));
  });

  it("nilai total saja (fallback) ditandai tanpa detail butir", () => {
    const res = validateResults(
      [
        { rowNumber: 2, values: { nis: "20245001", total_score: "85,5" } },
        { rowNumber: 3, values: { nis: "20245002", total_score: null } },
        { rowNumber: 4, values: { nis: "20245003", total_score: 120 } },
      ],
      ["nis", "total_score"],
      { items, roster },
    );
    expect(res.mode).toBe("total");
    expect(res.rows[0]!.data).toMatchObject({ rawScore: 85.5, hasItemDetail: false, status: "present" });
    expect(res.rows[1]!.data).toMatchObject({ status: "absent" });
    expect(res.rows[2]!.status).toBe("error");
    expect(res.fileIssues.some((i) => /tidak dihitung untuk analisis kompetensi/.test(i.message))).toBe(true);
  });

  it("TO tanpa kisi-kisi hanya menerima nilai total", () => {
    const res = validateResults([{ rowNumber: 2, values: { nis: "20245001", "item:1": "A" } }], ["nis", "item:1"], { items: [], roster });
    expect(res.fileIssues[0]!.message).toMatch(/belum punya kisi-kisi/);
    expect(canCommit(res)).toBe(false);
  });

  it("siswa tak dikenal dan siswa ganda menjadi error dengan saran nama", () => {
    const res = validateResults(
      [
        { rowNumber: 2, values: { nis: "111", name: "Ahmad Fauzy", "item:1": "A" } },
        { rowNumber: 3, values: { nis: "20245002", "item:1": "A" } },
        { rowNumber: 4, values: { nis: "20245002", "item:1": "B" } },
      ],
      ["nis", "name", "item:1"],
      { items, roster },
    );
    // Exact name differs by one letter -> confident fuzzy match with warning, not an error.
    expect(res.rows[0]!.status).toBe("warning");
    expect(res.rows[2]!.status).toBe("error");
    expect(res.rows[2]!.issues[0]!.message).toMatch(/sudah muncul di baris 3/);
    const unknown = validateResults([{ rowNumber: 2, values: { nis: "111", name: "Zainal" } }], ["nis", "name"], { items, roster });
    expect(unknown.rows[0]!.issues[0]!.message).toMatch(/NIS 111 \(Zainal\) tidak ditemukan/);
  });

  it("hanya siswa di file yang sudah punya hasil yang dihitung sebagai penggantian", () => {
    const rows = [
      { rowNumber: 2, values: { nis: "20245001", total_score: 80 } },
      { rowNumber: 3, values: { nis: "20245002", total_score: 70 } },
    ];
    const none = validateResults(rows, ["nis", "total_score"], { items, roster, storedStudentIds: new Set(["st-3", "st-4"]) });
    expect(none.replaceCount).toBe(0);
    expect(none.fileIssues.some((i) => /sudah punya hasil/.test(i.message))).toBe(false);
    const one = validateResults(rows, ["nis", "total_score"], { items, roster, storedStudentIds: new Set(["st-2", "st-3"]) });
    expect(one.replaceCount).toBe(1);
    expect(one.fileIssues.find((i) => /sudah punya hasil/.test(i.message))?.message).toMatch(/^1 siswa .*Hasil siswa lain tidak berubah/);
  });

  it("pilihan huruf tanpa kunci jawaban ditolak", () => {
    const noKey = items.map((it) => ({ ...it, answerKey: null }));
    const res = validateResults([{ rowNumber: 2, values: { nis: "20245001", "item:1": "C" } }], ["nis", "item:1"], { items: noKey, roster });
    expect(res.fileIssues.some((i) => i.level === "error" && /kunci jawaban soal no\. 1/.test(i.message))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Latihan pekanan
// ---------------------------------------------------------------------------
describe("impor latihan pekanan: template vs file berantakan", () => {
  const ctx = {
    roster,
    subjects: SUBJECT_REFS,
    competenciesBySubject: new Map([
      ["subj-mat", MAT_COMPS],
      ["subj-bin", BIN_COMPS],
    ]),
    defaultWeek: null,
    today: "2026-11-17",
  };
  // student, subject, competency (or null), attempted, correct
  const LOGS: [string, "Matematika" | "Bahasa Indonesia", CompetencyRef | null, number, number][] = [
    ["st-1", "Matematika", m(1), 12, 9],
    ["st-1", "Bahasa Indonesia", null, 20, 15],
    ["st-2", "Matematika", m(5), 10, 4],
    ["st-3", "Bahasa Indonesia", BIN_COMPS[2]!, 8, 8],
    ["st-4", "Matematika", null, 15, 6],
  ];
  const student = (id: string) => STUDENTS.find((s) => s.id === id)!;

  const neat = fillSheet(
    buildPracticeTemplate({
      schoolName: "SMP TJ",
      weekStart: "2026-11-09",
      subjects: [{ name: "Matematika" }, { name: "Bahasa Indonesia" }],
      competencies: [...MAT_COMPS, ...BIN_COMPS],
      students: [],
    }),
    "Latihan Pekanan",
    LOGS.map(([sid, subj, comp, att, cor]) => {
      const s = student(sid);
      return [s.nis, s.fullName, s.className, "09/11/2026", subj, comp?.name ?? null, att, cor];
    }),
  );

  // Messy: class merged down, dates in different formats within the same week,
  // subject abbreviations, competency codes, "Salah" instead of "Benar".
  const messyDates = ["Rabu, 11 Nov 2026", "2026-11-13", "10/11/26", "15 November 2026", "12.11.2026"];
  const messy = workbook([
    {
      name: "Sheet1",
      rows: [
        ["LAPORAN LATIHAN SOAL PEKAN INI", null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        ["Kelas", "No.", "NIS Siswa", "Nama", "Tgl Latihan", "Mapel", "Kode Kompetensi", "Jml Soal", "Salah"],
        ...LOGS.map(([sid, subj, comp, att, cor], i) => {
          const s = student(sid);
          return [s.className, i + 1, Number(s.nis), s.fullName, messyDates[i]!, subj === "Matematika" ? "MTK" : "B. Indo", comp?.code ?? null, att, att - cor];
        }),
      ],
      // "9A" merged over the first three data rows: the value appears only in the first cell.
      merges: [{ s: { r: 3, c: 0 }, e: { r: 5, c: 0 } }],
    },
  ]);

  const out = (res: ReturnType<typeof validatePractice>) => res.rows.filter((r) => r.data).map((r) => r.data);

  it("template rapi terbaca tanpa error", () => {
    const { rows, columns } = prepare(neat, "Template_Latihan_Pekanan.xlsx", "practice_logs");
    const res = validatePractice(rows, columns, ctx);
    expect(res.fileIssues).toEqual([]);
    expect(res.rows.map((r) => r.status)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(out(res)[0]).toMatchObject({ weekStart: "2026-11-09", attempted: 12, correct: 9, competencyId: m(1).id });
  });

  it("file berantakan menghasilkan log yang sama persis", () => {
    const a = prepare(neat, "Template_Latihan_Pekanan.xlsx", "practice_logs");
    const b = prepare(messy, "latihan pekan 2 nov.xlsx", "practice_logs");
    expect(b.layout.headerRowIndex).toBe(2);
    const ra = validatePractice(a.rows, a.columns, ctx);
    const rb = validatePractice(b.rows, b.columns, ctx);
    expect(rb.rows.filter((r) => r.status === "error")).toEqual([]);
    expect(out(rb)).toEqual(out(ra));
  });

  it("menolak benar > dikerjakan, pekan mendatang, mapel asing, dan baris ganda", () => {
    const cols = ["nis", "week", "subject", "attempted", "correct"];
    const res = validatePractice(
      [
        { rowNumber: 2, values: { nis: "20245001", week: "09/11/2026", subject: "MTK", attempted: 5, correct: 6 } },
        { rowNumber: 3, values: { nis: "20245001", week: "30/11/2026", subject: "MTK", attempted: 5, correct: 1 } },
        { rowNumber: 4, values: { nis: "20245001", week: "09/11/2026", subject: "IPA", attempted: 5, correct: 1 } },
        { rowNumber: 5, values: { nis: "20245002", week: "09/11/2026", subject: "MTK", attempted: 5, correct: 1 } },
        { rowNumber: 6, values: { nis: "20245002", week: "10/11/2026", subject: "Matematika", attempted: 7, correct: 2 } },
        { rowNumber: 7, values: { nis: "20245003", week: "10/11/2026", subject: "Matematika", attempted: 0, correct: 0 } },
      ],
      cols,
      ctx,
    );
    expect(res.rows.map((r) => r.status)).toEqual(["error", "error", "error", "ok", "error", "skipped"]);
    expect(res.rows[0]!.issues[0]!.message).toMatch(/lebih besar dari jumlah dikerjakan/);
    expect(res.rows[1]!.issues[0]!.message).toMatch(/belum terjadi/);
    expect(res.rows[4]!.issues[0]!.message).toMatch(/sudah ada di baris 5/);
  });

  it("memakai pekan bawaan dari form bila file tidak punya kolom pekan, dan memberi tahu data yang akan diganti", () => {
    const key = "st-1|2026-11-16|subj-mat|-";
    const res = validatePractice(
      [{ rowNumber: 2, values: { nis: "20245001", subject: "Matematika", attempted: 10, correct: 5 } }],
      ["nis", "subject", "attempted", "correct"],
      { ...ctx, defaultWeek: "2026-11-16", existingKeys: new Set([key]) },
    );
    expect(res.rows[0]!.data).toMatchObject({ weekStart: "2026-11-16" });
    expect(res.fileIssues[0]!.message).toMatch(/akan menggantikan/);
  });
});

describe("kolom wajib", () => {
  it("BLUEPRINT_FIELDS mewajibkan nomor soal dan sub-kompetensi", () => {
    expect(BLUEPRINT_FIELDS.fields.filter((f) => f.required).map((f) => f.key)).toEqual(["number", "competency"]);
  });
});
