import "server-only";
import { ImportError } from "../db/config";
import { ImportFileError } from "../sheet";

const GENERIC = "Terjadi kesalahan saat memproses data. Coba lagi; bila berulang, hubungi Super Admin yayasan.";

/**
 * Turns any thrown value into a message that is safe to show (§12): our own
 * ImportError messages pass through; database errors are translated; anything
 * else is logged server-side and replaced by a generic sentence. Raw database
 * errors are never shown — Drizzle includes query parameters (file contents)
 * in its messages.
 */
export function friendlyError(error: unknown): string {
  if (error instanceof ImportError || error instanceof ImportFileError) return error.message;
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  if (/Hanya Super Admin/.test(cause)) return "Hanya Super Admin yang dapat membatalkan data yang sudah disimpan.";
  if (/row-level security|permission denied/i.test(cause)) {
    return "Anda tidak punya akses untuk menyimpan data sekolah tersebut.";
  }
  if (/violates foreign key constraint/i.test(cause)) {
    return "Sebagian data rujukan (siswa, soal, atau kompetensi) berubah sejak pratinjau dibuat. Muat ulang halaman lalu periksa pratinjaunya lagi.";
  }
  console.error("[import]", error instanceof Error ? (error.cause ?? error.message) : error);
  return GENERIC;
}
