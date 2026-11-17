/**
 * Reads .xlsx / .xls / .csv into plain 2-D arrays of cells.
 *
 * - Merged cells are filled with the top-left value, so a class name merged
 *   down over 30 rows, or a header label merged over two header rows, is seen
 *   on every row it visually covers.
 * - Dates are NOT converted here: Excel stores them as serial numbers and
 *   `parseDate()` interprets them only for date fields, so numeric columns
 *   (scores, counts) never turn into dates by accident.
 */
import Papa from "papaparse";
import * as XLSX from "xlsx";

export type Cell = string | number | boolean | null;

export interface SheetData {
  name: string;
  rows: Cell[][];
}

export const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"] as const;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export class ImportFileError extends Error {}

export function fileExtension(filename: string): string {
  const m = /\.[^.]+$/.exec(filename.toLowerCase());
  return m ? m[0] : "";
}

function cleanCell(value: unknown): Cell {
  if (value == null) return null;
  if (typeof value === "string") {
    // Excel users often prefix numbers with ' to keep leading zeros.
    const s = value.replace(/ /g, " ").replace(/^'/, "").trim();
    return s === "" ? null : s;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/** Drops trailing empty rows/columns so "used range" garbage does not create phantom columns. */
function trim(rows: Cell[][]): Cell[][] {
  let lastRow = rows.length - 1;
  while (lastRow >= 0 && rows[lastRow]!.every((c) => c == null)) lastRow--;
  const kept = rows.slice(0, lastRow + 1);
  let width = 0;
  for (const r of kept) {
    for (let c = r.length - 1; c >= 0; c--) {
      if (r[c] != null) {
        width = Math.max(width, c + 1);
        break;
      }
    }
  }
  return kept.map((r) => Array.from({ length: width }, (_, c) => r[c] ?? null));
}

function readCsv(text: string): SheetData[] {
  const parsed = Papa.parse<unknown[]>(text.replace(/^﻿/, ""), {
    skipEmptyLines: false,
    delimitersToGuess: [",", ";", "\t", "|"],
  });
  return [{ name: "CSV", rows: trim(parsed.data.map((r) => r.map(cleanCell))) }];
}

function readWorkbook(data: Uint8Array): SheetData[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: "array", cellDates: false, cellFormula: false, cellHTML: false });
  } catch {
    throw new ImportFileError("File tidak bisa dibaca. Pastikan file berformat Excel (.xlsx/.xls) atau CSV dan tidak rusak.");
  }
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
    const grid: Cell[][] = rows.map((r) => r.map(cleanCell));
    for (const m of ws["!merges"] ?? []) {
      const value = grid[m.s.r]?.[m.s.c] ?? null;
      if (value == null) continue;
      for (let r = m.s.r; r <= m.e.r; r++) {
        grid[r] ??= [];
        for (let c = m.s.c; c <= m.e.c; c++) if (grid[r]![c] == null) grid[r]![c] = value;
      }
    }
    return { name, rows: trim(grid) };
  });
}

/** Parses an uploaded file. Throws ImportFileError with a user-facing message. */
export function readTabularFile(data: Uint8Array, filename: string): SheetData[] {
  const ext = fileExtension(filename);
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new ImportFileError(`Format file "${ext || "tanpa ekstensi"}" belum didukung. Gunakan .xlsx, .xls, atau .csv.`);
  }
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new ImportFileError("Ukuran file melebihi 5 MB. Hapus sheet yang tidak perlu lalu coba lagi.");
  }
  const sheets = ext === ".csv" ? readCsv(new TextDecoder("utf-8").decode(data)) : readWorkbook(data);
  const nonEmpty = sheets.filter((s) => s.rows.length > 0);
  if (nonEmpty.length === 0) throw new ImportFileError("File kosong: tidak ada data yang bisa dibaca.");
  return nonEmpty;
}
