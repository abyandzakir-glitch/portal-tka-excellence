import { describe, expect, it } from "vitest";
import { parseClass, parseGender, resolveClass, validateStudents, type StudentImportContext } from "./validate";

describe("parseClass", () => {
  it.each([
    ["6A", "6A", 6],
    ["6 a", "6A", 6],
    ["VI-B", "6B", 6],
    ["Kelas 9 C", "9C", 9],
    ["IX", "9", 9],
    ["VIB", "6B", 6],
    ["7 Unggulan", "7 Unggulan", 7],
    ["9 Ibnu Majid", "9 Ibnu Majid", 9],
    ["IX - IBNU MAJID", "9 Ibnu Majid", 9],
    ["kelas 8 abu bakar", "8 Abu Bakar", 8],
    ["9.Umar bin Khattab", "9 Umar bin Khattab", 9],
    ["12", "12", 12],
  ])("%s -> %s", (input, name, grade) => expect(parseClass(input)).toEqual({ name, grade }));
  it.each(["Unggulan", "Ibnu Majid", "Ibnu Sina", "Ali"])("tanpa tingkat: %s -> null", (v) => expect(parseClass(v)).toBeNull());
});

describe("resolveClass", () => {
  const existing = [
    { schoolId: "s1", name: "9 Ibnu Majid", grade: 9 },
    { schoolId: "s1", name: "7 Abu Bakar", grade: 7 },
    { schoolId: "s1", name: "8 Abu Bakar", grade: 8 },
    { schoolId: "s2", name: "9 Ibnu Sina", grade: 9 },
  ];
  it("memakai kelas yang sudah ada walau ditulis tanpa tingkat atau beda huruf besar", () => {
    expect(resolveClass("Ibnu Majid", "", "s1", existing)).toEqual({ ok: true, name: "9 Ibnu Majid", grade: 9, isNew: false });
    expect(resolveClass("9 IBNU  MAJID", "", "s1", existing)).toEqual({ ok: true, name: "9 Ibnu Majid", grade: 9, isNew: false });
  });
  it("membuat kelas baru dari kolom Tingkat", () => {
    expect(resolveClass("Ibnu Sina", "9", "s1", existing)).toEqual({ ok: true, name: "9 Ibnu Sina", grade: 9, isNew: true });
    expect(resolveClass("Ibnu Sina", "IX", "s1", existing)).toMatchObject({ ok: true, grade: 9 });
  });
  it("menolak nama ambigu, tingkat tidak diketahui, dan tingkat yang bertentangan", () => {
    expect(resolveClass("Abu Bakar", "", "s1", existing)).toMatchObject({ ok: false, message: expect.stringMatching(/7 Abu Bakar, 8 Abu Bakar/) });
    expect(resolveClass("Ibnu Sina", "", "s1", existing)).toMatchObject({ ok: false, message: expect.stringMatching(/Master Data → Kelas/) });
    expect(resolveClass("9 Ali", "8", "s1", existing)).toMatchObject({ ok: false });
    expect(resolveClass("Ali", "sembilan", "s1", existing)).toMatchObject({ ok: false, message: expect.stringMatching(/Tingkat "sembilan"/) });
  });
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
  existingClasses: [
    { schoolId: "s1", name: "6A", grade: 6 },
    { schoolId: "s1", name: "6B", grade: 6 },
  ],
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
    expect(r.rows[2]!.issues[0]!.message).toMatch(/Kelas 6C \(tingkat 6\) belum ada/);
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

  it("menerima kelas bernama sahabat Nabi: dengan tingkat, lewat kolom Tingkat, atau mengikuti baris sebelumnya", () => {
    const r = validateStudents(
      [
        row(2, { nis: "3001", name: "Hasan", class: "9 Ibnu Majid" }),
        row(3, { nis: "3002", name: "Husain", class: "Abu Bakar", grade: "9" }),
        row(4, { nis: "3003", name: "Zaid", class: "ibnu majid" }), // follows row 2's new class
        row(5, { nis: "3004", name: "Umar", class: "Utsman" }), // grade unknown
      ],
      ctx,
    );
    expect(r.rows.map((x) => x.data?.className ?? null)).toEqual(["9 Ibnu Majid", "9 Abu Bakar", "9 Ibnu Majid", null]);
    expect(r.rows.map((x) => x.status)).toEqual(["warning", "warning", "ok", "error"]);
    expect(r.rows[3]!.issues[0]!.message).toMatch(/Tingkat kelas "Utsman" tidak diketahui/);
  });

  it("memberi peringatan bila nama sangat berbeda untuk NIS yang sama", () => {
    const r = validateStudents([row(2, { nis: "1001", name: "Zainal Abidin" })], ctx);
    expect(r.rows[0]!.status).toBe("warning");
    expect(r.rows[0]!.data!.changes).toEqual(["nama: Alya Rahmawati → Zainal Abidin"]);
  });
});
