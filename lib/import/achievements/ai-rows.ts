/**
 * Shape of the AI extraction result and its conversion into a sheet that goes
 * through the normal achievement pipeline (mapping, normalisation, student
 * matching, duplicates, preview, confirmation). The model copies values as
 * written; all normalisation stays in our own code (CLAUDE.md §9.3 step 5).
 */
import { z } from "zod";
import type { SheetData } from "../sheet";

const confidence = z.number().describe("Keyakinan 0 sampai 1 bahwa nilai ini tepat seperti di sumber.");

export const AiAchievementSchema = z.object({
  rows: z.array(
    z.object({
      tanggal: z.string().describe("Tanggal prestasi persis seperti tertulis; kosong bila tidak ada."),
      sekolah: z.string().describe("Nama/kode sekolah bila tertulis; kosong bila tidak ada."),
      nama_siswa: z.string().describe("Nama siswa; untuk tim pisahkan dengan koma. Kosong bila tidak ada."),
      kelas: z.string(),
      nama_lomba: z.string(),
      bidang: z.string().describe("Bidang/cabang/nomor lomba bila ada."),
      tingkat: z.string().describe("Tingkat persis seperti tertulis, mis. 'Kota Bandung', 'Nasional'."),
      peringkat: z.string().describe("Hasil persis seperti tertulis, mis. 'Juara 2', 'Medali Emas', 'Peserta'."),
      penyelenggara: z.string(),
      catatan: z.string().describe("Informasi lain yang relevan dari sumber; kosong bila tidak ada."),
      keyakinan: z.object({
        tanggal: confidence,
        nama_siswa: confidence,
        nama_lomba: confidence,
        tingkat: confidence,
        peringkat: confidence,
      }),
    }),
  ),
  catatan_umum: z.string().describe("Masalah membaca sumber (tulisan buram, terpotong, dsb.); kosong bila tidak ada."),
});

export type AiAchievements = z.infer<typeof AiAchievementSchema>;

/** Fields below this confidence are flagged for the user to check against the source. */
export const AI_CONFIDENCE_THRESHOLD = 0.7;

const FIELD_LABEL: Record<keyof AiAchievements["rows"][number]["keyakinan"], string> = {
  tanggal: "tanggal",
  nama_siswa: "nama siswa",
  nama_lomba: "nama lomba",
  tingkat: "tingkat",
  peringkat: "peringkat",
};

export const AI_SHEET_HEADERS = ["Tanggal", "Sekolah", "Nama Siswa/Tim", "Kelas", "Nama Lomba", "Bidang", "Tingkat", "Peringkat", "Penyelenggara", "Catatan", "Catatan AI"];

/** One sheet in the canonical layout; the "Catatan AI" column lists low-confidence fields per row. */
export function aiResultToSheet(result: AiAchievements): SheetData {
  const v = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    name: "Hasil ekstraksi AI",
    rows: [
      AI_SHEET_HEADERS,
      ...result.rows.map((r) => {
        const unsure = (Object.keys(FIELD_LABEL) as (keyof typeof FIELD_LABEL)[])
          .filter((k) => r.keyakinan[k] < AI_CONFIDENCE_THRESHOLD && (k === "nama_siswa" ? r.nama_siswa : r[k]).trim() !== "")
          .map((k) => FIELD_LABEL[k]);
        return [
          v(r.tanggal),
          v(r.sekolah),
          v(r.nama_siswa),
          v(r.kelas),
          v(r.nama_lomba),
          v(r.bidang),
          v(r.tingkat),
          v(r.peringkat),
          v(r.penyelenggara),
          v(r.catatan),
          unsure.length ? unsure.join(", ") : null,
        ];
      }),
    ],
  };
}

/**
 * Pasted text that is already a table (copied from Excel/Sheets: tab-separated,
 * or ;/| separated with a consistent column count) needs no AI at all.
 */
export function looksTabular(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return false;
  for (const sep of ["\t", ";", "|"]) {
    const counts = lines.map((l) => l.split(sep).length);
    if (counts[0]! >= 3 && counts.filter((c) => c === counts[0]).length / counts.length >= 0.8) return true;
  }
  return false;
}
