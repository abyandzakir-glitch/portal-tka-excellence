/** Canonical achievement taxonomy (CLAUDE.md §8.1) with Indonesian labels. */
export const CATEGORIES = ["AKADEMIK", "NON_AKADEMIK", "OLAHRAGA", "SENI_BUDAYA", "TEKNOLOGI", "LAINNYA"] as const;
export const LEVELS = ["KOTA_KABUPATEN", "PROVINSI", "NASIONAL", "INTERNASIONAL"] as const;
export const RANKS = ["JUARA_1", "JUARA_2", "JUARA_3", "MEDALI_EMAS", "MEDALI_PERAK", "MEDALI_PERUNGGU", "HARAPAN", "FINALIS"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Level = (typeof LEVELS)[number];
export type Rank = (typeof RANKS)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  AKADEMIK: "Akademik",
  NON_AKADEMIK: "Non-Akademik",
  OLAHRAGA: "Olahraga",
  SENI_BUDAYA: "Seni Budaya",
  TEKNOLOGI: "Teknologi",
  LAINNYA: "Lainnya",
};

export const LEVEL_LABEL: Record<Level, string> = {
  KOTA_KABUPATEN: "Kota/Kabupaten",
  PROVINSI: "Provinsi",
  NASIONAL: "Nasional",
  INTERNASIONAL: "Internasional",
};

export const RANK_LABEL: Record<Rank, string> = {
  JUARA_1: "Juara 1",
  JUARA_2: "Juara 2",
  JUARA_3: "Juara 3",
  MEDALI_EMAS: "Medali Emas",
  MEDALI_PERAK: "Medali Perak",
  MEDALI_PERUNGGU: "Medali Perunggu",
  HARAPAN: "Harapan",
  FINALIS: "Finalis",
};
