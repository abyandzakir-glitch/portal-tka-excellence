/**
 * Value normalisation for achievement imports (CLAUDE.md §8.1, §9.3 step 4;
 * DECISIONS.md Fase 4). Every function returns the canonical value (or null)
 * plus the original text to keep in Catatan when the source does not map
 * cleanly. Nothing ambiguous is forced into the nearest enum.
 */
import type { Category, Level, Rank } from "@/lib/achievements/labels";
import type { Cell } from "../sheet";
import { normalizeText } from "../text";
import { cellToString, parseDate } from "../values";

export interface Normalized<T> {
  value: T | null;
  /** Original text, to be written to Catatan, when the mapping is partial or missing. */
  note: string | null;
  /** True when the value could not be mapped and the row needs a human look. */
  flag: boolean;
}

const words = (s: string) => normalizeText(s).split(" ").filter(Boolean);
const has = (ws: string[], ...keys: string[]) => keys.some((k) => (k.includes(" ") ? ` ${ws.join(" ")} `.includes(` ${k} `) : ws.includes(k)));

// ---------------------------------------------------------------------------
// Level (tingkat)
// ---------------------------------------------------------------------------

const PROVINCES = [
  "aceh", "sumatera utara", "sumut", "sumatera barat", "sumbar", "riau", "kepulauan riau", "kepri", "jambi", "sumatera selatan",
  "sumsel", "bangka belitung", "babel", "bengkulu", "lampung", "dki jakarta", "jakarta", "jawa barat", "jabar", "banten", "jawa tengah",
  "jateng", "di yogyakarta", "diy", "yogyakarta", "jawa timur", "jatim", "bali", "nusa tenggara barat", "ntb", "nusa tenggara timur", "ntt",
  "kalimantan barat", "kalbar", "kalimantan tengah", "kalteng", "kalimantan selatan", "kalsel", "kalimantan timur", "kaltim",
  "kalimantan utara", "kaltara", "sulawesi utara", "sulut", "gorontalo", "sulawesi tengah", "sulteng", "sulawesi barat", "sulbar",
  "sulawesi selatan", "sulsel", "sulawesi tenggara", "sultra", "maluku", "maluku utara", "papua", "papua barat",
];

/**
 * "Nasional, Yogyakarta-Online" -> NASIONAL (+ location note); "Kota Bandung" ->
 * KOTA_KABUPATEN; "Jawa Barat" -> PROVINSI; "Kecamatan", "Bandung Raya" -> null + flag.
 */
export function normalizeLevel(value: Cell | undefined): Normalized<Level> {
  const raw = cellToString(value);
  if (!raw) return { value: null, note: null, flag: false };
  const ws = words(raw);
  const level: Level | null = has(ws, "internasional", "international", "intl", "internasonal", "dunia", "world", "asia", "asean", "global")
    ? "INTERNASIONAL"
    : has(ws, "nasional", "national", "indonesia", "se indonesia")
      ? "NASIONAL"
      : has(ws, "kecamatan", "kec", "wilayah", "raya", "gugus", "antar sekolah", "sekolah", "kelurahan", "desa")
        ? null
        : has(ws, "provinsi", "propinsi", "prov", "province", "provincial") || PROVINCES.some((p) => has(ws, p))
          ? "PROVINSI"
          : has(ws, "kota", "kabupaten", "kab", "city", "regency", "kotamadya", "kab kota", "kota kabupaten")
            ? "KOTA_KABUPATEN"
            : null;

  if (!level) return { value: null, note: `Tingkat asli: ${raw}`, flag: true };
  const canonical = new Set(["internasional", "international", "nasional", "national", "provinsi", "kota", "kabupaten", "kabupaten kota", "kota kabupaten", "kab kota"]);
  return { value: level, note: canonical.has(normalizeText(raw)) ? null : `Tingkat/lokasi: ${raw}`, flag: false };
}

// ---------------------------------------------------------------------------
// Rank (peringkat)
// ---------------------------------------------------------------------------

const NUM: Record<string, 1 | 2 | 3> = { "1": 1, "2": 2, "3": 3, i: 1, ii: 2, iii: 3, satu: 1, dua: 2, tiga: 3, "1st": 1, "2nd": 2, "3rd": 3, pertama: 1, kedua: 2, ketiga: 3 };
const CANONICAL_RANK_TEXT = new Set([
  "juara 1", "juara i", "juara 2", "juara ii", "juara 3", "juara iii", "medali emas", "medali perak", "medali perunggu", "emas", "perak",
  "perunggu", "gold", "silver", "bronze", "gold medal", "silver medal", "bronze medal", "harapan", "juara harapan", "finalis", "finalist",
  "1", "2", "3",
]);

