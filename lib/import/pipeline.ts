/**
 * Glue between the generic import steps and the per-type validators. Pure:
 * the server layer loads master data into the contexts and persists results.
 */
import { applyMapping, autoMap, dataRows, detectHeaderRow, headersAt, type ColumnMapping, type FieldSet } from "./mapping";
import type { Cell, SheetData } from "./sheet";
import { BLUEPRINT_FIELDS } from "./tka/blueprint";
import { PRACTICE_FIELDS } from "./tka/practice";
import { RESULTS_FIELDS } from "./tka/results";
import type { RowInput } from "./types";

export const TKA_IMPORT_KINDS = ["tryout_blueprint", "tryout_results", "practice_logs"] as const;
export type TkaImportKind = (typeof TKA_IMPORT_KINDS)[number];

export const IMPORT_KIND_LABEL: Record<TkaImportKind | "achievements", string> = {
  tryout_blueprint: "Kisi-kisi TO",
  tryout_results: "Hasil TO",
  practice_logs: "Latihan Pekanan",
  achievements: "Prestasi",
};

export function fieldSetFor(kind: TkaImportKind): FieldSet {
  switch (kind) {
    case "tryout_blueprint":
      return BLUEPRINT_FIELDS;
    case "tryout_results":
      return RESULTS_FIELDS;
    case "practice_logs":
      return PRACTICE_FIELDS;
  }
}

export interface SheetLayout {
  sheetIndex: number;
  headerRowIndex: number;
  headers: string[];
  columns: ColumnMapping;
  confidence: number[];
}

/**
 * Picks the sheet whose detected header maps the most fields (skipping
 * instruction/reference sheets), and maps its columns automatically.
 */
export function detectLayout(sheets: readonly SheetData[], set: FieldSet): SheetLayout | null {
  let best: SheetLayout | null = null;
  let bestScore = -1;
  sheets.forEach((sheet, sheetIndex) => {
    const det = detectHeaderRow(sheet.rows, set);
    if (!det) return;
    const { columns, confidence } = autoMap(det.headers, set);
    const named = columns.filter((c) => c && set.fields.some((f) => f.key === c)).length;
    const dynamic = columns.filter((c) => c && !set.fields.some((f) => f.key === c)).length;
    const score = named + Math.min(dynamic, 5) * 0.4 + (sheet.rows.length - det.headerRowIndex > 1 ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { sheetIndex, headerRowIndex: det.headerRowIndex, headers: det.headers, columns, confidence };
    }
  });
  return best;
}

/** Re-reads the headers when the user picks another sheet or header row. */
export function layoutFor(sheet: SheetData, headerRowIndex: number, set: FieldSet): SheetLayout & { sheetIndex: -1 } {
  const headers = headersAt(sheet.rows, headerRowIndex);
  const { columns, confidence } = autoMap(headers, set);
  return { sheetIndex: -1, headerRowIndex, headers, columns, confidence };
}

/** Builds validator input from sheet rows + mapping + manual edits (keyed by spreadsheet row number). */
export function buildRowInputs(
  rows: Cell[][],
  headerRowIndex: number,
  columns: ColumnMapping,
  edits?: ReadonlyMap<number, Record<string, Cell>>,
): RowInput[] {
  return dataRows(rows, headerRowIndex).map(({ rowNumber, cells }) => ({
    rowNumber,
    values: { ...applyMapping(cells, columns), ...(edits?.get(rowNumber) ?? {}) },
  }));
}
