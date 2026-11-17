import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileDown, Users } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/layout/page";
import { FilterBar } from "@/components/tka/filter-bar";
import { DashboardSkeleton } from "@/components/tka/skeleton";
import { StatusBadge } from "@/components/tka/status";
import { TkaNav } from "@/components/tka/tka-nav";
import { requireUser } from "@/lib/auth/session";
import { loadInterventionGroups } from "@/lib/tka/load";
import { withTka } from "@/lib/tka/page";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "TKA — Kelompok Intervensi" };

const pct = (r: number | null) => (r == null ? "–" : `${(r * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`);

export default function InterventionGroupsPage(props: PageProps<"/tka/intervensi">) {
  return (
    <>
      <PageHeader
        title="Kelompok Intervensi"
        description="Siswa dikelompokkan per sub-kompetensi yang lemah (lintas kelas dalam satu sekolah), sebagai dasar kelas remedial yang terarah."
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/tka/intervensi">["searchParams"] }) {
  const user = await requireUser();
  const raw = await searchParams;
  const includeDeveloping = raw.berkembang === "1";
  const { ctx, data, query, subjectName, isNetwork } = await withTka(raw, async (tx, c) => {
    // School-level roles are pinned to their own school (RLS enforces it as well).
    const code = user.schoolCode ?? c.filters.sekolah ?? c.schools[0]?.code;
    const school = c.schools.find((s) => s.code === code) ?? c.schools[0]!;
    return { school, groups: await loadInterventionGroups(tx, c, school, includeDeveloping) };
  });
  const schoolQs = `${query}${query ? "&" : "?"}sekolah=${data.school.code}`;
  const toggleHref = `/tka/intervensi${schoolQs}${includeDeveloping ? "" : "&berkembang=1"}`;
  const exportHref = (fmt: string) => `/tka/intervensi/ekspor${schoolQs}${includeDeveloping ? "&berkembang=1" : ""}&format=${fmt}`;
  const total = new Set(data.groups.flatMap((g) => g.students.map((s) => s.id))).size;

  return (
    <div className="space-y-6">
      <TkaNav active="intervensi" query={query} schoolCode={data.school.code} />
      <FilterBar
        years={ctx.years}
        schools={isNetwork ? ctx.schools.map((s) => ({ code: s.code, name: s.name })) : undefined}
        currentSchool={data.school.code}
        periodLabel={`${ctx.period.label} · ${data.school.name}`}
        schoolParam
      />
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={toggleHref}
          aria-pressed={includeDeveloping}
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky",
            includeDeveloping ? "border-brand-blue bg-brand-blue-tint text-brand-blue-dark" : "border-border bg-white",
          )}
        >
          {includeDeveloping ? "✓ " : ""}Sertakan siswa berstatus Berkembang
        </Link>
        <p className="text-sm text-brand-gray-light">
          {data.groups.length} kelompok · {total} siswa unik · {subjectName}
        </p>
        <span className="ml-auto flex gap-2">
          <a href={exportHref("xlsx")} className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-3 py-1.5 text-sm text-brand-blue hover:bg-muted">
            <FileDown aria-hidden="true" className="size-4" /> Excel
          </a>
          <a href={exportHref("pdf")} className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-3 py-1.5 text-sm text-brand-blue hover:bg-muted">
            <FileDown aria-hidden="true" className="size-4" /> PDF
          </a>
        </span>
      </div>

      {data.groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Tidak ada siswa yang perlu intervensi"
          description="Belum ada siswa dengan penguasaan di bawah 50% pada periode ini, atau datanya belum cukup."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.groups.map((g) => (
            <section key={g.competency.id} aria-labelledby={`g-${g.competency.id}`} className="rounded-lg border border-border bg-white p-4">
              <h2 id={`g-${g.competency.id}`} className="font-heading text-base font-semibold">{g.competency.name}</h2>
              <p className="mb-2 text-xs text-brand-gray-light">{g.competency.elementName} · {g.students.length} siswa</p>
              <table className="w-full text-sm">
                <thead className="text-left text-brand-gray-light">
                  <tr>
                    <th scope="col" className="py-1 font-medium">Nama</th>
                    <th scope="col" className="py-1 font-medium">Kelas</th>
                    <th scope="col" className="py-1 text-right font-medium">Penguasaan</th>
                    <th scope="col" className="py-1 pl-2 font-medium"><span className="sr-only">Status</span></th>
                  </tr>
                </thead>
                <tbody>
                  {g.students.map((s) => (
                    <tr key={s.id} className="border-t border-border/60">
                      <td className="py-1.5"><Link href={`/tka/siswa/${s.id}${query}`} className="text-brand-blue hover:underline">{s.fullName}</Link></td>
                      <td className="py-1.5">{s.className ?? "–"}</td>
                      <td className="py-1.5 text-right tabular-nums">{pct(s.ratio)}</td>
                      <td className="py-1.5 pl-2"><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
