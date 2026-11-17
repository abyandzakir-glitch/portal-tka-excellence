/**
 * Official TKA templates (CLAUDE.md §9.2 no. 1–3). Each workbook has a data
 * sheet first, then "Petunjuk" (instructions) and "Referensi" (dropdown
 * sources). Headers match the import synonyms, so a filled-in template maps
 * automatically without any manual step.
 */
import { buildXlsx, columnLetter, type SheetSpec, type Validation } from "./xlsx";

const MAX_ROWS = 1000;
const ANSWER_VALUES = ["A", "B", "C", "D", "E", "1", "0"];

export interface TemplateCompetency {
  code: string;
  name: string;
  elementName: string | null;
}

export interface TemplateStudent {
  nis: string;
  nisn: string | null;
  fullName: string;
  className: string | null;
}

function instructions(title: string, lines: string[]): SheetSpec {
  return {
    name: "Petunjuk",
    widths: [110],
    rows: [[title], [null], ...lines.map((l) => [l]), [null], ["Template ini dibuat oleh Portal Academic Excellence — Sekolah Talenta Juara."]],
  };
}

// ---------------------------------------------------------------------------
// 1. Kisi-kisi TO
// ---------------------------------------------------------------------------

export function buildBlueprintTemplate(input: {
  subjectName: string;
  levelLabel: string;
  competencies: readonly TemplateCompetency[];
  cognitiveLevels: readonly string[];
  itemCount?: number;
}): Uint8Array {
  const count = input.itemCount ?? 40;
  const header = ["Nomor Soal", "Mapel", "Elemen", "Sub-kompetensi", "Level Kognitif", "Tingkat Kesulitan", "Kunci Jawaban", "Dianulir"];
  const data: SheetSpec = {
    name: "Kisi-kisi",
    widths: [11, 18, 28, 60, 34, 17, 14, 10],
    rows: [
      header,
      ...Array.from({ length: count }, (_, i) => {
        const r = i + 2;
        return [
          i + 1,
          input.subjectName,
          { f: `IF(D${r}="","",IFERROR(VLOOKUP(D${r},Referensi!$A$2:$B$${input.competencies.length + 1},2,FALSE),""))` },
          null,
          null,
          null,
          null,
          null,
        ];
      }),
    ],
  };
  const refRows = Math.max(input.competencies.length, input.cognitiveLevels.length, 3);
  const reference: SheetSpec = {
    name: "Referensi",
    widths: [60, 28, 18, 4, 36, 4, 16],
    rows: [
      ["Sub-kompetensi", "Elemen", "Kode", null, "Level Kognitif", null, "Tingkat Kesulitan"],
      ...Array.from({ length: refRows }, (_, i) => {
        const c = input.competencies[i];
        return [c?.name ?? null, c?.elementName ?? null, c?.code ?? null, null, input.cognitiveLevels[i] ?? null, null, ["Mudah", "Sedang", "Sulit"][i] ?? null];
      }),
    ],
  };
  const guide = instructions(`Petunjuk Kisi-kisi Try Out — ${input.subjectName} ${input.levelLabel}`, [
    "1. Satu baris = satu nomor soal. Hapus baris nomor soal yang tidak dipakai, atau biarkan Sub-kompetensinya kosong.",
    "2. Pilih Sub-kompetensi dari daftar (klik sel lalu panah dropdown). Kolom Elemen terisi otomatis.",
    "3. Level Kognitif dan Tingkat Kesulitan boleh dikosongkan.",
    "4. Kunci Jawaban: satu huruf A–E. Boleh kosong bila hasil TO nanti diunggah dalam format 1/0 (benar/salah).",
    "5. Dianulir: isi \"Ya\" bila soal dibatalkan. Soal yang dianulir tidak dihitung dalam nilai maupun penguasaan kompetensi.",
    "6. Simpan file, lalu unggah di menu Input Pekanan → Kisi-kisi TO.",
  ]);
  const last = count + 1;
  const validations: Validation[] = [
    {
      sheet: 0,
      sqref: `D2:D${Math.max(last, MAX_ROWS)}`,
      type: "list",
      range: `Referensi!$A$2:$A$${input.competencies.length + 1}`,
      error: "Pilih sub-kompetensi dari daftar.",
    },
    { sheet: 0, sqref: `G2:G${MAX_ROWS}`, type: "list", values: ["A", "B", "C", "D", "E"], error: "Kunci jawaban harus A, B, C, D, atau E." },
    { sheet: 0, sqref: `F2:F${MAX_ROWS}`, type: "list", range: "Referensi!$G$2:$G$4", error: "Pilih Mudah, Sedang, atau Sulit." },
    { sheet: 0, sqref: `H2:H${MAX_ROWS}`, type: "list", values: ["Ya", "Tidak"] },
  ];
  if (input.cognitiveLevels.length) {
    validations.push({
      sheet: 0,
      sqref: `E2:E${MAX_ROWS}`,
      type: "list",
      range: `Referensi!$E$2:$E$${input.cognitiveLevels.length + 1}`,
      error: "Pilih level kognitif dari daftar.",
    });
  }
  return buildXlsx([data, guide, reference], validations);
}

// ---------------------------------------------------------------------------
// 2. Hasil TO
// ---------------------------------------------------------------------------

