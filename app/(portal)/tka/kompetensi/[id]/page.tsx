import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { StatusBadge } from "@/components/tka/status";
import { requireUser } from "@/lib/auth/session";
import { MASTERY_STATUS_LABEL } from "@/lib/metrics/mastery";
import { loadCompetencyStudents } from "@/lib/tka/load";
import { withTka } from "@/lib/tka/page";

export const metadata: Metadata = { title: "TKA — Penguasaan Kompetensi" };

const pct = (r: number | null) => (r == null ? "–" : `${(r * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`);

export default function CompetencyPage(props: PageProps<"/tka/kompetensi/[id]">) {
  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <Content params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content(props: { params: PageProps<"/tka/kompetensi/[id]">["params"]; searchParams: PageProps<"/tka/kompetensi/[id]">["searchParams"] }) {
  const user = await requireUser();
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  const raw = await props.searchParams;
  const classId = typeof raw.kelas === "string" && z.uuid().safeParse(raw.kelas).success ? raw.kelas : null;

  const { ctx, data, query } = await withTka(raw, async (tx, c) => {
    const code = user.schoolCode ?? c.filters.sekolah ?? null;
    const school = code ? (c.schools.find((s) => s.code === code) ?? null) : null;
    const view = await loadCompetencyStudents(tx, c, id, school?.id ?? null, classId);
    return view ? { view, school } : null;
  });
  if (!data) notFound();
  const { view, school } = data;
  const className = classId ? view.students[0]?.className : null;
  const back = school ? `/tka/sekolah/${school.code}${query}` : `/tka${query}`;
  const counts = Object.fromEntries((["intervensi", "berkembang", "cakap", "mahir", "kurang_data"] as const).map((s) => [s, view.students.filter((x) => x.mastery.status === s).length]));

  return (
    <div className="space-y-6">
      <nav aria-label="Jejak navigasi" className="text-sm">
        <Link href={back} className="text-brand-blue hover:underline">← Kembali ke dashboard</Link>
      </nav>
      <PageHeader
        title={view.competency.name}
        description={`${view.competency.elementName ?? ""} · ${view.competency.subjectCode === "MAT" ? "Matematika" : "Bahasa Indonesia"} ${view.competency.level.toUpperCase()} · ${school?.name ?? "Semua sekolah"}${className ? ` · Kelas ${className}` : ""} · ${ctx.period.label}`}
      />
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-white p-4">
        <div>
          <p className="text-sm text-brand-gray-light">Penguasaan gabungan</p>
          <p className="font-heading text-3xl font-semibold">{pct(view.pooled.ratio)}</p>
        </div>
        <StatusBadge status={view.pooled.status} />
        <ul className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {Object.entries(counts).map(([s, n]) => (
            <li key={s}>
              {MASTERY_STATUS_LABEL[s as keyof typeof MASTERY_STATUS_LABEL]}: <span className="font-semibold tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <caption className="sr-only">Siswa diurutkan dari penguasaan terendah</caption>
          <thead className="bg-muted/50 text-left text-brand-gray-light">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Nama</th>
              {!school ? <th scope="col" className="px-3 py-2 font-medium">Sekolah</th> : null}
              <th scope="col" className="px-3 py-2 font-medium">Kelas</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Penguasaan</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Butir</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {view.students.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <Link href={`/tka/siswa/${s.id}${query}`} className="font-medium text-brand-blue hover:underline">{s.fullName}</Link>
                  <span className="block text-xs text-brand-gray-light">NIS {s.nis}</span>
                </td>
                {!school ? <td className="px-3 py-2 font-mono text-xs">{s.schoolCode}</td> : null}
                <td className="px-3 py-2">{s.className ?? "–"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(s.mastery.ratio)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.mastery.items}</td>
                <td className="px-3 py-2"><StatusBadge status={s.mastery.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
