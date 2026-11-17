import { describe, expect, it } from "vitest";
import { Roster } from "../lookup";
import { autoMap, missingRequired } from "../mapping";
import { buildRowInputs, fieldSetFor } from "../pipeline";
import { aiResultToSheet, looksTabular, type AiAchievements } from "./ai-rows";
import { validateAchievements } from "./validate";

const sure = { tanggal: 0.95, nama_siswa: 0.95, nama_lomba: 0.95, tingkat: 0.9, peringkat: 0.9 };
const result: AiAchievements = {
  catatan_umum: "",
  rows: [
    {
      tanggal: "12 Nov 2026",
      sekolah: "",
      nama_siswa: "Alya Rahmawati",
      kelas: "5A",
      nama_lomba: "Olimpiade Matematika Contoh",
      bidang: "Matematika",
      tingkat: "tingkat Provinsi Jawa Barat",
      peringkat: "Juara 2",
      penyelenggara: "Lembaga Contoh",
      catatan: "",
      keyakinan: sure,
    },
    {
      tanggal: "3/11/2026",
      sekolah: "",
      nama_siswa: "Bima S.",
      kelas: "",
      nama_lomba: "Lomba Renang Contoh",
      bidang: "",
      tingkat: "Kota",
      peringkat: "medali perunggu",
      penyelenggara: "",
      catatan: "Tulisan nama di foto agak buram",
      keyakinan: { ...sure, nama_siswa: 0.4, tanggal: 0.6 },
    },
  ],
};

describe("hasil AI masuk alur impor yang sama", () => {
  const sheet = aiResultToSheet(result);
  const set = fieldSetFor("achievements");
  const { columns } = autoMap(sheet.rows[0]!.map(String), set);

  it("kolom terpetakan otomatis termasuk Catatan AI", () => {
    expect(missingRequired(columns, set)).toEqual([]);
    expect(columns.at(-1)).toBe("ai_note");
    expect(columns.at(-2)).toBe("notes");
  });

  it("dinormalkan oleh kode kita; kolom yang kurang yakin ditandai untuk dicek", () => {
    const r = validateAchievements(buildRowInputs(sheet.rows, 0, columns), {
      schools: [{ id: "s", code: "SDTJCMH", name: "SD Talenta Juara Cimahi" }],
      batchSchoolId: "s",
      rosters: new Map([["s", new Roster([{ id: "a", nis: "1", nisn: null, fullName: "Alya Rahmawati", className: "5A" }])]]),
      academicYear: { startYear: 2026 },
      today: "2026-11-17",
      existingKeys: new Set(),
    });
    expect(r.rows[0]!.data).toMatchObject({ achievedOn: "2026-11-12", level: "PROVINSI", rank: "JUARA_2", category: "AKADEMIK", participants: [{ studentId: "a" }] });
    expect(r.rows[1]!.status).toBe("warning");
    expect(r.rows[1]!.issues.map((i) => i.message)).toContain("AI kurang yakin pada: tanggal, nama siswa. Cocokkan dengan dokumen aslinya.");
    expect(r.rows[1]!.data).toMatchObject({ rank: "MEDALI_PERUNGGU", level: "KOTA_KABUPATEN", participants: [{ studentId: null, rawName: "Bima S." }] });
  });
});

describe("looksTabular", () => {
  it("teks salinan tabel tidak perlu AI", () => {
    expect(looksTabular("Tanggal\tNama\tLomba\n12/11/2026\tAlya\tOSN\n13/11/2026\tBima\tRenang")).toBe(true);
    expect(looksTabular("Tanggal;Nama;Lomba\n12/11/2026;Alya;OSN")).toBe(true);
  });
  it("rekap WhatsApp butuh AI", () => {
    expect(looksTabular("Alhamdulillah ananda Alya (5A) meraih Juara 2 OSN Matematika tingkat Provinsi.\nSelamat!")).toBe(false);
  });
});
