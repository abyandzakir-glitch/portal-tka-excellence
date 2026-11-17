/**
 * Standard achievement template (CLAUDE.md §8.1, §9.2 no. 4). The foundation
 * had no file yet, so this is built from the spec: sheet "Data Prestasi" with
 * the 10 canonical columns, "Referensi" with school codes and the fixed enum
 * values (used as dropdown sources), and "Petunjuk".
 */
import { CATEGORIES, CATEGORY_LABEL, LEVEL_LABEL, LEVELS, RANK_LABEL, RANKS } from "@/lib/achievements/labels";
import { buildXlsx, type SheetSpec } from "./xlsx";

export const ACHIEVEMENT_TEMPLATE_HEADERS = [
  "Tanggal",
  "Sekolah",
  "Nama Siswa/Tim",
  "Nama Lomba",
  "Kategori",
  "Tingkat",
  "Peringkat",
  "Penyelenggara",
  "Link Bukti",
  "Catatan",
] as const;

const ROWS = 1000;

export function buildAchievementTemplate(input: { schools: readonly { code: string; name: string }[]; schoolCode?: string | null }): Uint8Array {
  const data: SheetSpec = {
    name: "Data Prestasi",
    widths: [12, 12, 36, 44, 16, 18, 18, 30, 30, 40],
    rows: [[...ACHIEVEMENT_TEMPLATE_HEADERS], ...(input.schoolCode ? Array.from({ length: 30 }, () => [null, input.schoolCode!, null, null, null, null, null, null, null, null]) : [])],
  };
  const n = Math.max(input.schools.length, CATEGORIES.length, LEVELS.length, RANKS.length);
  const reference: SheetSpec = {
    name: "Referensi",
    widths: [14, 32, 4, 16, 18, 4, 18, 18, 4, 18, 18],
    rows: [
      ["Kode Sekolah", "Nama Sekolah", null, "Kategori", "Arti", null, "Tingkat", "Arti", null, "Peringkat", "Arti"],
      ...Array.from({ length: n }, (_, i) => [
        input.schools[i]?.code ?? null,
        input.schools[i]?.name ?? null,
        null,
        CATEGORIES[i] ?? null,
        CATEGORIES[i] ? CATEGORY_LABEL[CATEGORIES[i]!] : null,
        null,
        LEVELS[i] ?? null,
        LEVELS[i] ? LEVEL_LABEL[LEVELS[i]!] : null,
        null,
        RANKS[i] ?? null,
        RANKS[i] ? RANK_LABEL[RANKS[i]!] : null,
      ]),
    ],
  };
  const guide: SheetSpec = {
    name: "Petunjuk",
    widths: [110],
    rows: [
      ["Petunjuk Template Prestasi — Sekolah Talenta Juara"],
      [null],
      ["1. Satu baris = satu prestasi. Untuk tim, tulis semua nama di kolom Nama Siswa/Tim dipisah koma."],
      ["2. Tanggal = tanggal prestasi (bukan tanggal input), mis. 12/11/2026 atau 2026-11-12."],
      ["3. Sekolah diisi kode sekolah (lihat sheet Referensi), mis. SDTJBDG."],
      ["4. Kategori, Tingkat, dan Peringkat dipilih dari dropdown. Tingkat dan Peringkat boleh kosong bila memang tidak diketahui."],
      ["5. Bila hasil lomba tidak ada di daftar Peringkat (mis. \"Medali Partisipasi\", \"Piagam Peserta Aktif\"), kosongkan Peringkat dan tulis hasil aslinya di Catatan."],
      ["6. Catatan juga dipakai untuk kelas (mis. \"Kelas: 5A\") dan keterangan tanggal perkiraan."],
      ["7. Mengunggah ulang file yang sama tidak membuat data ganda: prestasi yang sudah tersimpan otomatis dilewati."],
      [null],
      ["Template ini dibuat oleh Portal Academic Excellence berdasarkan taksonomi baku yayasan."],
    ],
  };
  return buildXlsx(
    [data, reference, guide],
    [
      { sheet: 0, sqref: `B2:B${ROWS}`, type: "list", range: `Referensi!$A$2:$A$${input.schools.length + 1}`, error: "Pilih kode sekolah dari daftar." },
      { sheet: 0, sqref: `E2:E${ROWS}`, type: "list", range: `Referensi!$D$2:$D$${CATEGORIES.length + 1}`, error: "Pilih kategori dari daftar." },
      { sheet: 0, sqref: `F2:F${ROWS}`, type: "list", range: `Referensi!$G$2:$G$${LEVELS.length + 1}`, error: "Pilih tingkat dari daftar, atau kosongkan." },
      { sheet: 0, sqref: `G2:G${ROWS}`, type: "list", range: `Referensi!$J$2:$J$${RANKS.length + 1}`, error: "Pilih peringkat dari daftar, atau kosongkan dan tulis hasil asli di Catatan." },
    ],
  );
}
