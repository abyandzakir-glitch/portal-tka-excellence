/**
 * Weekly input completeness (CLAUDE.md §9.1, rules in docs/METRICS.md).
 *
 * Expected students = active students in the TKA grade (6 for SD, 9 for SMP)
 * of the school in the active academic year.
 *
 * - Latihan pekanan: Lengkap when every expected student has at least one
 *   practice log for the week; Sebagian when some do; Belum when none.
 * - Hasil TO (for each try-out held this week or last week): Lengkap when every
 *   expected student has a score row (present or absent) and present scores
 *   carry per-item answers; Sebagian when some scores exist, or only totals
 *   were uploaded; Belum when nothing was uploaded. No try-out due → not counted.
 * - Prestasi is event-driven (a quiet week is normal), so it is shown for
 *   information only and does not affect the school's overall status.
 */

export type InputStatus = "belum" | "sebagian" | "lengkap";

export const INPUT_STATUS_LABEL: Record<InputStatus, string> = {
  belum: "Belum",
  sebagian: "Sebagian",
  lengkap: "Lengkap",
};

export function practiceStatus(studentsWithLogs: number, expected: number): InputStatus {
  if (studentsWithLogs <= 0) return "belum";
  if (expected > 0 && studentsWithLogs >= expected) return "lengkap";
  return "sebagian";
}

export interface TryoutUpload {
  /** Score rows (present + absent) uploaded for this school. */
  scored: number;
  /** Present score rows without per-item answers (totals only). */
  totalsOnly: number;
}

export function tryoutStatus(u: TryoutUpload, expected: number): InputStatus {
  if (u.scored <= 0) return "belum";
  if (u.scored >= expected && u.totalsOnly === 0) return "lengkap";
  return "sebagian";
}

/** Overall status of the counted items; null when nothing was due. */
export function overallStatus(items: readonly InputStatus[]): InputStatus | null {
  if (items.length === 0) return null;
  if (items.every((s) => s === "lengkap")) return "lengkap";
  if (items.every((s) => s === "belum")) return "belum";
  return "sebagian";
}

/** Try-outs whose results are due in the week starting `weekStart`: held that week or the week before. */
export function tryoutDueWindow(weekStart: string): { from: string; to: string } {
  const d = new Date(`${weekStart}T00:00:00Z`);
  const from = new Date(d);
  from.setUTCDate(d.getUTCDate() - 7);
  const to = new Date(d);
  to.setUTCDate(d.getUTCDate() + 6);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export function addWeeks(weekStart: string, n: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
}
