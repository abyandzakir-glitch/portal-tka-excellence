/**
 * Small layer over SheetJS for building downloadable templates (§9.2).
 *
 * SheetJS Community Edition cannot write data validation (dropdowns), so we
 * inject <dataValidations> into the worksheet XML afterwards, using the ZIP
 * (CFB) module bundled with SheetJS — no extra dependency.
 */
import * as XLSX from "xlsx";

export interface Validation {
  /** 0-based index of the sheet in the workbook. */
  sheet: number;
  /** Target range, e.g. "D2:D500". */
  sqref: string;
  type: "list" | "whole";
  /** list: either inline values or a range formula such as "Referensi!$A$2:$A$20". */
  values?: readonly string[];
  range?: string;
  /** whole: minimum value (inclusive). */
  min?: number;
  promptTitle?: string;
  prompt?: string;
  error?: string;
}

export interface SheetSpec {
  name: string;
  rows: (string | number | null | { f: string })[][];
  /** Column widths in characters. */
  widths?: number[];
}

// Element order of CT_Worksheet after <dataValidations> (ECMA-376); we insert before the first present.
const AFTER_DATA_VALIDATIONS = [
  "<hyperlinks", "<printOptions", "<pageMargins", "<pageSetup", "<headerFooter", "<rowBreaks", "<colBreaks",
  "<customProperties", "<cellWatches", "<ignoredErrors", "<smartTags", "<drawing", "<legacyDrawing",
  "<legacyDrawingHF", "<picture", "<oleObjects", "<controls", "<webPublishItems", "<tableParts", "<extLst", "</worksheet>",
];

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function validationXml(v: Validation): string {
  const attrs: string[] = [`type="${v.type}"`, 'allowBlank="1"', 'showInputMessage="1"', 'showErrorMessage="1"'];
  if (v.type === "whole") attrs.push('operator="greaterThanOrEqual"');
  if (v.error) attrs.push('errorTitle="Isian tidak valid"', `error="${escapeXml(v.error)}"`);
  if (v.prompt) attrs.push(`promptTitle="${escapeXml(v.promptTitle ?? "Petunjuk")}"`, `prompt="${escapeXml(v.prompt)}"`);
  attrs.push(`sqref="${v.sqref}"`);
  let formula: string;
  if (v.type === "whole") formula = String(v.min ?? 0);
  else if (v.range) formula = escapeXml(v.range);
  else {
    const inline = `"${(v.values ?? []).join(",")}"`;
    if (inline.length > 255) throw new Error("Inline dropdown list exceeds Excel's 255-character limit; use a range.");
    formula = escapeXml(inline);
  }
  return `<dataValidation ${attrs.join(" ")}><formula1>${formula}</formula1></dataValidation>`;
}

function injectValidations(xml: string, list: readonly Validation[]): string {
  const block = `<dataValidations count="${list.length}">${list.map(validationXml).join("")}</dataValidations>`;
  let at = -1;
  for (const tag of AFTER_DATA_VALIDATIONS) {
    const i = xml.indexOf(tag);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  return xml.slice(0, at) + block + xml.slice(at);
}

/** Builds an .xlsx file from sheet specs and optional dropdown validations. */
export function buildXlsx(sheets: readonly SheetSpec[], validations: readonly Validation[] = []): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const spec of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(spec.rows.map((r) => r.map((c) => (c && typeof c === "object" ? null : c))));
    // Formula cells are written after the fact: aoa_to_sheet does not accept cell objects.
    spec.rows.forEach((row, r) =>
      row.forEach((c, col) => {
        if (c && typeof c === "object") ws[XLSX.utils.encode_cell({ r, c: col })] = { t: "s", v: "", f: c.f };
      }),
    );
    if (spec.widths) ws["!cols"] = spec.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, spec.name);
  }
  const written = XLSX.write(wb, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer;
  if (validations.length === 0) return new Uint8Array(written);

  const cfb = XLSX.CFB.read(new Uint8Array(written), { type: "array" });
  const bySheet = new Map<number, Validation[]>();
  for (const v of validations) bySheet.set(v.sheet, [...(bySheet.get(v.sheet) ?? []), v]);
  for (const [sheet, list] of bySheet) {
    const index = (cfb.FullPaths as string[]).findIndex((p) => p.endsWith(`/xl/worksheets/sheet${sheet + 1}.xml`));
    if (index < 0) throw new Error(`Worksheet ${sheet + 1} not found in workbook`);
    const entry = cfb.FileIndex[index];
    const xml = new TextDecoder().decode(entry.content);
    entry.content = new TextEncoder().encode(injectValidations(xml, list));
  }
  const out = XLSX.CFB.write(cfb, { fileType: "zip", type: "array", compression: true }) as ArrayBuffer | number[];
  return out instanceof ArrayBuffer ? new Uint8Array(out) : Uint8Array.from(out);
}

/** "A".."Z","AA".. for a 0-based column index. */
export function columnLetter(index: number): string {
  let s = "";
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
