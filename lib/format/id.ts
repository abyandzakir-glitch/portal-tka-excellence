/**
 * Indonesian formatting & calendar helpers (CLAUDE.md §2, §12).
 * All calendar math is done on plain ISO dates ("YYYY-MM-DD") interpreted in
 * Asia/Jakarta, so results do not depend on the server's time zone.
 */
import { TZDate } from "@date-fns/tz";
import { addDays, format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";

export const TIME_ZONE = "Asia/Jakarta";

const numberFmt = new Intl.NumberFormat("id-ID");
const percentFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** 1234 -> "1.234" */
export function formatNumber(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "–" : numberFmt.format(value);
}

/** 0.735 -> "73,5%" (input is a ratio 0..1) */
export function formatPercent(ratio: number | null | undefined): string {
  return ratio == null || Number.isNaN(ratio) ? "–" : `${percentFmt.format(ratio * 100)}%`;
}

/** Today's date in Jakarta as "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  return format(new TZDate(now, TIME_ZONE), "yyyy-MM-dd");
}

/** "2026-11-12" -> "12 Nov 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  return format(parseISO(iso), "d MMM yyyy", { locale: localeId });
}

/** "2026-11-12" -> "12 November 2026" */
export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return "–";
  return format(parseISO(iso), "d MMMM yyyy", { locale: localeId });
}

/** Monday of the (Mon–Sun) week containing the date, as "YYYY-MM-DD". */
export function weekStartOf(iso: string): string {
  const d = parseISO(iso);
  const isoDow = d.getDay() === 0 ? 7 : d.getDay(); // 1 = Monday … 7 = Sunday
  return format(addDays(d, 1 - isoDow), "yyyy-MM-dd");
}

/** "Pekan 10–16 Nov 2026" style label for a week starting on `weekStart`. */
export function formatWeek(weekStart: string): string {
  const start = parseISO(weekStart);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const left = format(start, sameMonth ? "d" : "d MMM", { locale: localeId });
  return `Pekan ${left}–${format(end, "d MMM yyyy", { locale: localeId })}`;
}

/** Academic year (July–June) label for a date: "2026-11-12" -> "2026/2027". */
export function academicYearOf(iso: string): string {
  const d = parseISO(iso);
  const startYear = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${startYear}/${startYear + 1}`;
}

/** Semester 1 = July–December, Semester 2 = January–June. */
export function semesterOf(iso: string): 1 | 2 {
  return parseISO(iso).getMonth() >= 6 ? 1 : 2;
}

/** Start/end ISO dates of an academic year label "2026/2027". */
export function academicYearRange(label: string): { start: string; end: string } {
  const match = /^(\d{4})\/(\d{4})$/.exec(label);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error(`Label tahun ajaran tidak valid: "${label}" (contoh: 2026/2027)`);
  }
  return { start: `${match[1]}-07-01`, end: `${match[2]}-06-30` };
}
