/**
 * Cognitive levels used on blueprint items (CLAUDE.md §7.1, Kerangka Asesmen
 * TKA Pusmendik). The spec defines them for Mathematics only; Bahasa
 * Indonesia items keep cognitive_level empty.
 */
export const COGNITIVE_LEVELS: Record<"sd" | "smp", Record<string, string[]>> = {
  // SD Mathematics uses competency dimensions instead of the SMP 1–3 levels.
  sd: {
    MAT: [
      "Pengetahuan matematika",
      "Representasi matematis",
      "Penalaran",
      "Pemecahan masalah matematis",
      "Koneksi matematis",
    ],
    BIN: [],
  },
  smp: {
    MAT: ["Level 1 — Pengetahuan dan Pemahaman", "Level 2 — Aplikasi", "Level 3 — Penalaran"],
    BIN: [],
  },
};