export function buildResultsTemplate(input: {
  tryoutName: string;
  schoolName: string;
  itemNumbers: readonly number[];
  students: readonly TemplateStudent[];
}): Uint8Array {
  const items = [...input.itemNumbers].sort((a, b) => a - b);
  const header = ["NIS", "NISN", "Nama Siswa", "Kelas", ...items.map(String), "Kehadiran"];
  const data: SheetSpec = {
    name: "Hasil TO",
    widths: [12, 13, 32, 8, ...items.map(() => 4), 12],
    rows: [header, ...input.students.map((s) => [s.nis, s.nisn, s.fullName, s.className, ...items.map(() => null), null])],
  };
  const firstItem = columnLetter(4);
  const lastItem = columnLetter(3 + items.length);
  const attendanceCol = columnLetter(4 + items.length);
  const guide = instructions(`Petunjuk Hasil Try Out — ${input.tryoutName} — ${input.schoolName}`, [
    "1. Daftar siswa sudah terisi dari data master. Jangan ubah kolom NIS.",
    "2. Isi jawaban siswa per nomor soal: huruf pilihan (A–E) ATAU 1 = benar / 0 = salah. Pakai salah satu cara untuk seluruh file.",
    "3. Soal yang tidak dijawab: biarkan kosong (dihitung salah).",
    "4. Siswa yang tidak ikut TO: kosongkan semua jawabannya, atau isi Kehadiran = \"Tidak Hadir\".",
    "5. Bila hanya punya nilai total, tambahkan kolom \"Nilai\" dan hapus kolom nomor soal; nilai total tidak dipakai untuk analisis kompetensi.",
    "6. Simpan file, lalu unggah di menu Input Pekanan → Hasil TO.",
  ]);
  const validations: Validation[] = items.length
    ? [
        {
          sheet: 0,
          sqref: `${firstItem}2:${lastItem}${MAX_ROWS}`,
          type: "list",
          values: ANSWER_VALUES,
          error: "Isi huruf A–E, atau 1 (benar) / 0 (salah).",
        },
        { sheet: 0, sqref: `${attendanceCol}2:${attendanceCol}${MAX_ROWS}`, type: "list", values: ["Hadir", "Tidak Hadir"] },
      ]
    : [];
  return buildXlsx([data, guide], validations);
}

// ---------------------------------------------------------------------------
// 3. Latihan Pekanan
// ---------------------------------------------------------------------------

export function buildPracticeTemplate(input: {
  schoolName: string;
  /** Monday of the week, "YYYY-MM-DD". */
  weekStart: string;
  subjects: readonly { name: string }[];
  competencies: readonly TemplateCompetency[];
  students: readonly TemplateStudent[];
}): Uint8Array {
  const [y, m, d] = input.weekStart.split("-");
  const weekLabel = `${d}/${m}/${y}`;
  const header = ["NIS", "Nama Siswa", "Kelas", "Pekan", "Mapel", "Sub-kompetensi", "Jumlah Dikerjakan", "Jumlah Benar"];
  const rows = input.students.flatMap((s) => input.subjects.map((subj) => [s.nis, s.fullName, s.className, weekLabel, subj.name, null, null, null]));
  const data: SheetSpec = { name: "Latihan Pekanan", widths: [12, 32, 8, 12, 18, 60, 18, 14], rows: [header, ...rows] };
  const reference: SheetSpec = {
    name: "Referensi",
    widths: [18, 4, 60, 28],
    rows: [
      ["Mapel", null, "Sub-kompetensi", "Elemen"],
      ...Array.from({ length: Math.max(input.subjects.length, input.competencies.length) }, (_, i) => [
        input.subjects[i]?.name ?? null,
        null,
        input.competencies[i]?.name ?? null,
        input.competencies[i]?.elementName ?? null,
      ]),
    ],
  };
  const guide = instructions(`Petunjuk Latihan Pekanan — ${input.schoolName}`, [
    "1. Satu baris = satu siswa, satu pekan, satu mapel (dan satu sub-kompetensi bila ada).",
    "2. Pekan: tulis tanggal mana pun di pekan itu (Senin–Minggu), mis. 10/11/2026. Sistem otomatis memakai hari Senin pekan tersebut.",
    "3. Sub-kompetensi boleh kosong bila latihannya campuran; data tetap dihitung untuk jumlah soal dan akurasi, tetapi tidak untuk penguasaan kompetensi.",
    "4. Bila satu siswa berlatih beberapa sub-kompetensi di mapel yang sama, salin barisnya dan isi sub-kompetensi yang berbeda.",
    "5. Jumlah Benar tidak boleh lebih besar dari Jumlah Dikerjakan. Baris dengan Jumlah Dikerjakan kosong/0 dilewati.",
    "6. Mengunggah data untuk siswa, pekan, dan mapel yang sama akan menggantikan data sebelumnya.",
  ]);
  const validations: Validation[] = [
    { sheet: 0, sqref: `E2:E${MAX_ROWS * 4}`, type: "list", range: `Referensi!$A$2:$A$${input.subjects.length + 1}`, error: "Pilih mapel dari daftar." },
    {
      sheet: 0,
      sqref: `F2:F${MAX_ROWS * 4}`,
      type: "list",
      range: `Referensi!$C$2:$C$${input.competencies.length + 1}`,
      error: "Pilih sub-kompetensi dari daftar, atau kosongkan.",
    },
    { sheet: 0, sqref: `G2:H${MAX_ROWS * 4}`, type: "whole", min: 0, error: "Isi bilangan bulat 0 atau lebih." },
  ];
  return buildXlsx([data, guide, reference], validations);
}
