import type { Cell } from "./sheet";

export type IssueLevel = "error" | "warning";

/** A validation message in plain Indonesian (§12): no codes, no stack traces. */
export interface Issue {
  level: IssueLevel;
  /** Field key the issue belongs to (for highlighting a cell in the preview). */
  field?: string;
  message: string;
}

export type RowStatus = "ok" | "warning" | "error" | "skipped";

export interface ValidatedRow<T> {
  /** 1-based spreadsheet row number, as the user sees it in Excel. */
  rowNumber: number;
  status: RowStatus;
  data: T | null;
  issues: Issue[];
}

export interface ValidationResult<T> {
  rows: ValidatedRow<T>[];
  /** Problems that concern the whole file (missing columns, unknown item numbers…). */
  fileIssues: Issue[];
}

/** One input row after column mapping and manual edits from the preview. */
export interface RowInput {
  rowNumber: number;
  values: Record<string, Cell>;
}

export function statusOf(issues: readonly Issue[]): RowStatus {
  if (issues.some((i) => i.level === "error")) return "error";
  if (issues.some((i) => i.level === "warning")) return "warning";
  return "ok";
}

export function summarize(rows: readonly { status: RowStatus }[]) {
  const s = { total: rows.length, ok: 0, warning: 0, error: 0, skipped: 0 };
  for (const r of rows) s[r.status]++;
  return s;
}

/** True when the file can be saved: no file-level errors and at least one savable row. */
export function canCommit(result: { rows: readonly { status: RowStatus }[]; fileIssues: readonly Issue[] }) {
  return (
    !result.fileIssues.some((i) => i.level === "error") &&
    result.rows.some((r) => r.status === "ok" || r.status === "warning")
  );
}
