/**
 * Value parsers for spreadsheet cells written by humans (CLAUDE.md §9.3 step 4).
 * Every parser returns null for "not understood" so callers can raise a
 * friendly validation issue instead of throwing.
 */
import { addDays, format, isValid, parse, parseISO } from "date-fns";
import type { Cell } from "./sheet";
import { normalizeText } from "./text";

export function isBlank(value: Cell | undefined): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

export function cellToString(value: Cell | undefined): string {
  if (value == null) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  return String(value).trim();
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/**
 * Indonesian and international number formats:
 * "1.234" -> 1234, "85,5" -> 85.5, "1.234,5" -> 1234.5, "1,234.5" -> 1234.5, "85%" -> 85.
 */
export function parseNumber(value: Cell | undefined): number | null {
  if (value == null || typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = value.trim().replace(/\s/g, "").replace(/%$/, "");
  if (!s) return null;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // Whichever separator comes last is the decimal separator.
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) && !/^-?0,/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // "1.234" thousands separator
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseInteger(value: Cell | undefined): number | null {
  const n = parseNumber(value);
  return n != null && Number.isInteger(n) ? n : null;
}

/**
 * Identifier columns (NIS, NISN): Excel turns "0012345" into 12345 and long
 * numbers into 1.2345E+9; normalise to a plain digit string.
 */
export function parseIdentifier(value: Cell | undefined): string | null {
  if (value == null || typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isFinite(value) ? BigInt(Math.round(value)).toString() : null;
  const s = value.trim().replace(/^'/, "").replace(/[\s.-]/g, "");
  return s === "" ? null : s.toUpperCase();
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, pebruari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, ags: 8, agus: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, nop: 11, november: 11, nopember: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

function isoFromParts(y: number, m: number, d: number): string | null {
  const year = y < 100 ? 2000 + y : y;
  if (year < 1990 || year > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const date = parseISO(iso);
  return isValid(date) && date.getDate() === d ? iso : null;
}

/** Excel serial date (1900 system) -> ISO. 45000 ≈ 2023-03-15. */
function fromExcelSerial(serial: number): string | null {
  if (serial < 20000 || serial > 80000) return null;
  return format(addDays(new Date(1899, 11, 30), Math.floor(serial)), "yyyy-MM-dd");
}

/**
 * Accepts: Excel serial numbers, "2026-11-12", "12/11/2026", "12-11-26",
 * "12.11.2026", "12 Nov 2026", "Kamis, 12 November 2026", "Nov 12, 2026".
 * Day-first is assumed for numeric dates (Indonesian convention).
 */
export function parseDate(value: Cell | undefined): string | null {
  if (value == null || typeof value === "boolean") return null;
  if (typeof value === "number") return fromExcelSerial(value);
  const s = value.trim();
  if (!s) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(s);
  if (m) return isoFromParts(+m[1]!, +m[2]!, +m[3]!);

  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) return isoFromParts(+m[3]!, +m[2]!, +m[1]!);

  if (/^\d{5}(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));

  const words = normalizeText(s).split(" ").filter(Boolean);
  const nums = words.filter((w) => /^\d+$/.test(w)).map(Number);
  const month = words.map((w) => MONTHS[w]).find((x) => x != null);
  if (month != null && nums.length === 2) {
    const [a, b] = nums as [number, number];
    // "12 Nov 2026" or "Nov 12 2026": the 4-digit (or larger) number is the year.
    return a > 31 ? isoFromParts(a, month, b) : isoFromParts(b, month, a);
  }
  return null;
}

/**
 * Week reference -> Monday of that ISO week ("YYYY-MM-DD", Asia/Jakarta calendar).
 * Accepts any date inside the week or an ISO week label "2026-W46".
 */
export function parseWeekStart(value: Cell | undefined): string | null {
  if (typeof value === "string") {
    const m = /^(\d{4})\s*-?\s*W\s*(\d{1,2})$/i.exec(value.trim());
    if (m) {
      const d = parse(`${m[1]}-W${m[2]!.padStart(2, "0")}-1`, "RRRR-'W'II-i", new Date());
      return isValid(d) ? format(d, "yyyy-MM-dd") : null;
    }
    // Ranges such as "10-16 Nov 2026" or "10/11/2026 - 16/11/2026": use the start.
    const range = /^(.+?)\s*(?:-|–|\bs\.?d\.?|\bsampai)\s*(.+)$/i.exec(value.trim());
    if (range) {
      const end = parseDate(range[2]!);
      const start = parseDate(range[1]!) ?? (end && /^\d{1,2}$/.test(range[1]!.trim()) ? `${end.slice(0, 8)}${range[1]!.trim().padStart(2, "0")}` : null);
      if (start) return mondayOf(start);
    }
  }
  const iso = parseDate(value);
  return iso ? mondayOf(iso) : null;
}

function mondayOf(iso: string): string {
  const d = parseISO(iso);
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  return format(addDays(d, 1 - dow), "yyyy-MM-dd");
}

// ---------------------------------------------------------------------------
// Booleans & answers
// ---------------------------------------------------------------------------

const YES = new Set(["ya", "y", "yes", "true", "1", "v", "x", "benar", "dianulir", "anulir", "batal"]);
const NO = new Set(["tidak", "t", "no", "n", "false", "0", "salah", "", "-"]);

/** Yes/no flags such as "Dianulir?": "Ya", "✓", "1", "x" -> true. */
export function parseYesNo(value: Cell | undefined): boolean | null {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  const raw = value.trim();
  if (raw === "✓" || raw === "✔") return true;
  const s = normalizeText(raw);
  if (YES.has(s)) return true;
  if (NO.has(s)) return false;
  return null;
}

export type ParsedAnswer =
  | { kind: "blank" }
  | { kind: "letter"; letter: "A" | "B" | "C" | "D" | "E" }
  | { kind: "binary"; correct: boolean }
  | { kind: "invalid"; raw: string };

/**
 * One answer cell. `mode` decides how ambiguous values are read: in "letter"
 * mode "B" is option B; in "binary" mode "B" means benar (correct).
 */
export function parseAnswer(value: Cell | undefined, mode: "letter" | "binary"): ParsedAnswer {
  if (value == null || isBlank(value) || value === "-") return { kind: "blank" };
  if (typeof value === "boolean") return { kind: "binary", correct: value };
  if (typeof value === "number") {
    if (value === 1 || value === 0) return { kind: "binary", correct: value === 1 };
    return { kind: "invalid", raw: String(value) };
  }
  const s = value.trim().toUpperCase().replace(/[.)\s]/g, "");
  if (mode === "letter" && /^[A-E]$/.test(s)) return { kind: "letter", letter: s as "A" };
  if (["1", "B", "BENAR", "TRUE", "✓", "✔", "V"].includes(s)) return { kind: "binary", correct: true };
  if (["0", "S", "SALAH", "FALSE", "X", "✗", "✘"].includes(s)) return { kind: "binary", correct: false };
  if (/^[A-E]$/.test(s)) return { kind: "letter", letter: s as "A" };
  return { kind: "invalid", raw: String(value) };
}

/**
 * Decides whether a block of answer cells holds option letters (A–E, compared
 * against the answer key) or already-scored 1/0 values. Letters C, D, E or A
 * only occur in letter mode, so their presence is decisive.
 */
export function detectAnswerMode(cells: readonly Cell[]): "letter" | "binary" {
  for (const c of cells) {
    if (typeof c !== "string") continue;
    const s = c.trim().toUpperCase().replace(/[.)\s]/g, "");
    if (/^[ACDE]$/.test(s)) return "letter";
  }
  return "binary";
}

/** Normalises an answer key cell to a single letter A–E, or null. */
export function parseAnswerKey(value: Cell | undefined): "A" | "B" | "C" | "D" | "E" | null {
  if (isBlank(value)) return null;
  const s = cellToString(value).toUpperCase().replace(/[.)\s]/g, "");
  return /^[A-E]$/.test(s) ? (s as "A") : null;
}
