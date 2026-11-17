import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { schools, subjects, tryouts, tryoutSchools } from "@/lib/db/schema";
import { todayIso } from "@/lib/format/id";
import { cognitiveLevelsFor, loadCompetencies, loadRoster, loadSubjects, loadTryoutItems } from "@/lib/import/db/context";
import { buildAchievementTemplate } from "@/lib/import/templates/achievements";
import { buildBlueprintTemplate, buildPracticeTemplate, buildResultsTemplate } from "@/lib/import/templates/tka";
import { parseWeekStart } from "@/lib/import/values";

/**
 * Downloadable templates (CLAUDE.md §9.2). Data comes from RLS queries, so a
 * school admin can only download a pre-filled student list of their own school.
 */
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function file(bytes: Uint8Array, filename: string) {
  return new Response(new Blob([bytes as BlobPart], { type: XLSX_TYPE }), {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function notFound(message: string) {
  return new Response(message, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

const id = z.uuid();
const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");

export async function GET(req: NextRequest, ctx: RouteContext<"/input/template/[jenis]">) {
  const user = await requireUser(["super_admin", "school_admin"]);
  const { jenis } = await ctx.params;
  const q = req.nextUrl.searchParams;
  const ownSchool = user.role === "school_admin" ? user.schoolId : null;

  if (jenis === "kisi") {
    const subjectId = id.safeParse(q.get("mapel"));
    if (!subjectId.success) return notFound("Pilih mapel terlebih dahulu.");
    const count = Math.min(Math.max(Number(q.get("jumlah")) || 40, 1), 200);
    const data = await queryAsUser(async (tx) => {
      const [subject] = await tx.select().from(subjects).where(eq(subjects.id, subjectId.data)).limit(1);
      if (!subject) return null;
      const comps = (await loadCompetencies(tx, [subject.id])).get(subject.id) ?? [];
      return { subject, comps };
    });
    if (!data) return notFound("Mapel tidak ditemukan.");
    const level = data.subject.level.toUpperCase();
    const bytes = buildBlueprintTemplate({
      subjectName: data.subject.name,
      levelLabel: level,
      competencies: data.comps,
      cognitiveLevels: cognitiveLevelsFor(data.subject.level, data.subject.code),
      itemCount: count,
    });
    return file(bytes, `Template_Kisi_TO_${slug(data.subject.name)}_${level}.xlsx`);
  }

  if (jenis === "hasil") {
    const tryoutId = id.safeParse(q.get("to"));
    const schoolId = ownSchool ?? q.get("sekolah");
    if (!tryoutId.success || !schoolId || !id.safeParse(schoolId).success) return notFound("Pilih try out dan sekolah terlebih dahulu.");
    const data = await queryAsUser(async (tx) => {
      const [t] = await tx.select().from(tryouts).where(eq(tryouts.id, tryoutId.data)).limit(1);
      const [s] = await tx.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
      if (!t || !s) return null;
      const participants = await tx.select().from(tryoutSchools).where(eq(tryoutSchools.tryoutId, t.id));
      if (!participants.some((p) => p.schoolId === s.id)) return null;
      const [items, roster] = await Promise.all([loadTryoutItems(tx, t.id), loadRoster(tx, s.id)]);
      return { t, s, items, roster };
    });
    if (!data) return notFound("Try out atau sekolah tidak ditemukan.");
    const bytes = buildResultsTemplate({
      tryoutName: data.t.name,
      schoolName: data.s.name,
      itemNumbers: data.items.map((i) => i.number),
      students: data.roster.students,
    });
    return file(bytes, `Template_Hasil_TO_${slug(data.t.name)}_${data.s.schoolCode}.xlsx`);
  }

  if (jenis === "latihan") {
    const schoolId = ownSchool ?? q.get("sekolah");
    if (!schoolId || !id.safeParse(schoolId).success) return notFound("Pilih sekolah terlebih dahulu.");
    const week = parseWeekStart(q.get("pekan") || todayIso()) ?? parseWeekStart(todayIso())!;
    const data = await queryAsUser(async (tx) => {
      const [s] = await tx.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
      if (!s) return null;
      const subjectList = await loadSubjects(tx, s.level);
      const [roster, comps] = await Promise.all([loadRoster(tx, s.id), loadCompetencies(tx, subjectList.map((x) => x.id))]);
      return { s, subjectList, roster, comps: subjectList.flatMap((x) => comps.get(x.id) ?? []) };
    });
    if (!data) return notFound("Sekolah tidak ditemukan.");
    const bytes = buildPracticeTemplate({
      schoolName: data.s.name,
      weekStart: week,
      subjects: data.subjectList,
      competencies: data.comps,
      students: data.roster.students,
    });
    return file(bytes, `Template_Latihan_Pekanan_${data.s.schoolCode}_${week}.xlsx`);
  }

  if (jenis === "prestasi") {
    const requested = ownSchool ?? q.get("sekolah");
    const data = await queryAsUser(async (tx) => {
      const list = await tx.select({ id: schools.id, code: schools.schoolCode, name: schools.name }).from(schools);
      return { list, chosen: requested && id.safeParse(requested).success ? (list.find((s) => s.id === requested) ?? null) : null };
    });
    const bytes = buildAchievementTemplate({ schools: data.list.sort((a, b) => a.code.localeCompare(b.code)), schoolCode: data.chosen?.code ?? null });
    return file(bytes, `Template_Prestasi${data.chosen ? `_${data.chosen.code}` : ""}.xlsx`);
  }

  return notFound("Template tidak dikenal.");
}
