/**
 * Reads TKA settings from the `settings` table, falling back to the defaults
 * for anything missing or malformed (a bad value must never break a dashboard).
 */
import { z } from "zod";
import type { RlsTx } from "@/lib/db/rls";
import { settings, subjects } from "@/lib/db/schema";
import type { MasterySettings } from "@/lib/metrics/mastery";
import type { RiskRules } from "@/lib/metrics/risk";
import {
  DEFAULT_MASTERY_MIN_ITEMS,
  DEFAULT_MASTERY_THRESHOLDS,
  DEFAULT_MASTERY_WEIGHTS,
  DEFAULT_RISK_RULES,
  DEFAULT_TRYOUT_TARGETS,
  SETTING_KEYS,
} from "./defaults";

const ratio = z.number().min(0).max(1);
export const thresholdsSchema = z
  .object({ berkembang: ratio, cakap: ratio, mahir: ratio })
  .refine((t) => t.berkembang < t.cakap && t.cakap < t.mahir, "Ambang harus naik: Berkembang < Cakap < Mahir.");
export const weightsSchema = z.object({
  tryout: ratio,
  practice: ratio,
  recentWeeks: z.number().int().min(1).max(26),
  recentMultiplier: z.number().min(1).max(10),
});
export const minItemsSchema = z.number().int().min(1).max(100);
export const riskSchema = z.object({
  consecutiveBelowTarget: z.number().int().min(1).max(10),
  maxDropPoints: z.number().min(0).max(100),
});
export const targetSchema = z.number().min(0).max(100);

export interface TkaSettings {
  mastery: MasterySettings;
  risk: RiskRules;
  /** Target score for a subject, with an optional per-school override. */
  targetFor(subjectId: string, schoolId?: string | null): number;
}

function parse<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const r = schema.safeParse(value);
  return r.success ? r.data : fallback;
}

export async function loadTkaSettings(tx: RlsTx): Promise<TkaSettings> {
  const [rows, subjectRows] = await Promise.all([
    tx.select().from(settings),
    tx.select({ id: subjects.id, code: subjects.code }).from(subjects),
  ]);
  const global = (key: string) => rows.find((r) => r.key === key && !r.schoolId && !r.subjectId)?.valueJson;
  const codeById = new Map(subjectRows.map((s) => [s.id, s.code]));

  const targets = new Map<string, number>();
  for (const r of rows) {
    if (r.key !== SETTING_KEYS.tryoutTarget || !r.subjectId) continue;
    const v = targetSchema.safeParse(r.valueJson);
    if (v.success) targets.set(`${r.schoolId ?? "*"}|${r.subjectId}`, v.data);
  }

  return {
    mastery: {
      thresholds: parse(thresholdsSchema, global(SETTING_KEYS.masteryThresholds), DEFAULT_MASTERY_THRESHOLDS),
      weights: parse(weightsSchema, global(SETTING_KEYS.masteryWeights), DEFAULT_MASTERY_WEIGHTS),
      minItems: parse(minItemsSchema, global(SETTING_KEYS.masteryMinItems), DEFAULT_MASTERY_MIN_ITEMS),
    },
    risk: parse(riskSchema, global(SETTING_KEYS.riskRules), DEFAULT_RISK_RULES),
    targetFor(subjectId, schoolId) {
      return (
        (schoolId ? targets.get(`${schoolId}|${subjectId}`) : undefined) ??
        targets.get(`*|${subjectId}`) ??
        DEFAULT_TRYOUT_TARGETS[codeById.get(subjectId) as "MAT" | "BIN"] ??
        70
      );
    },
  };
}
