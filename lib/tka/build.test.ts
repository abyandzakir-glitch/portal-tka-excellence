import { describe, expect, it } from "vitest";
import { averageByTryout, dateFor, latestTwoForSchool } from "./build";
import type { ScoreInfo, TryoutInfo } from "./queries";

const to = (id: string, name: string, schoolDates: Record<string, string>): TryoutInfo => ({
  id,
  name,
  date: Object.values(schoolDates).sort()[0]!,
  level: "sd",
  subjectId: "mat",
  subjectCode: "MAT",
  itemCount: 5,
  schoolIds: Object.keys(schoolDates),
  schoolDates,
});
const score = (tryoutId: string, studentId: string, schoolId: string, v: number): ScoreInfo => ({
  tryoutId,
  studentId,
  schoolId,
  rawScore: v,
  scaledScore: null,
  present: true,
  hasItemDetail: true,
});

// One shared TO sat on different days: school A on 11 Nov, school B on 18 Nov.
const to1 = to("t1", "TO 1", { A: "2026-11-11", B: "2026-11-18" });
const to2 = to("t2", "TO 2", { A: "2026-11-14", B: "2026-11-15" });
const scores = [score("t1", "a1", "A", 60), score("t2", "a1", "A", 70), score("t1", "b1", "B", 50), score("t2", "b1", "B", 80)];

describe("per-school sitting dates", () => {
  it("dateFor returns the school's own day", () => {
    expect(dateFor(to1, "A")).toBe("2026-11-11");
    expect(dateFor(to1, "B")).toBe("2026-11-18");
    expect(dateFor(to1, "X")).toBe(to1.date);
  });

  it("latest TO follows each school's order of sitting", () => {
    expect(latestTwoForSchool([to1, to2], scores, "A").latest?.id).toBe("t2");
    // B sat TO 2 (15 Nov) before TO 1 (18 Nov).
    const b = latestTwoForSchool([to1, to2], scores, "B");
    expect(b.latest?.id).toBe("t1");
    expect(b.previous?.id).toBe("t2");
  });

  it("trend points sit on the school's day", () => {
    const pts = averageByTryout([to1, to2], scores, new Set(["b1"]), "B");
    expect(pts.map((p) => [p.date, p.average])).toEqual([
      ["2026-11-15", 80],
      ["2026-11-18", 50],
    ]);
  });
});
