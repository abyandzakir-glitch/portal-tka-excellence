import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { todayIso } from "@/lib/format/id";
import { loadManagementReport, managementPdf } from "@/lib/report/management";
import { formatDateTimeId } from "@/lib/tka/datetime";

/** Laporan Manajemen PDF. Network roles only; data is still read through RLS. */
export async function GET(req: NextRequest) {
  await requireUser(["super_admin", "viewer"]);
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const report = await queryAsUser((tx) => loadManagementReport(tx, raw, todayIso()));
  if (!report) redirect("/laporan");
  const bytes = await managementPdf(report, { generatedAt: formatDateTimeId(new Date()) });
  const slug = report.periodLabel.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return new Response(new Blob([bytes as BlobPart]), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Laporan_Manajemen_${slug}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
