/**
 * Header detection and automatic column mapping (CLAUDE.md §9.3 steps 2–3).
 *
 * A "field" is a target attribute (e.g. `nis`, `competency`). Each field has
 * a synonym dictionary; headers are matched exactly, by containment, or by
 * fuzzy similarity. Import types with open-ended columns (try-out items 1..n)
 * supply a `dynamic` matcher that turns a header into a field key.
 */
import type { Cell } from "./sheet";
import { compactText, normalizeText, similarity } from "./text";

export interface FieldDef {
  key: string;
  /** Label shown in the mapping dropdown (Indonesian). */
  label: string;
  required?: boolean;
  /** Short hint shown under the dropdown. */
  hint?: string;
  synonyms: readonly string[];
}

/** Turns a header such as "Soal 12" into a field key such as "item:12", or null. */
export type DynamicMatcher = (header: string) => string | null;

export interface FieldSet {
  fields: readonly FieldDef[];
  dynamic?: DynamicMatcher;
  /** Human label for a dynamic key, e.g. "item:12" -> "Soal no. 12". */
  dynamicLabel?: (key: string) => string;
}

/** Per column: the field key it maps to, or null when the column is ignored. */
export type ColumnMapping = (string | null)[];

const MIN_SCORE = 0.7;
const HEADER_SCAN_ROWS = 25;

function matchScore(header: string, synonym: string): number {
  const h = normalizeText(header);
  const s = normalizeText(synonym);
  if (!h || !s) return 0;
  if (h === s || compactText(h) === compactText(s)) return 1;
  // Containment on whole words: "nama lengkap siswa" contains "nama siswa"? -> no; contains "nama" -> yes.
  const hw = h.split(" ");
  const sw = s.split(" ");
  if (sw.every((w) => hw.includes(w))) return 0.7 + 0.25 * (s.length / h.length);
  const sim = similarity(h, s);
  return sim >= 0.8 ? sim * 0.95 : 0;
}

/** Best score of a header against one field (its label and all synonyms). */
export function fieldScore(header: string, field: FieldDef): number {
  let best = matchScore(header, field.label);
  for (const syn of field.synonyms) best = Math.max(best, matchScore(header, syn));
  return best;
}

function cellText(c: Cell | undefined): string {
  return c == null ? "" : String(c).trim();
}

/** How strongly a row looks like a header row: number of distinct fields it would map. */
function headerRowScore(labels: string[], set: FieldSet): number {
  const used = new Set<string>();
  let dynamicHits = 0;
  for (const text of labels) {
    if (!text) continue;
    const dyn = set.dynamic?.(text);
    if (dyn) {
      dynamicHits++;
      continue;
    }
    let bestKey: string | null = null;
    let best = 0;
    for (const f of set.fields) {
      const s = fieldScore(text, f);
      if (s > best && !used.has(f.key)) {
        best = s;
        bestKey = f.key;
      }
    }
    if (bestKey && best >= 0.85) used.add(bestKey);
  }
  // Dynamic columns (1..n) are weaker evidence than named fields: a data row of 0/1 answers is not a header.
  return used.size + Math.min(dynamicHits, 3) * 0.5;
}

export interface HeaderDetection {
  /** 0-based index of the header row inside the sheet. */
  headerRowIndex: number;
  headers: string[];
}

/**
 * Finds the header row within the first rows of a sheet, skipping titles,
 * blank lines and notes above the table. For two-row headers, an empty header
 * cell borrows the label from the row above (e.g. "NIS" above, "1 2 3…" below).
 */
export function detectHeaderRow(rows: Cell[][], set: FieldSet): HeaderDetection | null {
  let bestIndex = -1;
  let bestScore = 0;
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let i = 0; i < limit; i++) {
    // Score with labels borrowed from the row above, so two-row headers win over their top row.
    const score = headerRowScore(headersAt(rows, i), set);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  if (bestIndex < 0 || bestScore < 1) return null;
  return { headerRowIndex: bestIndex, headers: headersAt(rows, bestIndex) };
}

/** Header labels for a given header row (with the two-row fallback). */
export function headersAt(rows: Cell[][], headerRowIndex: number): string[] {
  const row = rows[headerRowIndex] ?? [];
  const above = headerRowIndex > 0 ? rows[headerRowIndex - 1] ?? [] : [];
  const width = Math.max(...rows.map((r) => r.length), 0);
  return Array.from({ length: width }, (_, c) => cellText(row[c]) || cellText(above[c]));
}

/** Maps each column to the most likely field; every field is used at most once. */
export function autoMap(headers: readonly string[], set: FieldSet): { columns: ColumnMapping; confidence: number[] } {
  const columns: ColumnMapping = headers.map(() => null);
  const confidence = headers.map(() => 0);
  const usedFields = new Set<string>();

  const candidates: { col: number; key: string; score: number }[] = [];
  headers.forEach((header, col) => {
    if (!header) return;
    for (const f of set.fields) {
      const score = fieldScore(header, f);
      if (score >= MIN_SCORE) candidates.push({ col, key: f.key, score });
    }
    const dyn = set.dynamic?.(header);
    // A dynamic match is exact by construction, but named fields that match perfectly win.
    if (dyn) candidates.push({ col, key: dyn, score: 0.99 });
  });

  candidates.sort((a, b) => b.score - a.score || a.col - b.col);
  for (const c of candidates) {
    if (columns[c.col] != null || usedFields.has(c.key)) continue;
    columns[c.col] = c.key;
    confidence[c.col] = c.score;
    usedFields.add(c.key);
  }
  return { columns, confidence };
}

/** Required fields that no column is mapped to. */
export function missingRequired(columns: ColumnMapping, set: FieldSet): FieldDef[] {
  const mapped = new Set(columns.filter(Boolean));
  return set.fields.filter((f) => f.required && !mapped.has(f.key));
}

/** Row cells -> { fieldKey: value } using the mapping. Unmapped columns are dropped. */
export function applyMapping(cells: readonly Cell[], columns: ColumnMapping): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  columns.forEach((key, col) => {
    if (key) out[key] = cells[col] ?? null;
  });
  return out;
}

/** Stable identity of a header layout, used to remember confirmed mappings per school. */
export function headerSignature(headers: readonly string[]): string {
  return headers.map((h) => normalizeText(h)).join("|");
}

/** Data rows below the header, with their 1-based spreadsheet row numbers; blank rows dropped. */
export function dataRows(rows: Cell[][], headerRowIndex: number): { rowNumber: number; cells: Cell[] }[] {
  const out: { rowNumber: number; cells: Cell[] }[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const cells = rows[i]!;
    if (cells.every((c) => c == null)) continue;
    out.push({ rowNumber: i + 1, cells });
  }
  return out;
}

export function fieldLabel(set: FieldSet, key: string): string {
  return set.fields.find((f) => f.key === key)?.label ?? set.dynamicLabel?.(key) ?? key;
}
