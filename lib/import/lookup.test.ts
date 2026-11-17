import { describe, expect, it } from "vitest";
import { matchCompetency, matchSubject, Roster } from "./lookup";

const roster = new Roster([
  { id: "s1", nis: "20211001", nisn: "9910000001", fullName: "Siti Aminah", className: "6A" },
  { id: "s2", nis: "20211002", nisn: "9910000002", fullName: "Budi Santoso", className: "6A" },
  { id: "s3", nis: "20211003", nisn: null, fullName: "Budi Santosa", className: "6B" },
  { id: "s4", nis: "20211004", nisn: null, fullName: "Rizky Pratama", className: "6B" },
  { id: "s5", nis: "20211005", nisn: null, fullName: "Rizky Pratama", className: "6A" },
]);

describe("Roster.match", () => {
  it("matches by NIS, then NISN, also when the two are swapped", () => {
    expect(roster.match({ nis: "20211001" })).toMatchObject({ status: "matched", student: { id: "s1" } });
    expect(roster.match({ nisn: "9910000002" })).toMatchObject({ status: "matched", student: { id: "s2" } });
    expect(roster.match({ nis: "9910000002" })).toMatchObject({ status: "matched", student: { id: "s2" } });
  });

  it("warns when the name differs strongly from the NIS owner", () => {
    const m = roster.match({ nis: "20211001", name: "Rizky Pratama" });
    expect(m.status).toBe("matched");
    expect(m.status === "matched" && m.warning).toMatch(/berbeda/);
  });

  it("falls back to an exact name match with a warning when the NIS is unknown", () => {
    const m = roster.match({ nis: "999", name: "siti  aminah" });
    expect(m).toMatchObject({ status: "matched", student: { id: "s1" } });
    expect(m.status === "matched" && m.warning).toMatch(/NIS 999 tidak ditemukan/);
  });

  it("accepts a confident fuzzy name match but flags it", () => {
    const m = roster.match({ name: "Siti Aminnah" });
    expect(m).toMatchObject({ status: "matched", student: { id: "s1" } });
    expect(m.status === "matched" && m.warning).toMatch(/nama mirip/);
  });

  it("refuses ambiguous fuzzy matches (Santoso vs Santosa)", () => {
    const m = roster.match({ name: "Budi Santos" });
    expect(m.status).toBe("not_found");
    expect(m.status === "not_found" && m.suggestions.map((s) => s.id)).toEqual(expect.arrayContaining(["s2", "s3"]));
  });

  it("refuses duplicate names without NIS", () => {
    const m = roster.match({ name: "Rizky Pratama" });
    expect(m.status).toBe("not_found");
    expect(m.status === "not_found" && m.message).toMatch(/Ada 2 siswa/);
  });

  it("reports unknown students with a friendly message", () => {
    const m = roster.match({ nis: "123", name: "Tidak Ada" });
    expect(m).toMatchObject({ status: "not_found" });
    expect(m.status === "not_found" && m.message).toBe("NIS 123 (Tidak Ada) tidak ditemukan di data siswa sekolah ini.");
  });
});

describe("matchSubject", () => {
  const subjects = [
    { id: "mat", code: "MAT", name: "Matematika" },
    { id: "bin", code: "BIN", name: "Bahasa Indonesia" },
  ];
  it.each([
    ["MTK", "mat"],
    ["matematika", "mat"],
    ["Mtematika", "mat"],
    ["B. Indonesia", "bin"],
    ["Bhs Indonesia", "bin"],
    ["BIN", "bin"],
  ])("%s -> %s", (input, id) => expect(matchSubject(input, subjects)?.id).toBe(id));
  it("returns null for unknown subjects", () => expect(matchSubject("IPA", subjects)).toBeNull());
});

describe("matchCompetency", () => {
  const list = [
    { id: "c1", code: "MAT-SMP-ALJ-01", name: "Persamaan dan Pertidaksamaan Linier", elementName: "Aljabar" },
    { id: "c2", code: "MAT-SMP-ALJ-03", name: "Fungsi", elementName: "Aljabar" },
    { id: "c3", code: "MAT-SMP-GEO-03", name: "Pengukuran", elementName: "Geometri dan Pengukuran" },
    { id: "c4", code: "MAT-SMP-DPL-01", name: "Data", elementName: "Data dan Peluang" },
  ];
  it("matches by code, name and element combination", () => {
    expect(matchCompetency("mat-smp-alj-03", list)).toMatchObject({ status: "matched", competency: { id: "c2" } });
    expect(matchCompetency("fungsi", list)).toMatchObject({ status: "matched", competency: { id: "c2" } });
    expect(matchCompetency("Aljabar - Fungsi", list)).toMatchObject({ status: "matched", competency: { id: "c2" } });
  });
  it("matches small typos with a warning", () => {
    const m = matchCompetency("Persamaan dan Pertidaksamaan Linear", list);
    expect(m).toMatchObject({ status: "matched", competency: { id: "c1" } });
    expect(m.status === "matched" && m.warning).toBeTruthy();
  });
  it("rejects unknown competencies with a hint", () => {
    const m = matchCompetency("Trigonometri", list);
    expect(m.status).toBe("not_found");
  });
});
