import { describe, expect, it } from "vitest";
import { addWeeks, overallStatus, practiceStatus, tryoutDueWindow, tryoutStatus } from "./input-status";

describe("practiceStatus", () => {
  it("belum when no student has a log", () => expect(practiceStatus(0, 60)).toBe("belum"));
  it("sebagian when some students have logs", () => expect(practiceStatus(45, 60)).toBe("sebagian"));
  it("lengkap when every expected student has a log", () => expect(practiceStatus(60, 60)).toBe("lengkap"));
  it("lengkap when more logs than expected (e.g. student moved class)", () => expect(practiceStatus(61, 60)).toBe("lengkap"));
  it("sebagian when logs exist but no expected roster", () => expect(practiceStatus(5, 0)).toBe("sebagian"));
});

describe("tryoutStatus", () => {
  it("belum without scores", () => expect(tryoutStatus({ scored: 0, totalsOnly: 0 }, 60)).toBe("belum"));
  it("sebagian when only part of the students", () => expect(tryoutStatus({ scored: 30, totalsOnly: 0 }, 60)).toBe("sebagian"));
  it("sebagian when totals only (no per-item answers)", () => expect(tryoutStatus({ scored: 60, totalsOnly: 58 }, 60)).toBe("sebagian"));
  it("lengkap with every student incl. absent, per item", () => expect(tryoutStatus({ scored: 60, totalsOnly: 0 }, 60)).toBe("lengkap"));
});

describe("overallStatus", () => {
  it("null when nothing due", () => expect(overallStatus([])).toBeNull());
  it("lengkap only when all lengkap", () => expect(overallStatus(["lengkap", "lengkap"])).toBe("lengkap"));
  it("belum only when all belum", () => expect(overallStatus(["belum", "belum"])).toBe("belum"));
  it("sebagian otherwise", () => expect(overallStatus(["lengkap", "belum"])).toBe("sebagian"));
});

describe("weeks", () => {
  it("due window covers previous and current week", () => {
    expect(tryoutDueWindow("2026-11-16")).toEqual({ from: "2026-11-09", to: "2026-11-22" });
  });
  it("addWeeks crosses month and year", () => {
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
    expect(addWeeks("2026-11-02", -1)).toBe("2026-10-26");
  });
});
