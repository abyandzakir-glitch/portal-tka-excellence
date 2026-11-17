/**
 * Achievement Smart Import on the four layouts seen in the schools' real recaps
 * (DECISIONS.md Fase 4). Every file here is an ANONYMISED IMITATION: same
 * structure and value styles, dummy names and events only.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { dedupKey, validateAchievements, type AchievementContext } from "@/lib/import/achievements/validate";
import { Roster } from "@/lib/import/lookup";
import { autoMap, missingRequired } from "@/lib/import/mapping";
import { buildRowInputs, detectLayout, fieldSetFor } from "@/lib/import/pipeline";
import { readTabularFile, type Cell } from "@/lib/import/sheet";
import { buildAchievementTemplate } from "@/lib/import/templates/achievements";

const SCHOOLS = [
  { id: "sch-cmh", code: "SDTJCMH", name: "SD Talenta Juara Cimahi" },
  { id: "sch-smp", code: "SMPTJBDG", name: "SMP Talenta Juara Bandung" },
];
const rosterCmh = new Roster([
  { id: "c1", nis: "1", nisn: null, fullName: "Alya Rahmawati", className: "5A" },
  { id: "c2", nis: "2", nisn: null, fullName: "Bima Saputra", className: "2A" },
  { id: "c3", nis: "3", nisn: null, fullName: "Citra Lestari", className: "4A" },
]);
const rosterSmp = new Roster([
  { id: "s1", nis: "1", nisn: null, fullName: "Dimas Pratama", className: "8A" },
  { id: "s2", nis: "2", nisn: null, fullName: "Eka Wulandari", className: "7B" },
  { id: "s3", nis: "3", nisn: null, fullName: "Farhan Akbar", className: "9A" },
]);
const ctx = (batchSchoolId: string | null, existingKeys: Set<string> = new Set()): AchievementContext => ({
  schools: SCHOOLS,
  batchSchoolId,
  rosters: new Map([
    ["sch-cmh", rosterCmh],
    ["sch-smp", rosterSmp],
  ]),
  academicYear: { startYear: 2026 },
  today: "2026-11-17",
  existingKeys,
});

function xlsx(sheets: { name: string; rows: Cell[][]; merges?: XLSX.Range[] }[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.merges) ws["!merges"] = s.merges;
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

function run(bytes: Uint8Array, name: string, batchSchoolId: string | null, remap?: (cols: (string | null)[], headers: string[]) => (string | null)[]) {
  const sheets = readTabularFile(bytes, name);
  const set = fieldSetFor("achievements");
  const layout = detectLayout(sheets, set)!;
  const columns = remap ? remap(layout.columns, layout.headers) : layout.columns;
  const rows = buildRowInputs(sheets[layout.sheetIndex]!.rows, layout.headerRowIndex, columns);
  return { layout, columns, result: validateAchievements(rows, ctx(batchSchoolId)), missing: missingRequired(columns, set) };
}
const saved = (r: ReturnType<typeof validateAchievements>) => r.rows.filter((x) => x.data).map((x) => x.data!);

// ---------------------------------------------------------------------------
describe("pola A — tabel rata, 'Tingkat, Kota' digabung, hasil bebas, tanggal rentang (SD)", () => {
  const file = xlsx([
    {
      name: "Sheet1",
      rows: [
        ["No", "TANGGAL", "NAMA SISWA", "KELAS", "NAMA PERLOMBAAN/ EVENT", "PENYELENGGARA LOMBA", "JENIS/BIDANG PERLOMBAAN", "TINGKAT, KOTA PERLOMBAAN", "HASIL PERLOMBAAN", null],
        [1, "28 Juni 2026", "Alya Rahmawati", "5A", "OLIMPIADE SAINS NUSANTARA 2026", "Lembaga Kompetisi Contoh", "Bahasa Inggris", "Nasional, Yogyakarta-Online", "Medali Perak", "Medali Emas (1), Medali Perak (2)"],
        [2, "Maret-Juni 2026", "Alya Rahmawati", "5A", "OLIMPIADE SAINS CERIA", "Penyelenggara Sains Contoh", "Sains", "Nasional, Online", "Medali Honorable Mention", null],
        [3, "9 Agustus 2026", "Bima Saputra", "2A", "KEJUARAAN RENANG CONTOH", null, "Swimming, 25 meter gaya bebas", "Kota", "Medali Partisipasi", null],
        [4, 46243, "Citra Lestari", "4A", "TURNAMEN SEPAK BOLA CONTOH CUP", "Klub Contoh FC", "Sepak Bola", "Kota", "Juara 1 Kategori Champion", null],
        [5, "14-16 Agustus 2026", "Citra Lestari", "4A", "KEJUARAAN TAEKWONDO CONTOH", "Dojang Contoh", "Taekwondo", "Jawa Barat", "Juara 2 Kyorugi Pracadet B", null],
        [6, "17-18 Oktober 2027", "Bima Saputra", "2A", "LOMBA TARI CONTOH", "Sanggar Contoh", "Tari", "Bandung Raya", "Juara Harapan 3", null],
      ],
    },
    { name: "Laporan", rows: [["No", "NAMA SISWA", "Bidang"], [1, "Alya Rahmawati", "Sains"]] },
  ]);
  const { result, missing, layout } = run(file, "Daftar Prestasi.xlsx", "sch-cmh");

  it("memilih sheet data dan memetakan semua kolom wajib", () => {
    expect(layout.sheetIndex).toBe(0);
    expect(missing).toEqual([]);
    expect(result.rows.filter((r) => r.status === "error")).toEqual([]);
  });

  it("menormalkan tingkat, peringkat, kategori, dan tanggal sesuai keputusan", () => {
    const [osn, ceria, renang, bola, tkd, tari] = saved(result);
    expect(osn).toMatchObject({ achievedOn: "2026-06-28", level: "NASIONAL", rank: "MEDALI_PERAK", category: "AKADEMIK", participants: [{ studentId: "c1" }] });
    expect(osn!.notes).toContain("Tingkat/lokasi: Nasional, Yogyakarta-Online");
    expect(osn!.notes).toContain("Kelas: 5A");
    expect(ceria).toMatchObject({ achievedOn: "2026-03-01", rank: null });
    expect(ceria!.notes).toContain("Tanggal perkiraan (asli: Maret-Juni 2026)");
    expect(ceria!.notes).toContain("Hasil asli: Medali Honorable Mention");
    expect(renang).toMatchObject({ category: "OLAHRAGA", level: "KOTA_KABUPATEN", rank: null });
    expect(bola).toMatchObject({ achievedOn: "2026-08-09", rank: "JUARA_1", category: "OLAHRAGA" }); // Excel serial 46243
    expect(tkd).toMatchObject({ achievedOn: "2026-08-14", level: "PROVINSI", rank: "JUARA_2" });
    expect(tari).toMatchObject({ level: null, rank: "HARAPAN", category: "SENI_BUDAYA" });
  });

  it("menandai hal yang perlu dicek (tanpa padanan, tahun di masa depan)", () => {
    const status = (n: number) => result.rows.find((r) => r.rowNumber === n)!;
    expect(status(3).status).toBe("warning"); // honorable mention
    expect(status(4).status).toBe("warning"); // partisipasi
    expect(status(7).issues.map((i) => i.message).join(" ")).toMatch(/belum terjadi/); // 2027 typo
    expect(status(7).issues.map((i) => i.message).join(" ")).toMatch(/Bandung Raya/);
  });
});

// ---------------------------------------------------------------------------
describe("pola B — tabel rekap angka di atas, tabel rinci di bawah, tanpa nama siswa (SD)", () => {
  const recap = (title: string): Cell[][] => [
    [title],
    [null],
    [null],
    ["No.", "Prestasi", "Level", null, null, null, null, null],
    [null, null, "Kecamatan", "Kabupaten/Kota", "Provinsi", "Nasional", "Internasional", "Total"],
    [1, "Juara 1", null, 1, null, null, null, 1],
    [2, "Medali Perak", null, null, 1, null, null, 1],
    ["Total", null, null, null, null, null, null, 2],
    [null],
  ];
  const rows: Cell[][] = [
    ...recap("AKADEMIK"),
    ...recap("NON AKADEMIK"),
    [null],
    ["No", "Tanggal", "Nama Perlombaan/ Event", "Jenis Perlombaan", "Skala/ Tingkatan Perlombaan", "Hasil Perlombaan", null],
    [1, "8 Februari 2026", "Kejuaraan Renang Pelajar Contoh", "Lomba Renang Gaya Bebas", "Kota", "Silver Medal", 1],
    [2, "8 Februari 2026", "Kejuaraan Renang Pelajar Contoh", "Lomba Renang Gaya Dada", "Kota", "Gold Medal", null],
    [3, "7 Maret 2026", "Festival Anak Saleh Contoh", "Lomba Tahfidz", "Kecamatan", "Juara 2", 2],
    [4, 46131, "Olimpiade Sains Contoh", "IPA", "Nasional", "Juara 2", 3],
  ];
  const { result, layout } = run(xlsx([{ name: "Januari-Juni", rows, merges: [{ s: { r: 3, c: 2 }, e: { r: 3, c: 6 } }] }]), "Daftar Prestasi 2.xlsx", "sch-cmh");

  it("menemukan tabel rinci di bawah tabel rekap", () => {
    expect(layout.headerRowIndex).toBe(19);
    expect(saved(result)).toHaveLength(4);
  });
  it("membaca Gold/Silver Medal, kecamatan, dan baris tanpa nama", () => {
    const [silver, gold, tahfidz, ipa] = saved(result);
    expect(silver).toMatchObject({ rank: "MEDALI_PERAK", level: "KOTA_KABUPATEN", category: "OLAHRAGA", participants: [] });
    expect(gold!.rank).toBe("MEDALI_EMAS");
    expect(tahfidz).toMatchObject({ level: null, category: "NON_AKADEMIK" });
    expect(tahfidz!.notes).toContain("Tingkat asli: Kecamatan");
    expect(ipa).toMatchObject({ achievedOn: "2026-04-19", level: "NASIONAL", category: "AKADEMIK" }); // serial 46131
    expect(result.rows.find((r) => r.data === silver)!.issues.some((i) => /Nama siswa kosong/.test(i.message))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("pola C — judul bergabung, tanpa nama lomba, tim, tanggal tanpa tahun (SMP)", () => {
  const rows: Cell[][] = [
    [null],
    [null, "PRESTASI", null, null, null, null, null, null],
    [null],
    [null, "Nama", "Kelas", "Bidang", "Tingkat", "Juara", "Penyelenggara", "Tanggal"],
    [null, "Dimas Pratama", "Kelas 8", "Olimpiade Matematika", "Kabupaten/Kota", "Juara 2", "Dinas Pendidikan Contoh", null],
    [null, "Eka Wulandari", "Kelas 7", "Sepak Bola", "Provinsi", "Juara 3", "Asosiasi Contoh", 46251],
    [null, "Dimas Pratama, Eka Wulandari, Farhan Akbar dan Gilang", "Kelas 7, 8 dan 9", "Esay", "Kabupaten/Kota", "Juara 2", "SMP Contoh", "4 Agustus 2026"],
    [null, "Farhan Akbar", "Kelas 9", "Ekonomi", "Nasional", "Bronze ", "Lembaga Sains Contoh", "Agustus"],
  ];
  const { result } = run(xlsx([{ name: "Juli-November", rows, merges: [{ s: { r: 1, c: 1 }, e: { r: 1, c: 7 } }] }]), "prestasi smp.xlsx", "sch-smp");

  it("memakai bidang sebagai nama lomba dan mewajibkan tanggal", () => {
    const first = result.rows[0]!;
    expect(first.status).toBe("error"); // empty date
    expect(first.issues.map((i) => i.message).join(" ")).toMatch(/Tanggal kosong/);
    const [bola] = saved(result);
    expect(bola).toMatchObject({ competitionName: "Sepak Bola", achievedOn: "2026-08-17", rank: "JUARA_3", category: "OLAHRAGA" }); // serial 46251
  });
  it("memecah tim, mencocokkan nama, dan menyimpan nama yang tidak dikenal apa adanya", () => {
    const team = saved(result).find((a) => a.competitionName === "Esay")!;
    expect(team.participants).toEqual([
      { studentId: "s1", rawName: "Dimas Pratama" },
      { studentId: "s2", rawName: "Eka Wulandari" },
      { studentId: "s3", rawName: "Farhan Akbar" },
      { studentId: null, rawName: "Gilang" },
    ]);
    expect(team.notes).toContain("Kelas: Kelas 7, 8 dan 9");
    const eko = saved(result).find((a) => a.competitionName === "Ekonomi")!;
    expect(eko).toMatchObject({ achievedOn: "2026-08-01", rank: "MEDALI_PERUNGGU" });
    expect(eko.notes).toContain("Tanggal perkiraan (asli: Agustus)");
  });
});

// ---------------------------------------------------------------------------
describe("pola D — kolom salah judul, baris contoh, peringkat dengan angka (SMP)", () => {
  const rows: Cell[][] = [
    [null],
    [null, "PRESTASI", null, null],
    [null],
    [null, "Nama Lomba", "Tingkat", "Juara", "Tanggal"],
    [null, "Contoh: Aisyah Putri", "Kabupaten/Kota", "Juara 2", "1 Januari 2026"],
    [null, "Dimas", "Provinsi", "Emas (6)", "12 Februari 2026"],
    [null, "Eka", "Wilayah Bantim", "Terbaik", "3 Maret 2026"],
  ];
  const bytes = xlsx([{ name: "Januari-Juli", rows, merges: [{ s: { r: 1, c: 1 }, e: { r: 1, c: 3 } }] }]);

  it("tanpa koreksi, isi kolom salah dibaca sebagai nama lomba (wajar: judulnya memang 'Nama Lomba')", () => {
    const { columns, layout } = run(bytes, "x.xlsx", "sch-smp");
    expect(columns[layout.headers.indexOf("Nama Lomba")]).toBe("competition");
  });

  it("setelah pengguna memetakan kolom itu ke Nama Siswa/Tim, baris contoh dilewati dan nama panggilan disimpan apa adanya", () => {
    const { result } = run(bytes, "x.xlsx", "sch-smp", (cols, headers) => cols.map((c, i) => (headers[i] === "Nama Lomba" ? "participants" : c)));
    expect(result.rows[0]!.status).toBe("skipped"); // "Contoh: …"
    // No competition name and no bidang -> error asking to fill it in.
    expect(result.rows[1]!.issues.map((i) => i.message).join(" ")).toMatch(/Nama lomba kosong/);
  });
});

// ---------------------------------------------------------------------------
describe("template standar & file jaringan dengan kolom Sekolah", () => {
  const filled = (() => {
    const wb = XLSX.read(buildAchievementTemplate({ schools: SCHOOLS }), { type: "array" });
    XLSX.utils.sheet_add_aoa(
      wb.Sheets["Data Prestasi"]!,
      [
        ["12/11/2026", "SDTJCMH", "Alya Rahmawati", "Olimpiade Sains Contoh", "AKADEMIK", "NASIONAL", "JUARA_1", "Lembaga Contoh", "https://contoh.test/sertifikat/1", null],
        ["2026-11-10", "SMPTJBDG", "Dimas Pratama, Eka Wulandari", "Lomba Debat Contoh", "AKADEMIK", "PROVINSI", "FINALIS", "Universitas Contoh", null, "Tim"],
        ["2026-11-01", "SDTJCMH", "Citra Lestari", "Festival Seni Contoh", "SENI_BUDAYA", null, null, null, "sertifikat ada di guru", "Medali Partisipasi"],
      ],
      { origin: "A2" },
    );
    return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  })();

  it("template terbaca tanpa pemetaan manual; kolom Sekolah menentukan sekolah tiap baris", () => {
    const { result, missing } = run(filled, "Template_Prestasi.xlsx", null);
    expect(missing).toEqual([]);
    const [a, b, c] = saved(result);
    expect(a).toMatchObject({ schoolId: "sch-cmh", level: "NASIONAL", rank: "JUARA_1", evidenceUrl: "https://contoh.test/sertifikat/1" });
    expect(b).toMatchObject({ schoolId: "sch-smp", rank: "FINALIS", participants: [{ studentId: "s1" }, { studentId: "s2" }] });
    expect(c).toMatchObject({ evidenceUrl: null, category: "SENI_BUDAYA" });
    expect(c!.notes).toContain("Bukti: sertifikat ada di guru");
  });

  it("admin sekolah tidak bisa menyelipkan baris sekolah lain", () => {
    const { result } = run(filled, "Template_Prestasi.xlsx", "sch-cmh");
    expect(result.rows.find((r) => r.rowNumber === 3)!.issues[0]!.message).toMatch(/milik SMPTJBDG/);
  });
});

describe("satu siswa, dua nomor lomba di kejuaraan yang sama (pola nyata)", () => {
  it("bukan duplikat bila bidang/nomornya berbeda", () => {
    const rows: Cell[][] = [
      ["Tanggal", "Nama Siswa", "Nama Lomba", "Bidang", "Juara"],
      ["9 Agustus 2026", "Bima Saputra", "Kejuaraan Renang Contoh", "25 meter gaya bebas", "Medali Partisipasi"],
      ["9 Agustus 2026", "Bima Saputra", "Kejuaraan Renang Contoh", "25 meter meluncur", "Medali Partisipasi"],
    ];
    const sheets = readTabularFile(xlsx([{ name: "S", rows }]), "x.xlsx");
    const r = validateAchievements(buildRowInputs(sheets[0]!.rows, 0, autoMap(rows[0]!.map(String), fieldSetFor("achievements")).columns), ctx("sch-cmh"));
    expect(r.rows.map((x) => x.status)).toEqual(["warning", "warning"]); // partisipasi = perlu dicek, bukan duplikat
  });
});

describe("unggah ulang rekap kumulatif & duplikat", () => {
  const rows: Cell[][] = [
    ["Tanggal", "Nama Siswa", "Nama Lomba", "Tingkat", "Juara"],
    ["1 Oktober 2026", "Alya Rahmawati", "Lomba A", "Kota", "Juara 1"],
    ["5 Oktober 2026", "Bima Saputra", "Lomba B", "Kota", "Juara 2"],
    ["5 Oktober 2026", "Bima Saputra", "Lomba B", "Kota", "Juara 2"],
  ];
  const sheets = readTabularFile(xlsx([{ name: "S", rows }]), "x.xlsx");
  const cols = autoMap(rows[0]!.map(String), fieldSetFor("achievements")).columns;
  const inputs = buildRowInputs(sheets[0]!.rows, 0, cols);

  it("duplikat di dalam file = bermasalah; yang sudah tersimpan = dilewati", () => {
    const stored = new Set([dedupKey({ schoolId: "sch-cmh", achievedOn: "2026-10-01", competitionName: "lomba a", field: "", names: ["Alya  Rahmawati"] })]);
    const r = validateAchievements(inputs, ctx("sch-cmh", stored));
    expect(r.rows.map((x) => x.status)).toEqual(["skipped", "warning", "error"]);
    expect(r.rows[2]!.issues.map((i) => i.message)).toContain("Duplikat dengan baris 3 (siswa, lomba, dan tanggal sama).");
    expect(r.fileIssues[0]!.message).toMatch(/1 prestasi sudah tersimpan sebelumnya dan dilewati/);
  });
});
