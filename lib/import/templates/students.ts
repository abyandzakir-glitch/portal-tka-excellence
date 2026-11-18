/**
 * Student master template (Fase 5). Pre-filled with the school's current
 * students so an admin can correct or add rows and upload the same file back.
 */
import { buildXlsx } from "./xlsx";

export function buildStudentTemplate(input: {
  schoolCode: string | null;
  schoolName: string;
  students: readonly { nis: string; nisn: string | null; fullName: string; gender: "L" | "P" | null; className: string | null }[];
}): Uint8Array {
  const header = ["NIS", "NISN", "Nama Lengkap", "L/P", "Kelas", "Sekolah"];
  return buildXlsx(
    [
      {
        name: "Data Siswa",
        widths: [12, 13, 36, 6, 8, 12],
        rows: [header, ...input.students.map((s) => [s.nis, s.nisn, s.fullName, s.gender, s.className, input.schoolCode])],
      },
      {
        name: "Petunjuk",
        widths: [110],
        rows: [
          [`Petunjuk Data Siswa — ${input.schoolName}`],
          [null],
          ["1. Satu baris = satu siswa. Siswa yang sudah tercatat sudah terisi; ubah datanya bila perlu atau tambahkan baris baru di bawahnya."],
          ["2. NIS wajib dan menjadi kunci: baris dengan NIS yang sudah ada akan memperbarui siswa tersebut."],
          ["3. NISN 10 digit dan harus unik. L/P diisi L atau P."],
          ["4. Kelas diisi tingkat + nama rombel, mis. 6A, VI-B, atau 9 Ibnu Majid. Kelas yang belum ada di tahun ajaran aktif akan dibuat otomatis."],
          ["   Bila nama kelas di sekolah tidak memuat angka (mis. Ibnu Majid): tulis 9 Ibnu Majid, ATAU tambahkan kolom Tingkat berisi 9, ATAU buat dulu kelasnya di Master Data → Kelas lalu cukup tulis Ibnu Majid."],
          ["5. Menghapus baris dari file TIDAK menonaktifkan siswa. Untuk siswa yang pindah/lulus, gunakan tombol Nonaktifkan di menu Master Data → Siswa."],
        ],
      },
    ],
    [
      { sheet: 0, sqref: "D2:D2000", type: "list", values: ["L", "P"], error: "Isi L atau P." },
    ],
  );
}
