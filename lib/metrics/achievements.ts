/**
 * Achievement metrics (CLAUDE.md §8.2, DECISIONS.md Fase 0 & 4). Pure functions.
 *
 * - Poin Prestasi = level weight × rank weight (configurable). Unknown level
 *   and unknown rank have their own ("NONE") weights.
 * - Unique students: a matched participant counts by student id; an unmatched
 *   one by normalised written name within the same school. Achievements
 *   without any name count in totals but not in unique students.
 * - Individual vs team is inferred from the number of participants.
 */
import type { Category, Level, Rank } from "@/lib/achievements/labels";

export interface PointWeights {
  level: Record<Level | "NONE", number>;
  rank: Record<Rank | "NONE", number>;
}

export interface AchievementFact {
  id: string;
  schoolId: string;
  achievedOn: string;
  competitionName: string;
  category: Category | null;
  level: Level | null;
  rank: Rank | null;
  participants: { studentId: string | null; rawName: string }[];
}

export function achievementPoints(a: Pick<AchievementFact, "level" | "rank">, w: PointWeights): number {
  return (w.level[a.level ?? "NONE"] ?? 1) * (w.rank[a.rank ?? "NONE"] ?? 0);
}

export type ParticipantType = "individu" | "tim" | "tanpa_nama";

export function participantType(a: Pick<AchievementFact, "participants">): ParticipantType {
  return a.participants.length === 0 ? "tanpa_nama" : a.participants.length === 1 ? "individu" : "tim";
}

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Stable identity of a participant across achievements. */
export function participantKey(schoolId: string, p: { studentId: string | null; rawName: string }): string {
  return p.studentId ? `id:${p.studentId}` : `nama:${schoolId}:${norm(p.rawName)}`;
}

export function uniqueStudents(list: readonly AchievementFact[]): number {
  const keys = new Set<string>();
  for (const a of list) for (const p of a.participants) keys.add(participantKey(a.schoolId, p));
  return keys.size;
}

export function isAcademic(category: Category | null, academicGroup: readonly string[]): boolean | null {
  return category == null ? null : academicGroup.includes(category);
}

/** Same calendar dates one year earlier (for year-over-year comparison). */
export function previousYearRange(start: string, end: string): { start: string; end: string } {
  const shift = (iso: string) => {
    const y = Number(iso.slice(0, 4)) - 1;
    const md = iso.slice(5);
    // 29 Feb -> 28 Feb in a non-leap year.
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return `${y}-${md === "02-29" && !leap ? "02-28" : md}`;
  };
  return { start: shift(start), end: shift(end) };
}

/** Percent change (as a ratio) vs. the comparison value; null when there is nothing to compare. */
export function change(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

export interface Ranked {
  key: string;
  name: string;
  schoolId: string;
  studentId: string | null;
  count: number;
  points: number;
}

/** Students with the most achievements (ties: points, then name). */
export function topStudents(list: readonly AchievementFact[], w: PointWeights, limit = 10): Ranked[] {
  const map = new Map<string, Ranked>();
  for (const a of list) {
    const pts = achievementPoints(a, w);
    for (const p of a.participants) {
      const key = participantKey(a.schoolId, p);
      const r = map.get(key) ?? { key, name: p.rawName, schoolId: a.schoolId, studentId: p.studentId, count: 0, points: 0 };
      r.count += 1;
      r.points += pts;
      map.set(key, r);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.points - a.points || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Monday of the ISO week of a date. */
function monday(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return new Date(d.getTime() - (dow - 1) * 86_400_000).toISOString().slice(0, 10);
}

/** Counts per month ("YYYY-MM") or week (Monday), every bucket in range present, with running total. */
export function timeline(list: readonly AchievementFact[], start: string, end: string, by: "month" | "week") {
  const buckets: string[] = [];
  if (by === "month") {
    let y = Number(start.slice(0, 4));
    let m = Number(start.slice(5, 7));
    const endKey = end.slice(0, 7);
    for (;;) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      buckets.push(key);
      if (key >= endKey) break;
      m = m === 12 ? 1 : m + 1;
      if (m === 1) y++;
    }
  } else {
    for (let w = monday(start); w <= end; w = new Date(new Date(`${w}T00:00:00Z`).getTime() + 7 * 86_400_000).toISOString().slice(0, 10)) buckets.push(w);
  }
  const counts = new Map(buckets.map((b) => [b, 0]));
  for (const a of list) {
    const key = by === "month" ? a.achievedOn.slice(0, 7) : monday(a.achievedOn);
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
  }
  let running = 0;
  return buckets.map((b) => {
    running += counts.get(b)!;
    return { key: b, count: counts.get(b)!, cumulative: running };
  });
}
