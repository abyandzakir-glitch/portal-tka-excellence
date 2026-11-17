import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { formatDateTimeId } from "@/lib/tka/datetime";
import { interventionGroupsPdf, interventionGroupsXlsx } from "@/lib/tka/intervention-export";
import { loadInterventionGroups } from "@/lib/tka/load";
import { withTka } from "@/lib/tka/page";

/** Export intervention groups (§7.2d) as Excel or PDF. Data is RLS-scoped. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const params = Object.fromEntries(sp.entries());
  const format = sp.get("format") === "pdf" ? "pdf" : "xlsx";
  const includeDeveloping = sp.get("berkembang") === "1";
  const user = await requireUser();
  const { ctx, data, subjectName } = await withTka(params, async (tx, c) => {
    // School-level roles can only export their own school.
    const code = user.schoolCode ?? c.filters.sekolah;
    const school = c.schools.find((s) => s.code === code) ?? null;
    return school ? { school, groups: await loadInterventionGroups(tx, c, school, includeDeveloping) } : null;
  });
  if (!data) return new Response("Pilih sekolah terlebih dahulu.", { status: 400 });

  const meta = {
    schoolName: data.school.name,
    subjectName,
    periodLabel: ctx.period.label,
    includeDeveloping,
    generatedAt: formatDateTimeId(new Date()),
  };
  const base = `Kelompok_Intervensi_${data.school.code}_${ctx.filters.mapel}`;
  const headers = (type: string, ext: string) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${base}.${ext}"`,
    "Cache-Control": "private, no-store",
  });
  if (format === "pdf") {
    const bytes = await interventionGroupsPdf(data.groups, meta);
    return new Response(new Blob([bytes as BlobPart]), { headers: headers("application/pdf", "pdf") });
  }
  const bytes = interventionGroupsXlsx(data.groups, meta);
  return new Response(new Blob([bytes as BlobPart]), {
    headers: headers("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
  });
}