/**
 * Picks a standard rank only when it is clearly present. Order matters:
 * "Juara Harapan 2" is HARAPAN (not Juara 2); "Juara 3 Kategori Bronze" is
 * JUARA_3 (bronze is the category name); "Gold Medal" is MEDALI_EMAS.
 */
export function normalizeRank(value: Cell | undefined): Normalized<Rank> {
  const raw = cellToString(value);
  if (!raw) return { value: null, note: null, flag: false };
  if (typeof value === "number" && NUM[String(value)]) return { value: `JUARA_${NUM[String(value)]}` as Rank, note: null, flag: false };
  const ws = words(raw);
  const note = CANONICAL_RANK_TEXT.has(normalizeText(raw)) ? null : `Hasil asli: ${raw}`;

  let rank: Rank | null = null;
  if (has(ws, "harapan")) rank = "HARAPAN";
  else {
    // Ordinals anywhere: "1st place", "2nd".
    const ordinal = ws.map((w) => (/^(1st|2nd|3rd)$/.test(w) ? NUM[w] : undefined)).find(Boolean);
    const j = ws.findIndex((w) => w === "juara" || w === "rank" || w === "peringkat");
    if (ordinal) rank = `JUARA_${ordinal}` as Rank;
    else if (j >= 0) {
      // "Juara 2", "Juara ke-2", "Juara II", "Juara Seri Dua", "Juara Champion 2" (number within 3 words).
      const n = ws.slice(j + 1, j + 4).map((w) => NUM[w]).find(Boolean);
      if (n) rank = `JUARA_${n}` as Rank;
    }
    if (!rank) {
      if (has(ws, "emas", "gold")) rank = "MEDALI_EMAS";
      else if (has(ws, "perak", "silver")) rank = "MEDALI_PERAK";
      else if (has(ws, "perunggu", "bronze", "bronce")) rank = "MEDALI_PERUNGGU";
      else if (has(ws, "finalis", "finalist") && !has(ws, "semifinal", "semifinalis")) rank = "FINALIS";
    }
  }
  // Participation-style awards never map to a medal even if they mention one ("Medali Partisipasi").
  if (has(ws, "partisipasi", "participation", "peserta", "honorable", "mention", "apresiasi", "appreciation")) rank = null;
  return { value: rank, note: rank && !note ? null : note ?? `Hasil asli: ${raw}`, flag: rank == null };
}

// ---------------------------------------------------------------------------
// Category (kategori)
// ---------------------------------------------------------------------------

const CATEGORY_COLUMN: Record<string, Category> = {
  akademik: "AKADEMIK", academic: "AKADEMIK",
  "non akademik": "NON_AKADEMIK", nonakademik: "NON_AKADEMIK", "non academic": "NON_AKADEMIK",
  olahraga: "OLAHRAGA", sport: "OLAHRAGA", sports: "OLAHRAGA",
  "seni budaya": "SENI_BUDAYA", seni: "SENI_BUDAYA", "seni dan budaya": "SENI_BUDAYA", art: "SENI_BUDAYA", arts: "SENI_BUDAYA",
  teknologi: "TEKNOLOGI", technology: "TEKNOLOGI", tik: "TEKNOLOGI",
  lainnya: "LAINNYA", lain: "LAINNYA", other: "LAINNYA", others: "LAINNYA",
};

/** Keyword dictionary, most specific first. */
const KEYWORDS: [Category, string[]][] = [
  ["TEKNOLOGI", ["robot", "robotik", "robotic", "robotics", "coding", "programming", "pemrograman", "informatika", "komputer", "computer", "iot", "game developer", "animasi digital", "desain grafis"]],
  ["OLAHRAGA", ["renang", "swimming", "swim", "sepak bola", "sepakbola", "football", "soccer", "futsal", "basket", "basketball", "bola basket", "voli", "volly", "volley", "bulu tangkis", "badminton", "tenis", "tennis", "taekwondo", "takwondo", "kyorugi", "kyourugi", "poomsae", "karate", "silat", "pencak silat", "judo", "wushu", "atletik", "athletic", "lari", "panahan", "memanah", "archery", "berkuda", "senam", "gymnastic", "catur", "chess", "o2sn", "tenis meja", "pingpong", "sprint", "lompat"]],
  ["SENI_BUDAYA", ["tari", "tarian", "menari", "dance", "menyanyi", "nyanyi", "vokal", "vocal", "solo", "paduan suara", "musik", "music", "musical", "piano", "biola", "gambar", "menggambar", "melukis", "lukis", "mewarnai", "drawing", "painting", "puisi", "baca puisi", "teater", "drama", "fls2n", "fls3n", "kaligrafi", "kriya", "fotografi", "film", "pantomim", "story telling", "storytelling", "mendongeng"]],
  ["NON_AKADEMIK", ["tahfidz", "tahfiz", "tahfizh", "hifdzil", "mhq", "mtq", "tilawah", "adzan", "azan", "praktik sholat", "sholat", "shalat", "dai", "dakwah", "pidato", "ceramah", "pramuka", "paskibra", "kepemimpinan", "leadership", "hafalan", "islami"]],
  ["AKADEMIK", ["olimpiade", "olympiad", "osn", "ksn", "kuark", "sains", "science", "ipa", "ips", "matematika", "math", "mathematics", "maths", "fisika", "kimia", "biologi", "ekonomi", "sejarah", "geografi", "bahasa inggris", "english", "spelling", "bahasa indonesia", "bahasa arab", "esai", "esay", "essay", "karya tulis", "kti", "debat", "debate", "cerdas cermat", "cerpen", "menulis", "speech", "pai", "literasi", "riset", "penelitian"]],
];

