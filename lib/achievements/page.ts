import "server-only";
import { requireUser } from "@/lib/auth/session";
import { todayIso } from "@/lib/format/id";
import { withTka } from "@/lib/tka/page";
import { listAchievementYears, loadAchievementView, parseAchievementFilters } from "./load";
import { achievementYearOptions, resolveAchievementPeriod } from "./period";

type Params = Record<string, string | string[] | undefined>;

/**
 * Common entry for the Prestasi dashboard, list and export: session, school
 * scope, calendar-year period and the view, in one RLS transaction. The TKA
 * context is used only for the school list (its academic-year period is not).
 */
export async function loadAchievementPage(raw: Params) {
  const user = await requireUser();
  const f = parseAchievementFilters(raw);
  const today = todayIso();
  const period = resolveAchievementPeriod(raw, today);
  const r = await withTka(raw, async (tx, c) => {
    const code = user.schoolCode ?? c.filters.sekolah ?? null;
    const school = code ? (c.schools.find((s) => s.code === code) ?? null) : null;
    const [view, dataYears] = await Promise.all([
      loadAchievementView(tx, { period, schools: c.schools }, f, school?.id ?? null),
      listAchievementYears(tx),
    ]);
    return { school, view, years: achievementYearOptions(dataYears, today, period.year) };
  });
  return { f, period, ...r };
}
