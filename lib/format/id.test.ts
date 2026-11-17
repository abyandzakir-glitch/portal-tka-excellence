import { describe, expect, it } from "vitest";
import {
  academicYearOf,
  academicYearRange,
  formatDate,
  formatNumber,
  formatPercent,
  formatWeek,
  semesterOf,
  todayIso,
  weekStartOf,
} from "./id";

describe("number formatting", () => {
  it("uses Indonesian thousands separator", () => {
    expect(formatNumber(1234)).toBe("1.234");
    expect(formatNumber(1234567)).toBe("1.234.567");
  });
  it("shows a dash for missing values", () => {
    expect(formatNumber(null)).toBe("–");
    expect(formatNumber(Number.NaN)).toBe("–");
    expect(formatPercent(undefined)).toBe("–");
  });
  it("formats ratios as percentages with a decimal comma", () => {
    expect(formatPercent(0.735)).toBe("73,5%");
    expect(formatPercent(1)).toBe("100%");
  });
});

describe("dates", () => {
  it("formats as '12 Nov 2026'", () => {
    expect(formatDate("2026-11-12")).toBe("12 Nov 2026");
    expect(formatDate(null)).toBe("–");
  });
  it("resolves 'today' in Asia/Jakarta, not UTC", () => {
    // 2026-11-16T18:30Z is already 17 Nov 01:30 in Jakarta (UTC+7)
    expect(todayIso(new Date("2026-11-16T18:30:00Z"))).toBe("2026-11-17");
  });
});

describe("weeks (Monday–Sunday)", () => {
  it("maps every day of a week to its Monday", () => {
    for (const day of ["2026-11-16", "2026-11-18", "2026-11-22"]) {
      expect(weekStartOf(day)).toBe("2026-11-16");
    }
  });
  it("treats Sunday as the last day of the week", () => {
    expect(weekStartOf("2026-11-15")).toBe("2026-11-09");
  });
  it("crosses month and year boundaries", () => {
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
    expect(formatWeek("2026-12-28")).toBe("Pekan 28 Des–3 Jan 2027");
    expect(formatWeek("2026-11-16")).toBe("Pekan 16–22 Nov 2026");
  });
});

describe("academic year (July–June)", () => {
  it("assigns July onwards to the new year", () => {
    expect(academicYearOf("2026-07-01")).toBe("2026/2027");
    expect(academicYearOf("2026-06-30")).toBe("2025/2026");
    expect(academicYearOf("2027-03-15")).toBe("2026/2027");
  });
  it("splits semesters at July", () => {
    expect(semesterOf("2026-07-01")).toBe(1);
    expect(semesterOf("2026-12-31")).toBe(1);
    expect(semesterOf("2027-01-01")).toBe(2);
  });
  it("derives the date range from a label", () => {
    expect(academicYearRange("2026/2027")).toEqual({ start: "2026-07-01", end: "2027-06-30" });
    expect(() => academicYearRange("2026/2028")).toThrow();
  });
});
