/**
 * TKA competency framework seed — Kerangka Asesmen TKA, Pusmendik
 * Kemendikdasmen (pusmendik.kemendikdasmen.go.id/tka), as transcribed in
 * CLAUDE.md §7.1. Editable later via master data; this is only the initial seed.
 */
export type Level = "sd" | "smp";

export interface ElementSeed {
  code: string;
  name: string;
  subs: string[];
}

export interface SubjectSeed {
  code: "MAT" | "BIN";
  name: string;
  level: Level;
  sortOrder: number;
  elements: ElementSeed[];
}

export const SUBJECTS: SubjectSeed[] = [
  {
    code: "MAT",
    name: "Matematika",
    level: "sd",
    sortOrder: 1,
    elements: [
      { code: "BIL", name: "Bilangan", subs: ["Bilangan Rasional"] },
      { code: "GEO", name: "Geometri dan Pengukuran", subs: ["Objek Geometri", "Pengukuran"] },
      { code: "DAT", name: "Data", subs: ["Penyajian dan Penggunaan Data"] },
    ],
  },
  {
    code: "BIN",
    name: "Bahasa Indonesia",
    level: "sd",
    sortOrder: 2,
    elements: [
      {
        code: "TEK",
        name: "Pemahaman Tekstual",
        subs: [
          "Mengidentifikasi kosakata umum/khusus",
          "Mengidentifikasi objek berdasarkan kosakata",
          "Menyusun kembali informasi dalam bentuk ikhtisar/bagan",
          "Mengidentifikasi informasi tersurat",
        ],
      },
      {
        code: "INF",
        name: "Pemahaman Inferensial",
        subs: [
          "Menyimpulkan ide pokok/gagasan pendukung/amanat/tokoh/peristiwa/nilai",
          "Menyimpulkan perubahan sederhana pada objek/karakter/latar",
          "Menjelaskan makna ungkapan",
        ],
      },
      {
        code: "EVA",
        name: "Evaluasi dan Apresiasi",
        subs: [
          "Menilai relevansi peristiwa dengan kehidupan sehari-hari",
          "Menilai kesesuaian antarunsur/antarinformasi",
          "Menyimpulkan respons emosional terhadap teks fiksi",
        ],
      },
    ],
  },
  {
    code: "MAT",
    name: "Matematika",
    level: "smp",
    sortOrder: 1,
    elements: [
      { code: "BIL", name: "Bilangan", subs: ["Bilangan Real"] },
      {
        code: "ALJ",
        name: "Aljabar",
        subs: ["Persamaan dan Pertidaksamaan Linier", "Bentuk Aljabar", "Fungsi", "Barisan dan Deret"],
      },
      {
        code: "GEO",
        name: "Geometri dan Pengukuran",
        subs: ["Objek Geometri", "Transformasi Geometri", "Pengukuran"],
      },
      { code: "DPL", name: "Data dan Peluang", subs: ["Data", "Peluang"] },
    ],
  },
  {
    code: "BIN",
    name: "Bahasa Indonesia",
    level: "smp",
    sortOrder: 2,
    elements: [
      {
        code: "TEK",
        name: "Pemahaman Tekstual",
        subs: [
          "Mengidentifikasi istilah berbagai bidang",
          "Mengidentifikasi objek/latar berdasarkan kosakata",
          "Mengidentifikasi informasi penting tersurat",
          "Menyusun kerangka/bagan dari bagian penting teks",
        ],
      },
      {
        code: "INF",
        name: "Pemahaman Inferensial",
        subs: [
          "Menyimpulkan ide pokok/gagasan pendukung/tokoh/peristiwa/latar/nilai dalam & antarteks",
          "Menjelaskan kelogisan hubungan antarperistiwa/antargagasan/antarinformasi",
          "Memprediksi peristiwa",
          "Menjelaskan bahasa kias & citraan",
        ],
      },
      {
        code: "EVA",
        name: "Evaluasi dan Apresiasi",
        subs: [
          "Menilai relevansi peristiwa dengan kehidupan sehari-hari",
          "Menilai kesesuaian/keakuratan unsur berdasarkan perbandingan antarteks",
          "Menyimpulkan respons emosional terhadap teks fiksi",
        ],
      },
    ],
  },
];

/** Competency code: "<SUBJECT>-<LEVEL>-<ELEMENT>[-<NN>]", e.g. "MAT-SMP-ALJ-02". */
export function elementCode(s: SubjectSeed, el: ElementSeed) {
  return `${s.code}-${s.level.toUpperCase()}-${el.code}`;
}
export function subCode(s: SubjectSeed, el: ElementSeed, index: number) {
  return `${elementCode(s, el)}-${String(index + 1).padStart(2, "0")}`;
}

/**
 * Cognitive levels used on blueprint items (CLAUDE.md §7.1). The spec defines
 * them for Mathematics only; Bahasa Indonesia items keep cognitive_level empty.
 */
export const COGNITIVE_LEVELS: Record<Level, Record<"MAT" | "BIN", string[]>> = {
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
