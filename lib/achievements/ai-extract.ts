import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ImportError } from "@/lib/import/db/config";
import { AiAchievementSchema, aiResultToSheet } from "@/lib/import/achievements/ai-rows";
import type { SheetData } from "@/lib/import/sheet";

/**
 * AI extraction for free text, PDFs and photos (CLAUDE.md §9.3 step 5).
 *
 * Privacy (§9.3): only the uploaded content is sent — never the student list
 * (names are matched on our own server afterwards). Callers must check the
 * "ai.extraction_enabled" setting first. The result is never saved directly:
 * it becomes a sheet that goes through the normal preview and confirmation.
 */

export type AiSource =
  | { kind: "text"; text: string }
  | { kind: "pdf"; data: Uint8Array }
  | { kind: "image"; data: Uint8Array; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" };

const SYSTEM = `Anda membantu admin sekolah Indonesia memindahkan rekap prestasi siswa ke tabel.
Ekstrak SETIAP prestasi dari sumber menjadi satu baris. Untuk lomba tim, satu baris berisi semua nama anggota dipisah koma.

Aturan penting:
- Salin nilai PERSIS seperti tertulis di sumber. Jangan menerjemahkan, menormalkan, atau menebak (mis. jangan mengubah "Kab." menjadi "Kabupaten", jangan menambah tahun yang tidak tertulis).
- Bila suatu informasi tidak ada di sumber, isi dengan string kosong.
- Isi "keyakinan" (0–1) per kolom: rendah bila tulisan buram, terpotong, ambigu, atau Anda menyimpulkannya dari konteks.
- Abaikan ucapan selamat, emoji, dan kalimat yang bukan data prestasi.
- Bila sumber tidak berisi prestasi sama sekali, kembalikan daftar baris kosong dan jelaskan di catatan_umum.`;

export function aiModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());
}

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

export async function extractAchievements(source: AiSource): Promise<{ sheet: SheetData; generalNote: string; rows: number }> {
  if (!aiConfigured()) {
    throw new ImportError("Fitur AI belum dikonfigurasi di server (kunci API belum diisi). Hubungi Super Admin.");
  }
  const client = new Anthropic();

  const content: Anthropic.Beta.BetaContentBlockParam[] =
    source.kind === "text"
      ? [{ type: "text", text: `Rekap prestasi:\n\n${source.text}` }]
      : source.kind === "pdf"
        ? [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(source.data) } },
            { type: "text", text: "Ekstrak prestasi dari dokumen ini." },
          ]
        : [
            { type: "image", source: { type: "base64", media_type: source.mediaType, data: b64(source.data) } },
            { type: "text", text: "Ekstrak prestasi dari gambar ini (sertifikat, poster, atau rekap)." },
          ];

  let response;
  try {
    response = await client.beta.messages.parse({
      model: aiModel(),
      max_tokens: 16000,
      system: SYSTEM,
      // Server-side fallback: a policy decline is retried on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(AiAchievementSchema) },
      messages: [{ role: "user", content }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new ImportError("Kunci API AI tidak valid atau tidak punya akses. Hubungi Super Admin.");
    }
    if (error instanceof Anthropic.RateLimitError) throw new ImportError("Layanan AI sedang sibuk. Coba lagi beberapa menit lagi.");
    if (error instanceof Anthropic.BadRequestError) {
      console.error("[ai] bad request:", error.message);
      throw new ImportError("File tidak bisa diproses oleh AI (mungkin terlalu besar atau rusak). Coba file lain atau ketik datanya.");
    }
    if (error instanceof Anthropic.APIConnectionError) throw new ImportError("Layanan AI tidak dapat dihubungi. Periksa koneksi lalu coba lagi.");
    if (error instanceof Anthropic.APIError) {
      console.error("[ai] api error:", error.status, error.message);
      throw new ImportError("Layanan AI sedang bermasalah. Coba lagi nanti.");
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new ImportError("AI menolak memproses konten ini. Masukkan datanya lewat template atau input manual.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ImportError("Dokumen terlalu panjang untuk diproses sekaligus. Bagi menjadi beberapa bagian lalu unggah satu per satu.");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new ImportError("Hasil AI tidak bisa dibaca. Coba lagi, atau masukkan datanya lewat template.");
  if (!parsed.rows.length) {
    throw new ImportError(`AI tidak menemukan data prestasi di sumber ini.${parsed.catatan_umum ? ` (${parsed.catatan_umum})` : ""}`);
  }
  return { sheet: aiResultToSheet(parsed), generalNote: parsed.catatan_umum, rows: parsed.rows.length };
}
