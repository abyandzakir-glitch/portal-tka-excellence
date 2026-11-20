import { describe, expect, it } from "vitest";
import { achievementYearOptions, resolveAchievementPeriod } from "./period";

const TODAY = "2026-11-20";

describe("resolveAchievementPeriod (tahun kalender)", () => {
  it("bawaan: tahun berjalan penuh, Jan–Des", () => {
    expect(resolveAchievementPeriod({}, TODAY)).toMatchObject({
      preset: "tahun", year: 2026, start: "2026-01-01", end: "2026-12-31", asOf: TODAY, label: "Tahun 2026",
    });
  });

  it("tahun lalu: asOf = 31 Des", () => {
    expect(resolveAchievementPeriod({ tahun: "2025" }, TODAY)).toMatchObject({ start: "2025-01-01", end: "2025-12-31", asOf: "2025-12-31", label: "Tahun 2025" });
  });

  it("tautan lama per tahun ajaran (periode=ta/s1) jatuh ke tahun penuh", () => {
    expect(resolveAchievementPeriod({ periode: "s1", ta: "2026/2027" }, TODAY)).toMatchObject({ preset: "tahun", start: "2026-01-01", end: "2026-12-31" });
  });

  it("tahun tidak masuk akal diabaikan", () => {
    expect(resolveAchievementPeriod({ tahun: "1999" }, TODAY).year).toBe(2026);
    expect(resolveAchievementPeriod({ tahun: "abcd" }, TODAY).year).toBe(2026);
  });

  it("bulan: eksplisit, bawaan bulan ini, dan Januari untuk tahun lalu", () => {
    expect(resolveAchievementPeriod({ periode: "bulan", bulan: "2026-02" }, TODAY)).toMatchObject({ month: "2026-02", start: "2026-02-01", end: "2026-02-28", label: "Februari 2026" });
    expect(resolveAchievementPeriod({ periode: "bulan" }, TODAY)).toMatchObject({ month: "2026-11", start: "2026-11-01", end: "2026-11-30" });
    expect(resolveAchievementPeriod({ periode: "bulan", tahun: "2025" }, TODAY)).toMatchObject({ month: "2025-01", year: 2025 });
  });

  it("pekan: Senin–Minggu, boleh melintasi pergantian tahun", () => {
    expect(resolveAchievementPeriod({ periode: "pekan", pekan: "2026-11-22" }, TODAY)).toMatchObject({ start: "2026-11-16", end: "2026-11-22" });
    expect(resolveAchievementPeriod({ periode: "pekan", pekan: "2027-01-01" }, "2027-01-05")).toMatchObject({ start: "2026-12-28", end: "2027-01-03", year: 2026 });
  });

  it("rentang: lengkap dipakai apa adanya; belum lengkap = tahun penuh tetapi pilihan tetap 'rentang'", () => {
    expect(resolveAchievementPeriod({ periode: "rentang", dari: "2025-07-01", sampai: "2026-06-30" }, TODAY)).toMatchObject({ start: "2025-07-01", end: "2026-06-30", year: 2025, label: "1 Jul 2025 – 30 Jun 2026" });
    expect(resolveAchievementPeriod({ periode: "rentang", dari: "2026-05-01" }, TODAY)).toMatchObject({ preset: "rentang", start: "2026-01-01", end: "2026-12-31" });
    expect(resolveAchievementPeriod({ periode: "rentang", dari: "2026-06-01", sampai: "2026-05-01" }, TODAY)).toMatchObject({ start: "2026-01-01" });
  });
});

describe("achievementYearOptions", () => {
  it("tahun data + tahun berjalan + pilihan, terbaru dulu, tanpa duplikat", () => {
    expect(achievementYearOptions([2024, 2026], TODAY, 2026)).toEqual([2026, 2024]);
    expect(achievementYearOptions([], TODAY, 2023)).toEqual([2026, 2023]);
  });
});
