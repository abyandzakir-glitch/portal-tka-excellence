import { describe, expect, it } from "vitest";
import { DEFAULT_ACADEMIC_GROUP, DEFAULT_ACHIEVEMENT_POINTS } from "@/lib/settings/defaults";
import {
  achievementPoints,
  change,
  isAcademic,
  participantType,
  previousYearRange,
  timeline,
  topStudents,
  uniqueStudents,
  type AchievementFact,
} from "./achievements";

const W = DEFAULT_ACHIEVEMENT_POINTS;
const a = (p: Partial<AchievementFact>): AchievementFact => ({
  id: Math.random().toString(36),
  schoolId: "s1",
  achievedOn: "2026-10-10",
  competitionName: "Lomba",
  category: "AKADEMIK",
  level: "KOTA_KABUPATEN",
  rank: "JUARA_1",
  participants: [{ studentId: "st1", rawName: "Alya" }],
  ...p,
});

describe("Poin Prestasi = bobot tingkat × bobot peringkat", () => {
  it.each([
    ["KOTA_KABUPATEN", "JUARA_1", 5],
    ["NASIONAL", "JUARA_1", 20],
    ["INTERNASIONAL", "MEDALI_EMAS", 30],
    ["PROVINSI", "HARAPAN", 4],
    [null, "JUARA_2", 4], // unknown level weighs 1
    ["NASIONAL", null, 2], // unknown rank weighs 0.5
  ] as const)("%s × %s = %s", (level, rank, pts) => expect(achievementPoints({ level, rank }, W)).toBe(pts));
});

describe("peserta", () => {
  it("individu/tim/tanpa nama dari jumlah peserta", () => {
    expect(participantType(a({}))).toBe("individu");
    expect(participantType(a({ participants: [{ studentId: null, rawName: "A" }, { studentId: null, rawName: "B" }] }))).toBe("tim");
    expect(participantType(a({ participants: [] }))).toBe("tanpa_nama");
  });

  it("siswa unik: id bila cocok, nama tertulis per sekolah bila tidak; tanpa nama tidak dihitung", () => {
    const list = [
      a({ participants: [{ studentId: "st1", rawName: "Alya Rahmawati" }] }),
      a({ participants: [{ studentId: "st1", rawName: "Alya" }] }), // same student, different spelling
      a({ participants: [{ studentId: null, rawName: "Gilang" }, { studentId: null, rawName: "gilang " }] }), // same written name
      a({ schoolId: "s2", participants: [{ studentId: null, rawName: "Gilang" }] }), // another school's Gilang
      a({ participants: [] }),
    ];
    expect(uniqueStudents(list)).toBe(3);
  });
});

describe("akademik vs non-akademik", () => {
  it("memakai pengelompokan dari Pengaturan (bawaan: Akademik + Teknologi)", () => {
    expect(isAcademic("TEKNOLOGI", DEFAULT_ACADEMIC_GROUP)).toBe(true);
    expect(isAcademic("OLAHRAGA", DEFAULT_ACADEMIC_GROUP)).toBe(false);
    expect(isAcademic(null, DEFAULT_ACADEMIC_GROUP)).toBeNull();
  });
});

describe("perbandingan tahun lalu", () => {
  it("menggeser rentang tepat satu tahun", () => {
    expect(previousYearRange("2026-07-01", "2027-06-30")).toEqual({ start: "2025-07-01", end: "2026-06-30" });
    expect(previousYearRange("2028-02-29", "2028-03-31")).toEqual({ start: "2027-02-28", end: "2027-03-31" });
  });
  it("perubahan relatif", () => {
    expect(change(15, 10)).toBe(0.5);
    expect(change(5, 0)).toBeNull();
  });
});

describe("tren & siswa terbanyak", () => {
  const list = [
    a({ achievedOn: "2026-08-03" }),
    a({ achievedOn: "2026-08-20", participants: [{ studentId: "st2", rawName: "Bima" }] }),
    a({ achievedOn: "2026-10-05", level: "NASIONAL" }),
  ];
  it("bulanan: semua bulan muncul (termasuk yang kosong) dengan kumulatif", () => {
    expect(timeline(list, "2026-07-01", "2026-10-31", "month")).toEqual([
      { key: "2026-07", count: 0, cumulative: 0 },
      { key: "2026-08", count: 2, cumulative: 2 },
      { key: "2026-09", count: 0, cumulative: 2 },
      { key: "2026-10", count: 1, cumulative: 3 },
    ]);
  });
  it("pekanan memakai hari Senin", () => {
    const t = timeline(list, "2026-08-01", "2026-08-31", "week");
    expect(t[0]).toEqual({ key: "2026-07-27", count: 0, cumulative: 0 });
    expect(t.find((x) => x.key === "2026-08-03")!.count).toBe(1);
  });
  it("siswa terbanyak: jumlah, lalu poin", () => {
    const top = topStudents(list, W);
    expect(top[0]).toMatchObject({ studentId: "st1", count: 2, points: 25 }); // 5 + 20
    expect(top[1]).toMatchObject({ studentId: "st2", count: 1, points: 5 });
  });
});
