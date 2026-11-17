/**
 * Global dashboard filters (CLAUDE.md §2, §12): academic year, school, subject
 * and period, kept in the URL so dashboard links can be shared.
 *
 *   ?ta=2026/2027&sekolah=SDTJBDG&mapel=MAT&periode=s1
 *   periode = ta | s1 | s2 | bulan (+bulan=YYYY-MM) | pekan (+pekan=YYYY-MM-DD) | rentang (+dari, +sampai)
 */
import { addDays, endOfMonth, format, isValid, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { z } from "zod";

export const PERIOD_PRESETS = ["ta", "s1", "s2", "bulan", "pekan", "rentang"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  ta: "Tahun ajaran penuh",
  s1: "Semester 1 (Jul–Des)",
  s2: "Semester 2 (Jan–Jun)",
  bulan: "Bulan",
  pekan: "Pekan",
  rentang: "Rentang tanggal",
};

export const SUBJECT_CODES = ["MAT", "BIN"] as const;
export type SubjectCode = (typeof SUBJECT_CODES)[number];
export const SUBJECT_LABEL: Record<SubjectCode, string> = { MAT: "Matematika", BIN: "Bahasa Indonesia" };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => isValid(parseISO(s)));

const schema = z.object({
  ta: z.string().regex(/^\d{4}\/\d{4}$/).optional().catch(undefined),
  sekolah: z.string().regex(/^[A-Z]{4,10}$/).optional().catch(undefined),
  mapel: z.enum(SUBJECT_CODES).catch("MAT").default("MAT"),
  periode: z.enum(PERIOD_PRESETS).catch("ta").default("ta"),
  bulan: z.string().regex(/^\d{4}-\d{2}$/).optional().catch(undefined),
  pekan: isoDate.optional().catch(undefined),
  dari: isoDate.optional().catch(undefined),
  sampai: isoDate.optional().catch(undefined),
});

export type TkaFilters = z.infer<typeof schema>;

type RawParams = Record<string, string | string[] | undefined>;

export function parseTkaFilters(raw: RawParams): TkaFilters {
  const one = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  return schema.parse({
    ta: one("ta"),
    sekolah: one("sekolah"),
    mapel: one("mapel"),
    periode: one("periode"),
    bulan: one("bulan"),
    pekan: one("pekan"),
    dari: one("dari"),
    sampai: one("sampai"),
  });
}

export interface ResolvedPeriod {
  start: string;
  end: string;
  /** End used for "recent" weighting and "this week": min(end, today). */
  asOf: string;
  label: string;
}

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

/** Turns a preset into concrete dates, clamped to the academic year. */
export function resolvePeriod(f: TkaFilters, year: { start: string; end: string; label: string }, today: string): ResolvedPeriod {
  let start = year.start;
  let end = year.end;
  let label = `TA ${year.label}`;
  const y1 = year.start.slice(0, 4);
  const y2 = year.end.slice(0, 4);

  switch (f.periode) {
    case "s1":
      [start, end, label] = [`${y1}-07-01`, `${y1}-12-31`, `Semester 1 TA ${year.label}`];
      break;
    case "s2":
      [start, end, label] = [`${y2}-01-01`, `${y2}-06-30`, `Semester 2 TA ${year.label}`];
      break;
    case "bulan": {
      const m = f.bulan ?? today.slice(0, 7);
      const first = parseISO(`${m}-01`);
      [start, end, label] = [fmt(first), fmt(endOfMonth(first)), format(first, "MMMM yyyy", { locale: idLocale })];
      break;
    }
    case "pekan": {
      const d = parseISO(f.pekan ?? today);
      const dow = d.getDay() === 0 ? 7 : d.getDay();
      const monday = addDays(d, 1 - dow);
      [start, end] = [fmt(monday), fmt(addDays(monday, 6))];
      label = `Pekan ${format(monday, "d MMM", { locale: idLocale })}–${format(addDays(monday, 6), "d MMM yyyy", { locale: idLocale })}`;
      break;
    }
    case "rentang":
      if (f.dari && f.sampai && f.dari <= f.sampai) {
        [start, end] = [f.dari, f.sampai];
        label = `${format(parseISO(start), "d MMM yyyy", { locale: idLocale })} – ${format(parseISO(end), "d MMM yyyy", { locale: idLocale })}`;
      }
      break;
  }
  // Clamp to the academic year so a period never mixes two cohorts.
  if (start < year.start) start = year.start;
  if (end > year.end) end = year.end;
  if (start > end) start = end;
  const asOf = end < today ? end : today < start ? start : today;
  return { start, end, asOf, label };
}

/** Builds a query string from filters, dropping defaults; `overrides` win. */
export function filtersToQuery(f: Partial<TkaFilters>, overrides: Partial<Record<keyof TkaFilters, string | null>> = {}): string {
  const merged: Record<string, string | undefined> = { ...f } as Record<string, string | undefined>;
  for (const [k, v] of Object.entries(overrides)) merged[k] = v ?? undefined;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (!v) continue;
    if (k === "mapel" && v === "MAT") continue;
    if (k === "periode" && v === "ta") continue;
    sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
