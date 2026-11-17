/**
 * Achievements dashboard data (CLAUDE.md §8.2). One RLS query fetches the
 * period (and the same period last year); every number is computed with the
 * pure functions in lib/metrics/achievements.ts.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { RlsTx } from "@/lib/db/rls";
import { settings } from "@/lib/db/schema";
import {
  achievementPoints,
  change,
  isAcademic,
  participantType,
  previousYearRange,
  timeline,
  topStudents,
  uniqueStudents,
  type AchievementFact,
  type ParticipantType,
  type PointWeights,
} from "@/lib/metrics/achievements";
import { DEFAULT_ACADEMIC_GROUP, DEFAULT_ACHIEVEMENT_POINTS, SETTING_KEYS } from "@/lib/settings/defaults";
import type { TkaContext } from "@/lib/tka/load";
import { CATEGORIES, LEVELS, RANKS, type Category, type Level, type Rank } from "./labels";

// ---------------------------------------------------------------------------
// Filters (in the URL, next to the shared ta/periode/sekolah filters)
// ---------------------------------------------------------------------------

const dim = <T extends readonly string[]>(values: T) => z.enum(values).optional().catch(undefined);
const filterSchema = z.object({
  tingkat: dim([...LEVELS, "KOSONG"] as const),
  kategori: dim([...CATEGORIES, "KOSONG"] as const),
  peringkat: dim([...RANKS, "KOSONG"] as const),
  peserta: dim(["individu", "tim", "tanpa_nama"] as const),
});
export type AchievementFilters = z.infer<typeof filterSchema>;

export function parseAchievementFilters(raw: Record<string, string | string[] | undefined>): AchievementFilters {
  const one = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  return filterSchema.parse({ tingkat: one("tingkat"), kategori: one("kategori"), peringkat: one("peringkat"), peserta: one("peserta") });
}

function matches(a: AchievementFact, f: AchievementFilters, schoolId: string | null): boolean {
  if (schoolId && a.schoolId !== schoolId) return false;
  if (f.tingkat && (a.level ?? "KOSONG") !== f.tingkat) return false;
  if (f.kategori && (a.category ?? "KOSONG") !== f.kategori) return false;
  if (f.peringkat && (a.rank ?? "KOSONG") !== f.peringkat) return false;
  if (f.peserta && participantType(a) !== f.peserta) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const weightsSchema = z.object({
  level: z.record(z.string(), z.number().min(0).max(100)),
  rank: z.record(z.string(), z.number().min(0).max(100)),
});

export async function loadAchievementSettings(tx: RlsTx): Promise<{ weights: PointWeights; academicGroup: string[] }> {
  const rows = await tx.select().from(settings);
  const get = (key: string) => rows.find((r) => r.key === key && !r.schoolId && !r.subjectId)?.valueJson;
  const w = weightsSchema.safeParse(get(SETTING_KEYS.achievementPoints));
  const g = z.array(z.enum(CATEGORIES)).safeParse(get(SETTING_KEYS.achievementAcademicGroup));
  return {
    weights: w.success ? ({ level: { ...DEFAULT_ACHIEVEMENT_POINTS.level, ...w.data.level }, rank: { ...DEFAULT_ACHIEVEMENT_POINTS.rank, ...w.data.rank } } as PointWeights) : DEFAULT_ACHIEVEMENT_POINTS,
    academicGroup: g.success ? g.data : DEFAULT_ACADEMIC_GROUP,
  };
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

export interface AchievementRecord extends AchievementFact {
  organizer: string | null;
  evidenceUrl: string | null;
  notes: string | null;
  createdAt: string;
}

export async function loadFacts(tx: RlsTx, start: string, end: string): Promise<AchievementRecord[]> {
  const rows = await tx.execute<{
    id: string;
    school_id: string;
    achieved_on: string;
    competition_name: string;
    organizer: string | null;
    category: Category | null;
    level: Level | null;
    rank: Rank | null;
    evidence_url: string | null;
    notes: string | null;
    created_at: string;
    participants: { studentId: string | null; rawName: string }[] | null;
  }>(sql`
    select a.id, a.school_id, a.achieved_on::text, a.competition_name, a.organizer, a.category, a.level, a.rank,
           a.evidence_url, a.notes, a.created_at::text,
           (select json_agg(json_build_object('studentId', p.student_id, 'rawName', p.raw_name) order by p.raw_name)
              from public.achievement_participants p where p.achievement_id = a.id) as participants
      from public.achievements a
     where a.achieved_on between ${start} and ${end}
     order by a.achieved_on desc, a.created_at desc`);
  return rows.map((r) => ({
    id: r.id,
    schoolId: r.school_id,
    achievedOn: r.achieved_on,
    competitionName: r.competition_name,
    organizer: r.organizer,
    category: r.category,
    level: r.level,
    rank: r.rank,
    evidenceUrl: r.evidence_url,
    notes: r.notes,
    createdAt: r.created_at,
    participants: r.participants ?? [],
  }));
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export interface AchievementView {
  period: { start: string; end: string; label: string };
  previous: { start: string; end: string };
  kpis: {
    total: number;
    previousTotal: number;
    totalChange: number | null;
    students: number;
    previousStudents: number;
    nationalPlus: number;
    previousNationalPlus: number;
    points: number;
  };
  schools: { id: string; code: string; name: string }[];
  /** school id -> level (or "KOSONG") -> count */
  bySchoolLevel: Record<string, Record<Level | "KOSONG", number>>;
  academic: { academic: number; nonAcademic: number; unknown: number };
  byCategory: Record<Category | "KOSONG", number>;
  byParticipant: Record<ParticipantType, number>;
  monthly: { key: string; count: number; cumulative: number }[];
  weekly: { key: string; count: number; cumulative: number }[];
  pointsBySchool: { schoolId: string; points: number; count: number }[];
  latest: (AchievementRecord & { points: number })[];
  top: ReturnType<typeof topStudents>;
  records: (AchievementRecord & { points: number })[];
}

