import { describe, expect, it } from "vitest";
import { diffRows, formatValue, summarize } from "./format";

describe("summarize", () => {
  it("update lists changed fields with labels", () => {
    expect(summarize("update", { old: { full_name: "Ani", nisn: null }, new: { full_name: "Ani Lestari", nisn: "0012345678" } })).toBe(
      "Nama: Ani → Ani Lestari; NISN: – → 0012345678",
    );
  });
  it("update with more than three fields is shortened", () => {
    const s = summarize("update", { old: { a: 1, b: 2, c: 3, d: 4 }, new: { a: 5, b: 6, c: 7, d: 8 } });
    expect(s).toMatch(/\+1 lainnya$/);
  });
  it("insert shows the identifying field", () => {
    expect(summarize("insert", { new: { id: "x", competition_name: "Olimpiade Sains", school_id: "s" } })).toBe("Olimpiade Sains");
  });
  it("delete uses old record", () => {
    expect(summarize("delete", { old: { id: "x", name: "6A" } })).toBe("6A");
  });
  it("bulk shows row and batch counts", () => {
    expect(summarize("bulk_insert", { row_count: 1234, import_batch_ids: ["a"], school_ids: ["s"] })).toBe("1.234 baris dari 1 batch impor");
  });
});

describe("diffRows", () => {
  it("never exposes uploaded file contents or snapshots", () => {
    const rows = diffRows({ new: { id: "b", original_filename: "rekap.xlsx", source_json: { rows: [["Nama"]] }, snapshot_json: {} } });
    expect(rows.map((r) => r.field)).toEqual(["original_filename"]);
  });
  it("update has before and after", () => {
    expect(diffRows({ old: { is_active: true }, new: { is_active: false } })).toEqual([{ field: "is_active", label: "Aktif", before: "Ya", after: "Tidak" }]);
  });
  it("insert has after only", () => {
    expect(diffRows({ new: { nis: "123" } })[0]).toMatchObject({ before: null, after: "123" });
  });
});

describe("formatValue", () => {
  it("translates batch status and shows names for ids", () => {
    const names = new Map([["8b78cb01-3bd2-4954-a31f-28e57d4861c0", "Demo Super Admin"]]);
    expect(summarize("update", { old: { status: "committed", rolled_back_by: null }, new: { status: "rolled_back", rolled_back_by: "8b78cb01-3bd2-4954-a31f-28e57d4861c0" } }, names)).toBe(
      "Status: Tersimpan → Dibatalkan; Dibatalkan oleh: – → Demo Super Admin",
    );
  });
  it("formats timestamps in Asia/Jakarta", () => {
    expect(formatValue("2026-11-17T16:08:08.212+00:00")).toMatch(/17 Nov 2026.*23[.:]08/);
  });
  it("shortens unknown ids", () => {
    expect(formatValue("8b78cb01-3bd2-4954-a31f-28e57d4861c0")).toBe("8b78cb01…");
  });
  it("truncates long values", () => {
    expect(formatValue("x".repeat(500))).toHaveLength(160);
  });
  it("stringifies objects", () => {
    expect(formatValue({ berkembang: 0.5 })).toBe('{"berkembang":0.5}');
  });
});
