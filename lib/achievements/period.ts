/**
 * Period filter of the Achievements dashboard. Unlike TKA (academic year,
 * July–June), achievements are reported per calendar year, at the
 * foundation's request:
 *
 *   ?tahun=2026&periode=tahun          (default: the current year)
 *   ?tahun=2026&periode=bulan&bulan=2026-11
 *   ?periode=pekan&pekan=2026-11-19
 *   ?periode=rentang&dari=2026-01-01&sampai=2026-06-30
 *
 * Unknown values (e.g. old links with periode=ta/s1/s2) fall back to the
 * full year, so a shared link never breaks.
 */
import { addDays, endOfMonth, format, isValid, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export const ACHIEVEMENT_PERIODS = ["tahun", "bulan", "pekan", "rentang"] as const;
export type AchievementPeriodPreset = (typeof ACHIEVEMENT_PERIODS)[number];

export const ACHIEVEMENT_PERIOD_LABEL: Record<AchievementPeriodPreset, string> = {
  tahun: "Tahun penuh",
  bulan: "Bulan",
  pekan: "Pekan",
  rentang: "Rentang tanggal",
};

export interface AchievementPeriod {
  preset: AchievementPeriodPreset;
  /** Calendar year shown in the year selector (the start year for week/range). */
  year: number;
  /** "YYYY-MM" for preset "bulan", else null. */
  month: string | null;
  start: string;
  end: string;
  /** min(end, today), never before start: the trend charts stop here. */
  asOf: string;
  label: string;
}

type RawParams = Record<string, string | string[] | undefined>;

const fmt = (d: Date) => format(d, "yyyy-MM-dd");
const isIsoDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(parseISO(s));
const longDate = (iso: string) => format(parseISO(iso), "d MMM yyyy", { locale: idLocale });

export function resolveAchievementPeriod(raw: RawParams, today: string): AchievementPeriod {
  const one = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  const thisYear = Number(today.slice(0, 4));
  const tahun = one("tahun");
  const yearParam = tahun && /^\d{4}$/.test(tahun) && Number(tahun) >= 2000 && Number(tahun) <= thisYear + 1 ? Number(tahun) : null;
  const preset = (ACHIEVEMENT_PERIODS as readonly string[]).includes(one("periode") ?? "") ? (one("periode") as AchievementPeriodPreset) : "tahun";

  let year = yearParam ?? thisYear;
  let month: string | null = null;
  let start: string;
  let end: string;
  let label: string;

  switch (preset) {
    case "bulan": {
      const b = one("bulan");
      // An explicit month wins; otherwise this month (current year) or January (past year).
      month = b && /^\d{4}-(0[1-9]|1[0-2])$/.test(b) ? b : year === thisYear ? today.slice(0, 7) : `${year}-01`;
      year = Number(month.slice(0, 4));
      const first = parseISO(`${month}-01`);
      [start, end] = [fmt(first), fmt(endOfMonth(first))];
      label = format(first, "MMMM yyyy", { locale: idLocale });
      break;
    }
    case "pekan": {
      const p = one("pekan");
      const d = parseISO(isIsoDate(p) ? p : today);
      const dow = d.getDay() === 0 ? 7 : d.getDay();
      const monday = addDays(d, 1 - dow);
      [start, end] = [fmt(monday), fmt(addDays(monday, 6))];
      year = monday.getFullYear();
      label = `Pekan ${format(monday, "d MMM", { locale: idLocale })}–${longDate(end)}`;
      break;
    }
    case "rentang": {
      const [dari, sampai] = [one("dari"), one("sampai")];
      if (isIsoDate(dari) && isIsoDate(sampai) && dari <= sampai) {
        [start, end] = [dari, sampai];
        year = Number(dari.slice(0, 4));
        label = `${longDate(start)} – ${longDate(end)}`;
        break;
      }
      // Incomplete range: show the whole year until both dates are chosen
      // (the selector stays on "Rentang tanggal" so the date inputs remain visible).
      [start, end, label] = [`${year}-01-01`, `${year}-12-31`, `Tahun ${year}`];
      break;
    }
    default:
      [start, end, label] = [`${year}-01-01`, `${year}-12-31`, `Tahun ${year}`];
  }

  const asOf = end < today ? end : today < start ? start : today;
  return { preset, year, month, start, end, asOf, label };
}

/** Years offered in the selector: every year with achievements, the current year, and the chosen one; newest first. */
export function achievementYearOptions(dataYears: readonly number[], today: string, chosen: number): number[] {
  return [...new Set([...dataYears, Number(today.slice(0, 4)), chosen])].sort((a, b) => b - a);
}
