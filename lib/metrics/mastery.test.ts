import { describe, expect, it } from "vitest";
import {
  addMasteryCounts,
  computeMastery,
  emptyMastery,
  isRecent,
  masteryTrend,
  recentWindowStart,
  statusForRatio,
  worstStatus,
  type MasteryCounts,
  type MasterySettings,
} from "./mastery";

const S: MasterySettings = {
  weights: { tryout: 0.7, practice: 0.3, recentWeeks: 4, recentMultiplier: 2 },
  thresholds: { berkembang: 0.5, cakap: 0.7, mahir: 0.85 },
  minItems: 5,
};

function counts(p: Partial<{ toR: [number, number]; toO: [number, number]; prR: [number, number]; prO: [number, number] }>): MasteryCounts {
  const c = emptyMastery();
  const set = (t: { attempted: number; correct: number }, v?: [number, number]) => {
    if (v) [t.attempted, t.correct] = v;
  };
  set(c.tryout.recent, p.toR);
  set(c.tryout.older, p.toO);
  set(c.practice.recent, p.prR);
  set(c.practice.older, p.prO);
  return c;
}

describe("computeMastery", () => {
  it("combines TO and practice 70:30", () => {
    // TO 8/10 = 0.8 (all older), practice 5/10 = 0.5 -> 0.7*0.8 + 0.3*0.5 = 0.71
    const m = computeMastery(counts({ toO: [10, 8], prO: [10, 5] }), S);
    expect(m.ratio).toBeCloseTo(0.71, 10);
    expect(m.items).toBe(20);
    expect(m.status).toBe("cakap");
  });

  it("weights recent data twice within a source", () => {
    // TO recent 4/4 (x2 -> 8/8), older 0/4 -> 8/12 = 0.6667
    const m = computeMastery(counts({ toR: [4, 4], toO: [4, 0] }), S);
    expect(m.ratio).toBeCloseTo(8 / 12, 10);
    expect(m.status).toBe("berkembang");
  });

  it("uses the only available source at 100%", () => {
    expect(computeMastery(counts({ prO: [10, 9] }), S).ratio).toBeCloseTo(0.9, 10);
    expect(computeMastery(counts({ toR: [6, 3] }), S).ratio).toBeCloseTo(0.5, 10);
  });

  it("reports 'Data belum cukup' below the minimum number of items (both sources counted)", () => {
    const few = computeMastery(counts({ toO: [2, 2], prO: [2, 2] }), S);
    expect(few.status).toBe("kurang_data");
    expect(few.ratio).toBe(1); // still computed, but no status
    expect(computeMastery(counts({ toO: [3, 3], prO: [2, 2] }), S).status).toBe("mahir"); // 5 items
    expect(computeMastery(emptyMastery(), S)).toEqual({ ratio: null, items: 0, status: "kurang_data" });
  });

  it("applies thresholds inclusively at the boundaries", () => {
    expect(statusForRatio(0.4999, S.thresholds)).toBe("intervensi");
    expect(statusForRatio(0.5, S.thresholds)).toBe("berkembang");
    expect(statusForRatio(0.6999, S.thresholds)).toBe("berkembang");
    expect(statusForRatio(0.7, S.thresholds)).toBe("cakap");
    expect(statusForRatio(0.7 - 1e-15, S.thresholds)).toBe("cakap"); // float noise
    expect(statusForRatio(0.85, S.thresholds)).toBe("mahir");
  });

  it("respects configured weights (e.g. TO only)", () => {
    const toOnly = { ...S, weights: { ...S.weights, tryout: 1, practice: 0 } };
    expect(computeMastery(counts({ toO: [10, 4], prO: [10, 10] }), toOnly).ratio).toBeCloseTo(0.4, 10);
  });
});

describe("pooling", () => {
  it("sums counts of group members before applying the formula", () => {
    const a = counts({ toO: [10, 10] });
    const b = counts({ toO: [30, 15] });
    const pooled = addMasteryCounts(emptyMastery(), a);
    addMasteryCounts(pooled, b);
    // pooled 25/40 = 0.625, not the average of 1.0 and 0.5 (0.75)
    expect(computeMastery(pooled, S).ratio).toBeCloseTo(0.625, 10);
  });
});

describe("recency window", () => {
  it("covers the last 4 weeks up to and including the period end", () => {
    expect(isRecent("2026-11-17", "2026-11-17", 4)).toBe(true);
    expect(isRecent("2026-10-21", "2026-11-17", 4)).toBe(true); // 27 days before
    expect(isRecent("2026-10-20", "2026-11-17", 4)).toBe(false); // 28 days before
    expect(isRecent("2026-11-18", "2026-11-17", 4)).toBe(false); // after the period
    expect(recentWindowStart("2026-11-17", 4)).toBe("2026-10-21");
  });
});

describe("worstStatus", () => {
  it("takes the lowest known status", () => {
    expect(worstStatus(["mahir", "berkembang", "kurang_data"])).toBe("berkembang");
    expect(worstStatus(["kurang_data", "kurang_data"])).toBe("kurang_data");
    expect(worstStatus([])).toBe("kurang_data");
  });
});

describe("masteryTrend", () => {
  it("compares recent vs older mastery", () => {
    expect(masteryTrend(counts({ toR: [10, 9], toO: [10, 5] }), S).direction).toBe("naik");
    expect(masteryTrend(counts({ toR: [10, 4], toO: [10, 8] }), S).direction).toBe("turun");
    expect(masteryTrend(counts({ toR: [10, 7], toO: [10, 7] }), S).direction).toBe("stagnan");
  });
  it("is unknown when either side lacks data", () => {
    expect(masteryTrend(counts({ toR: [10, 9], toO: [2, 0] }), S)).toEqual({ direction: "tidak_diketahui", delta: null });
  });
});
