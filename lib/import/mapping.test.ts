import { describe, expect, it } from "vitest";
import { autoMap, dataRows, detectHeaderRow, headerSignature, missingRequired } from "./mapping";
import type { Cell } from "./sheet";
import { similarity } from "./text";
import { BLUEPRINT_FIELDS } from "./tka/blueprint";
import { PRACTICE_FIELDS } from "./tka/practice";
import { RESULTS_FIELDS } from "./tka/results";

describe("similarity", () => {
  it("tolerates typos and word order", () => {
    expect(similarity("Mtematika", "Matematika")).toBeGreaterThan(0.85);
    expect(similarity("Aminah Siti", "Siti Aminah")).toBe(1);
    expect(similarity("Budi", "Matematika")).toBeLessThan(0.4);
  });
});

describe("detectHeaderRow", () => {
  it("skips title rows and blank lines above the table", () => {
    const rows: Cell[][] = [
      ["REKAP LATIHAN SOAL PEKANAN", null, null, null, null],
      ["SD Talenta Juara Bandung — Kelas 6", null, null, null, null],
      [null, null, null, null, null],
      ["No", "No. Induk", "Nama Lengkap", "Mata Pelajaran", "Jml Soal", "Jml Benar"],
      [1, "20211001", "Budi", "MTK", 10, 7],
    ];
    const det = detectHeaderRow(rows, PRACTICE_FIELDS);
    expect(det?.headerRowIndex).toBe(3);
  });

  it("borrows labels from the row above in two-row headers", () => {
    const rows: Cell[][] = [
      ["NIS", "Nama", "Nomor Soal", null, null],
      [null, null, 1, 2, 3],
      ["20211001", "Budi", "A", "B", "C"],
    ];
    const det = detectHeaderRow(rows, RESULTS_FIELDS)!;
    expect(det.headerRowIndex).toBe(1);
    expect(det.headers).toEqual(["NIS", "Nama", "1", "2", "3"]);
    expect(dataRows(rows, det.headerRowIndex)).toEqual([{ rowNumber: 3, cells: ["20211001", "Budi", "A", "B", "C"] }]);
  });

  it("returns null when nothing looks like a header", () => {
    expect(detectHeaderRow([["foo", "bar"], [1, 2]], PRACTICE_FIELDS)).toBeNull();
  });
});

describe("autoMap", () => {
  it("maps messy header names via synonyms", () => {
    const { columns } = autoMap(
      ["No", "No. Induk", "Nama Lengkap", "Rombel", "Mata Pelajaran", "Tgl", "Jml Soal", "Jml Benar", "Paraf Guru"],
      PRACTICE_FIELDS,
    );
    expect(columns).toEqual([null, "nis", "name", "class", "subject", "week", "attempted", "correct", null]);
  });

  it("maps item number columns dynamically", () => {
    const { columns } = autoMap(["NIS", "Nama Siswa", "Kelas", "Soal 1", "S2", "3", "No. 4", "Nilai"], RESULTS_FIELDS);
    expect(columns).toEqual(["nis", "name", "class", "item:1", "item:2", "item:3", "item:4", "total_score"]);
  });

  it("maps blueprint headers and reports missing required fields", () => {
    const { columns } = autoMap(["Nomor Butir", "Materi", "Submateri", "Level", "Kunci"], BLUEPRINT_FIELDS);
    expect(columns).toEqual(["number", "element", "competency", "cognitive_level", "answer_key"]);
    expect(missingRequired(columns, BLUEPRINT_FIELDS)).toEqual([]);
    const partial = autoMap(["Nomor Butir", "Kunci"], BLUEPRINT_FIELDS).columns;
    expect(missingRequired(partial, BLUEPRINT_FIELDS).map((f) => f.key)).toEqual(["competency"]);
  });

  it("never maps one field to two columns", () => {
    const { columns } = autoMap(["Nama", "Nama Siswa"], RESULTS_FIELDS);
    expect(columns.filter((c) => c === "name")).toHaveLength(1);
  });
});

describe("headerSignature", () => {
  it("is insensitive to case and punctuation", () => {
    expect(headerSignature(["No. Induk", "NAMA"])).toBe(headerSignature(["no induk", "Nama"]));
  });
});
