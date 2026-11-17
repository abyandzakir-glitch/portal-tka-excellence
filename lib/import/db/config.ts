/**
 * Shape of `import_batches.mapping_json` and `source_json` for TKA imports.
 * Everything needed to (re)validate a batch lives here, so the preview can be
 * rebuilt after every mapping change or manual edit without re-uploading.
 */
import { z } from "zod";
import type { ColumnMapping } from "../mapping";
import type { TkaImportKind } from "../pipeline";
import type { Cell, SheetData } from "../sheet";
import type { Issue } from "../types";

export interface NewTryoutOptions {
  name: string;
  date: string; // YYYY-MM-DD
  level: "sd" | "smp";
  subjectId: string;
  /** null = network-wide TO owned by the foundation. */
  ownerSchoolId: string | null;
  schoolIds: string[];
}

export interface BatchOptions {
  /** Results imports, and blueprint imports that update an existing TO. */
  tryoutId?: string | null;
  /** Blueprint imports that create a new TO on commit. */
  newTryout?: NewTryoutOptions | null;
  /** Practice imports: Monday used when the file has no week column. */
  defaultWeek?: string | null;
}

export interface BatchSummary {
  total: number;
  ok: number;
  warning: number;
  error: number;
  skipped: number;
}

export interface BatchConfig {
  kind: TkaImportKind;
  sheetIndex: number;
  headerRowIndex: number;
  headers: string[];
  columns: ColumnMapping;
  /** True when the column mapping came from a saved profile of this school. */
  fromProfile?: boolean;
  /** Manual corrections from the preview: { rowNumber: { fieldKey: value } }. */
  edits: Record<string, Record<string, Cell>>;
  options: BatchOptions;
  fileIssues: Issue[];
  summary: BatchSummary;
  /** Results imports: how answers were read. */
  resultsMode?: "items" | "total";
  answerMode?: "letter" | "binary" | null;
}

export interface BatchSource {
  sheets: SheetData[];
}

/** An error whose message is safe and meaningful to show to the user (Indonesian). */
export class ImportError extends Error {}

const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** Validates mapping/edit input coming from the browser. */
export const mappingUpdateSchema = z.object({
  sheetIndex: z.number().int().min(0).max(50),
  headerRowIndex: z.number().int().min(0).max(1000),
  columns: z.array(z.string().max(40).nullable()).max(500),
});

export const rowEditSchema = z.object({
  rowNumber: z.number().int().min(1).max(100_000),
  values: z.record(z.string().max(40), cell),
});

export function editsMap(config: BatchConfig): Map<number, Record<string, Cell>> {
  return new Map(Object.entries(config.edits ?? {}).map(([k, v]) => [Number(k), v]));
}
