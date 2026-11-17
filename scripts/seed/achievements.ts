/**
 * Dummy achievements following the foundation's standard taxonomy (§8.1).
 * Includes edge cases the importer must handle:
 *   - results without an exact rank ("Medali Partisipasi") -> rank null + notes
 *   - unknown level -> level null
 *   - team entries (2–4 names) and an alumni name not in the student master
 *   - last year's same period, for year-over-year comparison (§8.2)
 */
import type { Faker } from "@faker-js/faker";
import type { SchoolCode } from "../../lib/brand/schools";

type Category = "AKADEMIK" | "NON_AKADEMIK" | "OLAHRAGA" | "SENI_BUDAYA" | "TEKNOLOGI" | "LAINNYA";
type AchLevel = "KOTA_KABUPATEN" | "PROVINSI" | "NASIONAL" | "INTERNASIONAL";
type Rank = "JUARA_1" | "JUARA_2" | "JUARA_3" | "MEDALI_EMAS" | "MEDALI_PERAK" | "MEDALI_PERUNGGU" | "HARAPAN" | "FINALIS";

export interface SeedAchievement {
  schoolCode: SchoolCode;
  achievedOn: string;
  competitionName: string;
  organizer: string;
  category: Category | null;
  level: AchLevel | null;
  rank: Rank | null;
  evidenceUrl: string | null;
  notes: string | null;
  participants: { studentId: string | null; name: string }[];
}

const COMPETITIONS: Record<Category, { name: string; organizer: string; team?: boolean; medal?: boolean }[]> = {
  AKADEMIK: [
    { name: "Olimpiade Matematika Pelajar", organizer: "Dinas Pendidikan Kota", medal: true },
    { name: "Olimpiade Sains Pelajar Tingkat Kota", organizer: "Dinas Pendidikan Kota", medal: true },
    { name: "Lomba Cerdas Cermat Islami", organizer: "Kementerian Agama Kota", team: true },
    { name: "Kompetisi Bahasa Inggris Pelajar", organizer: "Lembaga Bahasa Nusantara" },
    { name: "Olimpiade Matematika Internasional Pelajar", organizer: "Panitia Olimpiade Asia", medal: true },
    { name: "Lomba Menulis Cerpen Pelajar", organizer: "Balai Bahasa Provinsi" },
  ],
  NON_AKADEMIK: [
    { name: "Lomba Pidato Bahasa Arab", organizer: "Forum Pendidikan Islam" },
    { name: "Musabaqah Tilawatil Qur'an Pelajar", organizer: "LPTQ Kota" },
    { name: "Lomba Hafalan Al-Qur'an Juz 30", organizer: "Kementerian Agama Kota" },
    { name: "Lomba Kepemimpinan Siswa", organizer: "Forum OSIS Provinsi", team: true },
  ],
  OLAHRAGA: [
    { name: "Kejuaraan Pencak Silat Pelajar", organizer: "IPSI Kota", medal: true },
    { name: "Turnamen Futsal Pelajar", organizer: "Asosiasi Futsal Kota", team: true },
    { name: "Kejuaraan Renang Pelajar", organizer: "Pengurus Akuatik Provinsi", medal: true },
    { name: "Kejuaraan Panahan Pelajar", organizer: "Perpani Kota", medal: true },
  ],
  SENI_BUDAYA: [
    { name: "Festival Tari Daerah Pelajar", organizer: "Dinas Kebudayaan Provinsi", team: true },
    { name: "Lomba Kaligrafi Islam", organizer: "Lembaga Kaligrafi Al-Qur'an" },
    { name: "Lomba Nasyid Pelajar", organizer: "Forum Seni Islami", team: true },
    { name: "Lomba Melukis Pelajar", organizer: "Galeri Seni Kota" },
  ],
  TEKNOLOGI: [
    { name: "Kompetisi Robotik Pelajar", organizer: "Komunitas Robotik Indonesia", team: true },
    { name: "Lomba Coding Anak", organizer: "Asosiasi Edukasi Teknologi" },
    { name: "Kompetisi Inovasi Sains Remaja", organizer: "Badan Riset Daerah", team: true },
  ],
  LAINNYA: [
    { name: "Lomba Duta Lingkungan Pelajar", organizer: "Dinas Lingkungan Hidup Kota" },
    { name: "Lomba Literasi Keuangan Anak", organizer: "Komunitas Literasi Keuangan" },
  ],
};

