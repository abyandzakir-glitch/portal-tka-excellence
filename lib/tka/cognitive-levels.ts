/**
 * Cognitive levels used on blueprint items (CLAUDE.md §7.1, Kerangka Asesmen
 * TKA Pusmendik). The spec defines them for Mathematics only; Bahasa
 * Indonesia items keep cognitive_level empty (any text is stored as written).
 * Labels only: they are shown on the blueprint and do not enter any metric.
 */
const LEVELS_1_3 = ["Level 1 — Pengetahuan dan Pemahaman", "Level 2 — Aplikasi", "Level 3 — Penalaran"];

export const COGNITIVE_LEVELS: Record<"sd" | "smp", Record<string, string[]>> = {
  sd: {
    // SD Mathematics: the five competency dimensions from the framework, and the
    // 1–3 levels that schools' and publishers' SD try-out blueprints also use.
    MAT: [
      ...LEVELS_1_3,
      "Pengetahuan matematika",
      "Representasi matematis",
      "Penalaran",
      "Pemecahan masalah matematis",
      "Koneksi matematis",
    ],
    BIN: [],
  },
  smp: {
    MAT: LEVELS_1_3,
    BIN: [],
  },
};
