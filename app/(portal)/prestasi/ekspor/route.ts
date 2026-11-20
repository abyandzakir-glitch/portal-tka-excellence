import type { NextRequest } from "next/server";
import { CATEGORY_LABEL, LEVEL_LABEL, RANK_LABEL } from "@/lib/achievements/labels";
import { achievementsPdf, achievementsXlsx } from "@/lib/achievements/export";
import { loadAchievementPage } from "@/lib/achievements/page";
import { formatDateTimeId } from "@/lib/tka/datetime";

/** Management report export (§8.2): Excel and PDF, RLS-scoped, same filters as the dashboard. */
export async function GET(req: NextRequest) {
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { f, ctx, data } = await loadAchievementPage(raw);
  const filterLabel = [
    f.tingkat ? `Tingkat: ${f.tingkat === "KOSONG" ? "tidak diketahui" : LEVEL_LABEL[f.tingkat]}` : null,
    f.kategori ? `Kategori: ${f.kategori === "KOSONG" ? "belum dikategorikan" : CATEGORY_LABEL[f.kategori]}` : null,
    f.peringkat ? `Peringkat: ${f.peringkat === "KOSONG" ? "tanpa peringkat baku" : RANK_LABEL[f.peringkat]}` : null,
    f.peserta ? `Peserta: ${f.peserta}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const meta = {
    title: `Rekap Prestasi ${data.school?.name ?? "Sekolah Talenta Juara"}`,
    periodLabel: data.view.period.label,
    filterLabel,
    generatedAt: formatDateTimeId(new Date()),
    schoolCode: (id: string) => ctx.schools.find((s) => s.id === id)?.code ?? "",
  };
  const base = `Rekap_Prestasi_${data.school?.code ?? "Jaringan"}_${data.view.period.start}_${data.view.period.end}`;
  const pdf = raw.format === "pdf";
  const bytes = pdf ? await achievementsPdf(data.view, meta) : achievementsXlsx(data.view, meta);
  return new Response(new Blob([bytes as BlobPart]), {
    headers: {
      "Content-Type": pdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.${pdf ? "pdf" : "xlsx"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
