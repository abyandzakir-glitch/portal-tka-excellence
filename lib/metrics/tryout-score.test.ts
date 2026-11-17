import { describe, expect, it } from "vitest";
import { computeRawScore, effectiveScore } from "./tryout-score";

const item = (isCorrect: boolean | null, isVoided = false) => ({ isCorrect, isVoided });

describe("computeRawScore", () => {
  it("is the percentage of correct answers", () => {
    expect(computeRawScore([item(true), item(true), item(false), item(false)])).toBe(50);
    expect(computeRawScore([item(true), item(false), item(false)])).toBe(33.33);
  });

  it("counts unanswered items as not correct", () => {
    expect(computeRawScore([item(true), item(null)])).toBe(50);
  });

  it("removes voided items from numerator and denominator", () => {
    // Without voiding: 2/4 = 50. Item 4 voided (answered correctly) -> 1/3.
    expect(computeRawScore([item(true), item(false), item(false), item(true, true)])).toBe(33.33);
    // A voided item answered wrongly does not lower the score.
    expect(computeRawScore([item(true), item(true), item(false, true)])).toBe(100);
  });

  it("returns null when there is nothing to count (all items voided / no items)", () => {
    expect(computeRawScore([])).toBeNull();
    expect(computeRawScore([item(true, true)])).toBeNull();
  });
});

describe("effectiveScore", () => {
  it("prefers the organiser's scaled score", () => {
    expect(effectiveScore({ rawScore: 60, scaledScore: 72.5 })).toBe(72.5);
    expect(effectiveScore({ rawScore: 60, scaledScore: null })).toBe(60);
    expect(effectiveScore({ rawScore: null, scaledScore: null })).toBeNull();
  });
});
