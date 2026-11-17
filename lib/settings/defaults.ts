/**
 * Default values for configurable settings (CLAUDE.md §7.3, §8.2, DECISIONS.md).
 * Stored in the `settings` table by the seed and editable in Pengaturan; the
 * metric functions read them from the database, never from this file directly.
 */

export const SETTING_KEYS = {
  masteryThresholds: "mastery.thresholds",
  masteryWeights: "mastery.weights",
  masteryMinItems: "mastery.min_items",
  tryoutTarget: "tryout.target", // scoped per subject (and optionally per school)
  riskRules: "risk.rules",
  achievementPoints: "achievement.points",
  achievementAcademicGroup: "achievement.academic_group",
  aiExtraction: "ai.extraction_enabled",
} as const;

/** Lower bounds (inclusive) as ratios: <0.5 Perlu Intervensi, <0.7 Berkembang, <0.85 Cakap, else Mahir. */
export const DEFAULT_MASTERY_THRESHOLDS = { berkembang: 0.5, cakap: 0.7, mahir: 0.85 };

export const DEFAULT_MASTERY_WEIGHTS = {
  tryout: 0.7,
  practice: 0.3,
  /** Data within the last `recentWeeks` weeks counts `recentMultiplier` times. */
  recentWeeks: 4,
  recentMultiplier: 2,
};

export const DEFAULT_MASTERY_MIN_ITEMS = 5;

/** Per-subject TO targets (0–100), same for all five schools by default. */
export const DEFAULT_TRYOUT_TARGETS: Record<"MAT" | "BIN", number> = { MAT: 70, BIN: 85 };

export const DEFAULT_RISK_RULES = {
  consecutiveBelowTarget: 2,
  maxDropPoints: 10,
};

export const DEFAULT_ACHIEVEMENT_POINTS = {
  level: { KOTA_KABUPATEN: 1, PROVINSI: 2, NASIONAL: 4, INTERNASIONAL: 6, NONE: 1 },
  rank: {
    JUARA_1: 5,
    MEDALI_EMAS: 5,
    JUARA_2: 4,
    MEDALI_PERAK: 4,
    JUARA_3: 3,
    MEDALI_PERUNGGU: 3,
    HARAPAN: 2,
    FINALIS: 1,
    NONE: 0.5,
  },
};

/** Categories counted as "Akademik" in the Akademik vs Non-Akademik donut. */
export const DEFAULT_ACADEMIC_GROUP = ["AKADEMIK", "TEKNOLOGI"];

export const DEFAULT_AI_EXTRACTION_ENABLED = false;
