import { describe, expect, it } from "vitest";
import { isExampleRow, normalizeAchievementDate, normalizeCategory, normalizeLevel, normalizeRank, splitParticipants } from "./normalize";

describe("normalizeLevel", () => {
  it.each([
    ["Nasional", "NASIONAL", null],
    ["Nasional, Yogyakarta-Online", "NASIONAL", "Tingkat/lokasi: Nasional, Yogyakarta-Online"],
    ["International", "INTERNASIONAL", null],
    ["Intl", "INTERNASIONAL", "Tingkat/lokasi: Intl"],
    ["Provinsi", "PROVINSI", null],
    ["Jawa Barat", "PROVINSI", "Tingkat/lokasi: Jawa Barat"],
    ["Kabupaten/Kota", "KOTA_KABUPATEN", null],
    ["Kab.", "KOTA_KABUPATEN", "Tingkat/lokasi: Kab."],
    ["Kota Bandung", "KOTA_KABUPATEN", "Tingkat/lokasi: Kota Bandung"],
  ])("%s -> %s", (input, level, note) => {
    expect(normalizeLevel(input)).toEqual({ value: level, note, flag: false });
  });

  it.each([["Kecamatan"], ["Bandung Raya"], ["Wilayah Bantim"]])("%s is not forced into an enum", (input) => {
    expect(normalizeLevel(input)).toEqual({ value: null, note: `Tingkat asli: ${input}`, flag: true });
  });

  it("empty is simply unknown (no flag)", () => expect(normalizeLevel(null)).toEqual({ value: null, note: null, flag: false }));
});

describe("normalizeRank", () => {
  it.each([
    ["Juara 1", "JUARA_1", null],
    ["Juara II", "JUARA_2", null],
    ["juara ke-3", "JUARA_3", "Hasil asli: juara ke-3"],
    [2, "JUARA_2", null],
    ["Juara 1 Kategori Champion", "JUARA_1", "Hasil asli: Juara 1 Kategori Champion"],
    ["Juara 2 Kyorugi Pracadet B PI U 22", "JUARA_2", "Hasil asli: Juara 2 Kyorugi Pracadet B PI U 22"],
    ["Juara 3 Kategori Bronze", "JUARA_3", "Hasil asli: Juara 3 Kategori Bronze"],
    ["Juara Champion 2", "JUARA_2", "Hasil asli: Juara Champion 2"],
    ["Juara Seri Satu", "JUARA_1", "Hasil asli: Juara Seri Satu"],
    ["Juara Prasetya Muda 2", "JUARA_2", "Hasil asli: Juara Prasetya Muda 2"],
    ["Gold Medal", "MEDALI_EMAS", null],
    ["Medali Perak", "MEDALI_PERAK", null],
    ["Bronze ", "MEDALI_PERUNGGU", null],
    ["Emas (6)", "MEDALI_EMAS", "Hasil asli: Emas (6)"],
    ["Juara Harapan 3", "HARAPAN", "Hasil asli: Juara Harapan 3"],
    ["Harapan 2", "HARAPAN", "Hasil asli: Harapan 2"],
    ["1st place", "JUARA_1", "Hasil asli: 1st place"],
    ["Finalis", "FINALIS", null],
  ])("%s -> %s", (input, rank, note) => {
    expect(normalizeRank(input)).toEqual({ value: rank, note, flag: false });
  });

  it.each([["Medali Partisipasi"], ["Piagam Peserta Aktif"], ["Medali Honorable Mention"], ["Terbaik"], ["Semifinal"], ["Juara Umum"], ["Certificate of Musical Appreciation"]])(
    "%s keeps the original text and leaves the rank empty",
    (input) => expect(normalizeRank(input)).toEqual({ value: null, note: `Hasil asli: ${input}`, flag: true }),
  );
});

describe("normalizeCategory", () => {
  it("prefers an explicit Kategori column", () => {
    expect(normalizeCategory("Non Akademik", "Olimpiade", "OSN")).toEqual({ value: "NON_AKADEMIK", note: null, flag: false });
    expect(normalizeCategory("Keagamaan", "", "")).toEqual({ value: null, note: "Kategori asli: Keagamaan", flag: true });
  });
  it.each([
    ["Swimming, 25 meter gaya bebas", "", "OLAHRAGA"],
    ["Sepak Bola", "", "OLAHRAGA"],
    ["Takwondo", "", "OLAHRAGA"],
    ["Lomba Tari", "", "SENI_BUDAYA"],
    ["Gambar Bercerita", "", "SENI_BUDAYA"],
    ["Bahasa Inggris", "OLIMPIADE SAINS SISWA NASIONAL (OSSN) 2026", "AKADEMIK"],
    ["Esay", "", "AKADEMIK"],
    ["Cerdas Cermat", "", "AKADEMIK"],
    ["Lomba Tahfidz", "", "NON_AKADEMIK"],
    ["Robotik", "Olimpiade Robotik", "TEKNOLOGI"],
  ])("%s / %s -> %s", (field, comp, cat) => expect(normalizeCategory(null, field, comp).value).toBe(cat));
  it("flags unknown categories", () => expect(normalizeCategory(null, "Lomba Mewarnai Payung", "").value).toBe("SENI_BUDAYA"));
  it("unknown -> flagged", () => expect(normalizeCategory(null, "Kejuaraan XYZ", "Festival Ceria")).toEqual({ value: null, note: null, flag: true }));
});

describe("normalizeAchievementDate", () => {
  const ay = { startYear: 2026 };
  it.each([
    ["28 Juni 2026", "2026-06-28", null],
    [46278, "2026-09-13", null], // Excel serial
    ["14-16 Agustus 2026", "2026-08-14", "14-16 Agustus 2026"],
    ["29 Agustus - 2 September 2026", "2026-08-29", "29 Agustus - 2 September 2026"],
    ["Maret-Juni 2026", "2026-03-01", "Maret-Juni 2026"],
    ["Mei 2026", "2026-05-01", "Mei 2026"],
    ["Agustus", "2026-08-01", "Agustus"], // Jul–Dec -> first year of TA 2026/2027
    ["Februari", "2027-02-01", "Februari"], // Jan–Jun -> second year
  ])("%s -> %s", (input, date, approx) => expect(normalizeAchievementDate(input, ay)).toEqual({ date, approximate: approx }));
  it("empty / nonsense -> null", () => {
    expect(normalizeAchievementDate(null, ay).date).toBeNull();
    expect(normalizeAchievementDate("segera", ay).date).toBeNull();
  });
});

describe("participants", () => {
  it("splits teams on commas, 'dan', '&' and new lines", () => {
    expect(splitParticipants("Aisyah Putri, Budi Santoso dan Citra")).toEqual(["Aisyah Putri", "Budi Santoso", "Citra"]);
    expect(splitParticipants("Dina & Eko")).toEqual(["Dina", "Eko"]);
    expect(splitParticipants("1. Fajar\n2. Gita")).toEqual(["Fajar", "Gita"]);
    expect(splitParticipants(null)).toEqual([]);
  });
  it("detects template example rows", () => {
    expect(isExampleRow({ participants: "Contoh: Aisyah Putri" })).toBe(true);
    expect(isExampleRow({ participants: "Aisyah Putri" })).toBe(false);
  });
});
