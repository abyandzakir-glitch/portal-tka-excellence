import { describe, expect, it } from "vitest";
import {
  detectAnswerMode,
  parseAnswer,
  parseAnswerKey,
  parseDate,
  parseIdentifier,
  parseInteger,
  parseNumber,
  parseWeekStart,
  parseYesNo,
} from "./values";

describe("parseNumber", () => {
  it.each([
    [85, 85],
    ["85", 85],
    ["85,5", 85.5],
    ["85.5", 85.5],
    ["1.234", 1234],
    ["1.234,5", 1234.5],
    ["1,234.5", 1234.5],
    ["0,75", 0.75],
    ["90%", 90],
    [" 7 ", 7],
  ])("%s -> %s", (input, expected) => expect(parseNumber(input)).toBe(expected));

  it.each([["abc"], [""], [null], [true], ["12a"]])("%s -> null", (input) => expect(parseNumber(input as never)).toBeNull());

  it("parseInteger rejects decimals", () => {
    expect(parseInteger("12")).toBe(12);
    expect(parseInteger("12,5")).toBeNull();
  });
});

describe("parseIdentifier", () => {
  it("keeps NIS as digit strings", () => {
    expect(parseIdentifier(20211001)).toBe("20211001");
    expect(parseIdentifier("'0012345")).toBe("0012345");
    expect(parseIdentifier(" 2021 1001 ")).toBe("20211001");
    expect(parseIdentifier(9912345678)).toBe("9912345678");
    expect(parseIdentifier(null)).toBeNull();
  });
});

describe("parseDate", () => {
  it.each([
    ["2026-11-12", "2026-11-12"],
    ["12/11/2026", "2026-11-12"],
    ["12-11-26", "2026-11-12"],
    ["12.11.2026", "2026-11-12"],
    ["12 Nov 2026", "2026-11-12"],
    ["12 November 2026", "2026-11-12"],
    ["Kamis, 12 November 2026", "2026-11-12"],
    ["3 Agustus 2026", "2026-08-03"],
    ["1 Mei 2026", "2026-05-01"],
    ["Nov 12, 2026", "2026-11-12"],
    [46338, "2026-11-12"], // Excel serial
  ])("%s -> %s", (input, expected) => expect(parseDate(input)).toBe(expected));

  it.each([["31/02/2026"], ["kemarin"], ["13/13/2026"], [12], [""]])("%s -> null", (input) => expect(parseDate(input)).toBeNull());
});

describe("parseWeekStart", () => {
  it("returns the Monday of the week (Mon–Sun)", () => {
    expect(parseWeekStart("2026-11-12")).toBe("2026-11-09"); // Thursday
    expect(parseWeekStart("2026-11-15")).toBe("2026-11-09"); // Sunday belongs to the same week
    expect(parseWeekStart("2026-11-16")).toBe("2026-11-16"); // Monday
    expect(parseWeekStart("12/11/2026")).toBe("2026-11-09");
  });
  it("understands ISO week labels and ranges", () => {
    expect(parseWeekStart("2026-W46")).toBe("2026-11-09");
    expect(parseWeekStart("10-16 Nov 2026")).toBe("2026-11-09");
    expect(parseWeekStart("10/11/2026 - 16/11/2026")).toBe("2026-11-09");
  });
  it("rejects nonsense", () => {
    expect(parseWeekStart("Pekan 3")).toBeNull();
  });
});

describe("answers", () => {
  it("letter mode reads B as option B", () => {
    expect(parseAnswer("b", "letter")).toEqual({ kind: "letter", letter: "B" });
    expect(parseAnswer("C.", "letter")).toEqual({ kind: "letter", letter: "C" });
  });
  it("binary mode reads 1/0, B/S and benar/salah", () => {
    expect(parseAnswer(1, "binary")).toEqual({ kind: "binary", correct: true });
    expect(parseAnswer("0", "binary")).toEqual({ kind: "binary", correct: false });
    expect(parseAnswer("B", "binary")).toEqual({ kind: "binary", correct: true });
    expect(parseAnswer("salah", "binary")).toEqual({ kind: "binary", correct: false });
  });
  it("blank and invalid", () => {
    expect(parseAnswer(null, "letter")).toEqual({ kind: "blank" });
    expect(parseAnswer("-", "letter")).toEqual({ kind: "blank" });
    expect(parseAnswer("ZZ", "letter")).toEqual({ kind: "invalid", raw: "ZZ" });
    expect(parseAnswer(5, "binary")).toEqual({ kind: "invalid", raw: "5" });
  });
  it("detects the answer mode", () => {
    expect(detectAnswerMode([1, 0, 1, null])).toBe("binary");
    expect(detectAnswerMode(["B", "S", "B"])).toBe("binary");
    expect(detectAnswerMode(["B", "A", null])).toBe("letter");
    expect(detectAnswerMode(["d"])).toBe("letter");
  });
  it("answer keys", () => {
    expect(parseAnswerKey(" c ")).toBe("C");
    expect(parseAnswerKey("AB")).toBeNull();
  });
});

describe("parseYesNo", () => {
  it.each([
    ["Ya", true],
    ["✓", true],
    ["x", true],
    [1, true],
    ["Tidak", false],
    [null, false],
    ["", false],
    ["mungkin", null],
  ])("%s -> %s", (input, expected) => expect(parseYesNo(input as never)).toBe(expected));
});