/**
 * Explicit "Kategori" column first; otherwise inferred from the field/type
 * ("Bidang", "Jenis Perlombaan") and the competition name.
 */
export function normalizeCategory(explicit: Cell | undefined, field: string, competition: string): Normalized<Category> {
  const raw = cellToString(explicit);
  if (raw) {
    const c = CATEGORY_COLUMN[normalizeText(raw)];
    return c ? { value: c, note: null, flag: false } : { value: null, note: `Kategori asli: ${raw}`, flag: true };
  }
  const ws = words(`${field} ${competition}`);
  for (const [cat, keys] of KEYWORDS) if (has(ws, ...keys)) return { value: cat, note: null, flag: false };
  return { value: null, note: null, flag: true };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTH: Record<string, number> = {
  jan: 1, januari: 1, january: 1, feb: 2, februari: 2, pebruari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4,
  mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, agu: 8, agt: 8, ags: 8, agus: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, nop: 11, november: 11, nopember: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

export interface AchievementDate {
  date: string | null;
  /** Set when the date was estimated; written to Catatan as "Tanggal perkiraan". */
  approximate: string | null;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Full dates and Excel serials parse exactly. Otherwise: "14-16 Agustus 2026"
 * -> 14 Aug (range start); "29 Agustus - 2 September 2026" -> 29 Aug;
 * "Maret-Juni 2026" -> 1 Mar; "Agustus" (no year) -> 1 Aug of the academic
 * year (Jul–Dec = first year, Jan–Jun = second year).
 */
export function normalizeAchievementDate(value: Cell | undefined, academicYear: { startYear: number }): AchievementDate {
  if (value == null || (typeof value === "string" && !value.trim())) return { date: null, approximate: null };
  const exact = parseDate(value);
  if (exact) return { date: exact, approximate: null };
  const raw = cellToString(value);
  const ws = words(raw);
  const yearInText = ws.map(Number).find((n) => n >= 1990 && n <= 2100);
  const firstMonthIdx = ws.findIndex((w) => MONTH[w] != null);
  if (firstMonthIdx < 0) return { date: null, approximate: null };
  const month = MONTH[ws[firstMonthIdx]!]!;
  const year = yearInText ?? (month >= 7 ? academicYear.startYear : academicYear.startYear + 1);
  // A day number right before the first month name ("14 16 agustus" -> first number).
  const dayCandidates = ws.slice(0, firstMonthIdx).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);
  const day = dayCandidates[0] ?? 1;
  const date = iso(year, month, day);
  const valid = !Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) && new Date(`${date}T00:00:00Z`).getUTCDate() === day;
  if (!valid) return { date: null, approximate: null };
  return { date, approximate: raw };
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

/** "Aisyah, Budi dan Citra" / "Aisyah & Budi" / one name per line -> list of names. */
export function splitParticipants(value: Cell | undefined): string[] {
  const raw = cellToString(value);
  if (!raw) return [];
  return raw
    .split(/\s*(?:,|;|\n|\s&\s|\sdan\s|\sand\s)\s*/i)
    .map((s) => s.replace(/^\d+[.)]\s*/, "").replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 2);
}

/** A template "example" row ("Contoh: Aisyah Putri") should never be imported. */
export function isExampleRow(values: Record<string, Cell>): boolean {
  return Object.values(values).some((v) => typeof v === "string" && /^\s*(contoh|example|misal)\s*[:.-]/i.test(v));
}
