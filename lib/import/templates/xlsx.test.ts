import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildXlsx, columnLetter } from "./xlsx";

function sheetXml(bytes: Uint8Array, n: number): string {
  const cfb = XLSX.CFB.read(bytes, { type: "array" });
  const i = (cfb.FullPaths as string[]).findIndex((p) => p.endsWith(`/xl/worksheets/sheet${n}.xml`));
  return new TextDecoder().decode(cfb.FileIndex[i].content);
}

describe("buildXlsx", () => {
  const bytes = buildXlsx(
    [
      { name: "Data", rows: [["Kunci", "Elemen"], ["A", { f: 'IF(A2="","",A2)' }]] },
      { name: "Referensi", rows: [["x"], ["y"]] },
    ],
    [
      { sheet: 0, sqref: "A2:A100", type: "list", values: ["A", "B", "C"], error: "Pilih A–C & benar" },
      { sheet: 0, sqref: "B2:B100", type: "list", range: "Referensi!$A$1:$A$2" },
      { sheet: 0, sqref: "C2:C100", type: "whole", min: 0 },
    ],
  );

  it("writes data validations in a schema-valid position (before ignoredErrors)", () => {
    const xml = sheetXml(bytes, 1);
    expect(xml).toContain('<dataValidations count="3">');
    expect(xml).toContain("<formula1>&quot;A,B,C&quot;</formula1>");
    expect(xml).toContain("<formula1>Referensi!$A$1:$A$2</formula1>");
    expect(xml).toContain('error="Pilih A–C &amp; benar"');
    const dv = xml.indexOf("<dataValidations");
    expect(dv).toBeGreaterThan(xml.indexOf("</sheetData>"));
    const ignored = xml.indexOf("<ignoredErrors");
    if (ignored >= 0) expect(dv).toBeLessThan(ignored);
    expect(sheetXml(bytes, 2)).not.toContain("dataValidations");
  });

  it("stays readable and keeps formulas", () => {
    const wb = XLSX.read(bytes, { type: "array", cellFormula: true });
    expect(wb.SheetNames).toEqual(["Data", "Referensi"]);
    expect(wb.Sheets.Data!.B2?.f).toBe('IF(A2="","",A2)');
  });
});

describe("columnLetter", () => {
  it.each([
    [0, "A"],
    [25, "Z"],
    [26, "AA"],
    [44, "AS"],
  ])("%i -> %s", (i, l) => expect(columnLetter(i)).toBe(l));
});