export async function loadAchievementView(tx: RlsTx, ctx: TkaContext, f: AchievementFilters, schoolId: string | null): Promise<AchievementView> {
  const { start, end } = ctx.period;
  const prev = previousYearRange(start, end);
  const [{ weights, academicGroup }, current, previous] = await Promise.all([
    loadAchievementSettings(tx),
    loadFacts(tx, start, end),
    loadFacts(tx, prev.start, prev.end),
  ]);
  const list = current.filter((a) => matches(a, f, schoolId));
  const prevList = previous.filter((a) => matches(a, f, schoolId));
  const schools = (schoolId ? ctx.schools.filter((s) => s.id === schoolId) : ctx.schools).map((s) => ({ id: s.id, code: s.code, name: s.name }));

  const natPlus = (l: readonly AchievementFact[]) => l.filter((a) => a.level === "NASIONAL" || a.level === "INTERNASIONAL").length;
  const emptyLevels = () => Object.fromEntries([...LEVELS, "KOSONG"].map((l) => [l, 0])) as Record<Level | "KOSONG", number>;
  const bySchoolLevel = Object.fromEntries(schools.map((s) => [s.id, emptyLevels()]));
  const byCategory = Object.fromEntries([...CATEGORIES, "KOSONG"].map((c) => [c, 0])) as Record<Category | "KOSONG", number>;
  const byParticipant: Record<ParticipantType, number> = { individu: 0, tim: 0, tanpa_nama: 0 };
  const academic = { academic: 0, nonAcademic: 0, unknown: 0 };
  const points = new Map<string, { points: number; count: number }>();
  const withPoints = list.map((a) => ({ ...a, points: achievementPoints(a, weights) }));

  for (const a of withPoints) {
    if (bySchoolLevel[a.schoolId]) bySchoolLevel[a.schoolId]![a.level ?? "KOSONG"]++;
    byCategory[a.category ?? "KOSONG"]++;
    byParticipant[participantType(a)]++;
    const ac = isAcademic(a.category, academicGroup);
    if (ac == null) academic.unknown++;
    else if (ac) academic.academic++;
    else academic.nonAcademic++;
    const p = points.get(a.schoolId) ?? { points: 0, count: 0 };
    p.points += a.points;
    p.count += 1;
    points.set(a.schoolId, p);
  }

  return {
    period: { start, end, label: ctx.period.label },
    previous: prev,
    kpis: {
      total: list.length,
      previousTotal: prevList.length,
      totalChange: change(list.length, prevList.length),
      students: uniqueStudents(list),
      previousStudents: uniqueStudents(prevList),
      nationalPlus: natPlus(list),
      previousNationalPlus: natPlus(prevList),
      points: withPoints.reduce((s, a) => s + a.points, 0),
    },
    schools,
    bySchoolLevel,
    academic,
    byCategory,
    byParticipant,
    monthly: timeline(list, start, end < ctx.period.asOf ? end : ctx.period.asOf, "month"),
    weekly: timeline(list, start, end < ctx.period.asOf ? end : ctx.period.asOf, "week"),
    pointsBySchool: schools
      .map((s) => ({ schoolId: s.id, ...(points.get(s.id) ?? { points: 0, count: 0 }) }))
      .sort((a, b) => b.points - a.points),
    latest: [...withPoints].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.achievedOn.localeCompare(a.achievedOn)).slice(0, 10),
    top: topStudents(list, weights),
    records: withPoints,
  };
}
