import { describe, expect, it } from "vitest";
import { recommendFocus } from "./recommend";
import { describeRisk, evaluateRisk } from "./risk";
import { average, delta, fiveNumberSummary, histogram, participationRate, presentScores, shareMeetingTarget } from "./tryout-kpi";

const RULES = { consecutiveBelowTarget: 2, maxDropPoints: 10 };
const to = (date: string, score: number | null) => ({ date, score });

describe("evaluateRisk", () => {
  it("flags two consecutive scores below target", () => {
    const r = evaluateRisk([to("2026-08-15", 80), to("2026-09-19", 65), to("2026-10-17", 68)], 70, RULES);
    expect(r.atRisk).toBe(true);
    expect(r.reasons).toEqual([{ kind: "below_target", count: 2, target: 70 }]);
  });

  it("does not flag when only the latest is below target", () => {
    expect(evaluateRisk([to("2026-09-19", 75), to("2026-10-17", 69)], 70, RULES).atRisk).toBe(false);
  });

  it("flags a drop of more than 10 points (not exactly 10)", () => {
    expect(evaluateRisk([to("2026-09-19", 95), to("2026-10-17", 84)], 70, RULES).reasons).toEqual([
      { kind: "drop", from: 95, to: 84, points: 11 },
    ]);
    expect(evaluateRisk([to("2026-09-19", 95), to("2026-10-17", 85)], 70, RULES).atRisk).toBe(false);
  });

  it("skips absences and sorts by date", () => {
    // order given out of date order; absent TO in between does not break the streak
    const r = evaluateRisk([to("2026-10-17", 60), to("2026-08-15", 90), to("2026-09-19", null), to("2026-09-01", 62)], 70, RULES);
    expect(r.reasons.map((x) => x.kind)).toEqual(["below_target"]);
  });

  it("needs enough try-outs", () => {
    expect(evaluateRisk([to("2026-10-17", 10)], 70, RULES).atRisk).toBe(false);
    expect(evaluateRisk([], 70, RULES).atRisk).toBe(false);
  });

  it("describes reasons in Indonesian", () => {
    expect(describeRisk({ kind: "drop", from: 95.5, to: 80, points: 15.5 })).toBe("Turun 15,5 poin (95,5 → 80)");
  });
});

describe("tryout KPIs", () => {
  const rows = [
    { score: 80, present: true },
    { score: 60, present: true },
    { score: 70, present: true },
    { score: null, present: false },
  ];
  it("averages present students only", () => {
    expect(presentScores(rows)).toEqual([80, 60, 70]);
    expect(average(presentScores(rows))).toBe(70);
    expect(average([])).toBeNull();
  });
  it("share meeting target counts score >= target", () => {
    expect(shareMeetingTarget(rows, 70)).toBeCloseTo(2 / 3, 10);
    expect(shareMeetingTarget([{ score: null, present: false }], 70)).toBeNull();
  });
  it("participation and delta", () => {
    expect(participationRate(57, 60)).toBe(0.95);
    expect(participationRate(0, 0)).toBeNull();
    expect(delta(72.5, 70)).toBe(2.5);
    expect(delta(72.5, null)).toBeNull();
  });
  it("histogram puts 100 in the last bin", () => {
    const h = histogram([0, 9.99, 10, 55, 100, 100]);
    expect(h).toHaveLength(10);
    expect(h[0]!.count).toBe(2);
    expect(h[1]!.count).toBe(1);
    expect(h[5]!.count).toBe(1);
    expect(h[9]).toMatchObject({ label: "90–100", count: 2 });
  });
  it("five-number summary (Excel QUARTILE.INC)", () => {
    expect(fiveNumberSummary([1, 2, 3, 4, 5, 6, 7, 8])).toEqual({ min: 1, q1: 2.75, median: 4.5, q3: 6.25, max: 8, n: 8 });
    expect(fiveNumberSummary([])).toBeNull();
  });
});

describe("recommendFocus", () => {
  const m = (ratio: number | null, status: "intervensi" | "berkembang" | "cakap" | "mahir" | "kurang_data") => ({ ratio, items: 20, status });
  it("ranks by (1 − mastery) × blueprint weight, skipping insufficient and Mahir", () => {
    const r = recommendFocus([
      { competencyId: "a", mastery: m(0.4, "intervensi"), blueprintItems: 2, subjectItems: 20 }, // 0.6*0.1 = 0.06
      { competencyId: "b", mastery: m(0.6, "berkembang"), blueprintItems: 8, subjectItems: 20 }, // 0.4*0.4 = 0.16
      { competencyId: "c", mastery: m(0.3, "kurang_data"), blueprintItems: 8, subjectItems: 20 },
      { competencyId: "d", mastery: m(0.9, "mahir"), blueprintItems: 10, subjectItems: 20 },
      { competencyId: "e", mastery: m(0.72, "cakap"), blueprintItems: 6, subjectItems: 20 }, // 0.28*0.3 = 0.084
      { competencyId: "f", mastery: m(0.2, "intervensi"), blueprintItems: 0, subjectItems: 20 }, // not in blueprint
    ]);
    expect(r.map((x) => x.competencyId)).toEqual(["b", "e", "a"]);
    expect(r[0]!.priority).toBeCloseTo(0.16, 10);
  });
});