const CATEGORY_WEIGHTS: [Category, number][] = [
  ["AKADEMIK", 0.34],
  ["NON_AKADEMIK", 0.2],
  ["OLAHRAGA", 0.18],
  ["SENI_BUDAYA", 0.13],
  ["TEKNOLOGI", 0.1],
  ["LAINNYA", 0.05],
];
const LEVEL_WEIGHTS: [AchLevel, number][] = [
  ["KOTA_KABUPATEN", 0.45],
  ["PROVINSI", 0.3],
  ["NASIONAL", 0.18],
  ["INTERNASIONAL", 0.07],
];
const PLACE_RANKS: Rank[] = ["JUARA_1", "JUARA_2", "JUARA_3", "HARAPAN", "FINALIS"];
const MEDAL_RANKS: Rank[] = ["MEDALI_EMAS", "MEDALI_PERAK", "MEDALI_PERUNGGU"];
const NO_MATCH_RESULTS = ["Medali Partisipasi", "Piagam Peserta Aktif", "Penghargaan Peserta Terbaik"];
/** Fictional former students, deliberately absent from the student master. */
const ALUMNI_NAMES = ["Alya Rahmadani (alumni)", "Fikri Maulana (alumni)", "Nadia Putri Zahra (alumni)"];

const SCHOOL_WEIGHTS: [SchoolCode, number][] = [
  ["SDTJBDG", 0.26],
  ["SDTJCMH", 0.17],
  ["SDTJPKU", 0.17],
  ["SMPTJBDG", 0.24],
  ["SMPTJPKU", 0.16],
];

export function buildAchievements(ctx: {
  faker: Faker;
  rand: () => number;
  pick: <T>(arr: readonly T[]) => T;
  studentsBySchool: Map<SchoolCode, { id: string; name: string; className: string }[]>;
}): SeedAchievement[] {
  const { faker, rand, pick, studentsBySchool } = ctx;
  const weighted = <T>(pairs: [T, number][]): T => {
    let r = rand();
    for (const [v, w] of pairs) {
      if ((r -= w) <= 0) return v;
    }
    return pairs[pairs.length - 1]![0];
  };

  const periods = [
    { count: 55, from: "2026-07-14", to: "2026-11-15" }, // current academic year so far
    { count: 25, from: "2025-07-14", to: "2025-11-15" }, // same period last year
  ];

  const out: SeedAchievement[] = [];
  let alumniUsed = 0;
  for (const period of periods) {
    for (let i = 0; i < period.count; i++) {
      const schoolCode = weighted(SCHOOL_WEIGHTS);
      const category = weighted(CATEGORY_WEIGHTS);
      const comp = pick(COMPETITIONS[category]);
      let level: AchLevel | null = comp.name.includes("Internasional") ? "INTERNASIONAL" : weighted(LEVEL_WEIGHTS);
      if (rand() < 0.03) level = null; // level genuinely unknown

      const pool = studentsBySchool.get(schoolCode)!;
      const teamSize = comp.team ? faker.number.int({ min: 2, max: 4 }) : 1;
      const members = faker.helpers.arrayElements(pool, teamSize);
      const participants: { studentId: string | null; name: string }[] = members.map((m) => ({ studentId: m.id, name: m.name }));
      if (period.count === 25 && alumniUsed < ALUMNI_NAMES.length && rand() < 0.25) {
        participants[0] = { studentId: null, name: ALUMNI_NAMES[alumniUsed++]! };
      }

      const notes: string[] = [];
      let rank: Rank | null;
      if (rand() < 0.08) {
        rank = null;
        notes.push(pick(NO_MATCH_RESULTS));
      } else {
        rank = comp.medal && rand() < 0.6 ? pick(MEDAL_RANKS) : pick(PLACE_RANKS);
      }
      if (participants.length === 1 && participants[0]!.studentId) notes.push(`Kelas: ${members[0]!.className}`);

      const achievedOn = faker.date.between({ from: `${period.from}T00:00:00+07:00`, to: `${period.to}T23:59:59+07:00` });
      const iso = new Date(achievedOn.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

      out.push({
        schoolCode,
        achievedOn: iso,
        competitionName: `${comp.name} ${iso.slice(0, 4)}`,
        organizer: comp.organizer,
        category,
        level,
        rank,
        evidenceUrl: rand() < 0.6 ? `https://contoh.talentajuara.test/bukti/${faker.string.alphanumeric(10).toLowerCase()}` : null,
        notes: notes.length ? notes.join("; ") : null,
        participants,
      });
    }
  }
  return out.sort((a, b) => a.achievedOn.localeCompare(b.achievedOn));
}
