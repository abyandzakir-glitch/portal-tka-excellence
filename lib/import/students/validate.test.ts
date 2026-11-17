import { describe, expect, it } from "vitest";
import { classKey, parseClass, parseGender, validateStudents, type StudentImportContext } from "./validate";

describe("parseClass", () => {
  it.each([
    ["6A", "6A", 6],
    ["6 a", "6A", 6],
    ["VI-B", "6B", 6],
    ["Kelas 9 C", "9C", 9],
    ["IX", "9", 9],
    ["7 Unggulan", "7UNGGULAN", 7],
  ])("%s -> %s", (input, name, grade) => expect(parseClass(input)).toEqual({ name, grade }));
  it("menolak kelas tanpa tingkat", () => expect(parseClass("Unggulan")).toBeNull());
});

describe("parseGender", () => {
  it.each([["L", "L"], ["Laki-laki", "L"], ["perempuan", "P"], ["P", "P"], ["", null], ["?", undefined]])("%s -> %s", (i, o) => expect(parseGender(i)).toBe(o));
});

const ctx: StudentImportContext = {
  schools: [{ id: "s1", code: "SDTJBDG", name: "SD Talenta Juara Bandung" }],
  batchSchoolId: "s1",
  existing: [
    { id: "a", schoolId: "s1", nis: "1001", nisn: "9900000001", fullName: "Alya Rahmawati", gender: "P", isActive: true, className: "6A" },
    { id: "b", schoolId: "s1", nis: "1002", nisn: null, fullName: "Bima Saputra", gender: "L", isActive: false, className: "6B" },
  ],
  nisnOwners: new Map([["9900000001", { schoolId: "s1", nis: "1001" }]]),
  existingClasses: new Set([classKey("s1", "6A"), classKey("s1", "6B")]),
};
const row = (rowNumber: number, values: Record<string, string | null>) => ({ rowNumber, values });

describe("validateStudents", () => {
  it("menambah, memperbarui, melewati yang sama, dan tidak menyentuh siswa yang tidak ada di file", () => {
    const r = validateStudents(
      [
        row(2, { nis: "1001", name: "Alya Rahmawati", nisn: "9900000001", gender: "P", class: "6A" }), // unchanged
        row(3, { nis: "1002", name: "Bima Saputra", gender: "L", class: "VI-B" }), // reactivated
        row(4, { nis: "1003", name: "Citra Lestari", gender: "perempuan", class: "6C" }), // new + new class
      ],
      ctx,
    );
    expect(r.rows.map((x) => x.status)).toEqual(["skipped", "ok", "warning"]);
    expect(r.rows[1]!.data).toMatchObject({ existingId: "b", changes: ["diaktifkan kembali"] });
    expect(r.rows[2]!.data).toMatchObject({ existingId: null, className: "6C", grade: 6, gender: "P" });
    expect(r.rows[2]!.issues[0]!.message).toMatch(/Kelas 6C belum ada/);
    expect(r.fileIssues[0]!.message).toMatch(/1 siswa baru akan ditambahkan dan 1 siswa diperbarui/);
  });

  it("menolak NIS ganda, NISN milik siswa lain, dan kelas tanpa tingkat", () => {
    const r = validateStudents(
      [
        row(2, { nis: "2001", name: "Dina", nisn: "9900000001" }),
        row(3, { nis: "2002", name: "Eko" }),
        row(4, { nis: "2002", name: "Eko lagi" }),
        row(5, { nis: "2003", name: "Fajar", class: "Unggulan" }),
      ],
      ctx,
    );
    expect(r.rows.map((x) => x.status)).toEqual(["error", "ok", "error", "error"]);
    expect(r.rows[0]!.issues[0]!.message).toBe("NISN 9900000001 sudah dipakai siswa lain (NIS 1001).");
    expect(r.rows[2]!.issues[0]!.message).toBe("NIS 2002 sudah muncul di baris 3.");
  });

  it("memberi peringatan bila nama sangat berbeda untuk NIS yang sama", () => {
    const r = validateStudents([row(2, { nis: "1001", name: "Zainal Abidin" })], ctx);
    expect(r.rows[0]!.status).toBe("warning");
    expect(r.rows[0]!.data!.changes).toEqual(["nama: Alya Rahmawati → Zainal Abidin"]);
  });
});
