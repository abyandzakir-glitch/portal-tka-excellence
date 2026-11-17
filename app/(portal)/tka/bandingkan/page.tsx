import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowDownRight, ArrowUpRight, GitCompare } from "lucide-react";
import { z } from "zod";
import { EmptyState, PageHeader } from "@/components/layout/page";
import { ChartCard, MiniTable } from "@/components/tka/chart-card";
import { DashboardSkeleton } from "@/components/tka/skeleton";
import { TkaNav } from "@/components/tka/tka-nav";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatNumber } from "@/lib/format/id";
import { listComparableTryouts, loadComparison } from "@/lib/tka/load";
import { withTka } from "@/lib/tka/page";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "TKA — Perbandingan TO" };

const pct = (r: number | null) => (r == null ? "–" : `${(r * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`);
const signed = (v: number | null, unit = "") => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })}${unit}`);
const selectClass = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky";

export default function ComparePage(props: PageProps<"/tka/bandingkan">) {
  return (
    <>
      <PageHeader title="Perbandingan Try Out" description="Bandingkan dua try out pada mapel dan jenjang yang sama: perubahan nilai per siswa dan perubahan penguasaan per kompetensi." />
      <Suspense fallback={<DashboardSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/tka/bandingkan">["searchParams"] }) {
  const user = await requireUser();
  const raw = await searchParams;
  const aId = typeof raw.a === "string" && z.uuid().safeParse(raw.a).success ? raw.a : null;
  const bId = typeof raw.b === "string" && z.uuid().safeParse(raw.b).success ? raw.b : null;

  const { ctx, data, query } = await withTka(raw, async (tx, c) => {
    const code = user.schoolCode ?? c.filters.sekolah ?? null;
    const school = code ? (c.schools.find((s) => s.code === code) ?? null) : null;
    const tryouts = await listComparableTryouts(tx, c, school?.id ?? null);
    const view = aId && bId ? await loadComparison(tx, c, aId, bId, school?.id ?? null) : null;
    return { school, tryouts, view };
  });
  const { school, tryouts, view } = data;
  const byGroup = new Map<string, typeof tryouts>();
  for (const t of tryouts) {
    const key = `${t.subjectCode === "MAT" ? "Matematika" : "Bahasa Indonesia"} ${t.level.toUpperCase()}`;
    byGroup.set(key, [...(byGroup.get(key) ?? []), t]);
  }
  const options = [...byGroup.entries()].map(([label, list]) => (
    <optgroup key={label} label={label}>
      {list.map((t) => (
        <option key={t.id} value={t.id}>{t.name} ({formatDate(t.date)})</option>
      ))}
    </optgroup>
  ));
  const withChange = view?.students.filter((s) => s.change != null) ?? [];
  const improved = [...withChange].sort((a, b) => b.change! - a.change!).slice(0, 5);
  const declined = [...withChange].sort((a, b) => a.change! - b.change!).slice(0, 5);

  return (
    <div className="space-y-6">
      <TkaNav active="bandingkan" query={query} schoolCode={school?.code} />
      <form method="get" className="grid items-end gap-3 rounded-lg border border-border bg-white p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
        {ctx.filters.ta ? <input type="hidden" name="ta" value={ctx.filters.ta} /> : null}
        {user.schoolCode ? null : (
          <div className="space-y-1">
            <Label htmlFor="sekolah">Sekolah</Label>
            <select id="sekolah" name="sekolah" defaultValue={school?.code ?? ""} className={selectClass}>
              <option value="">Semua sekolah</option>
              {ctx.schools.map((s) => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="a">Try out awal</Label>
          <select id="a" name="a" defaultValue={aId ?? ""} className={selectClass} required>
            <option value="">Pilih TO…</option>
            {options}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="b">Try out pembanding</Label>
          <select id="b" name="b" defaultValue={bId ?? ""} className={selectClass} required>
            <option value="">Pilih TO…</option>
            {options}
          </select>
        </div>
        <Button type="submit" size="lg">
          <GitCompare aria-hidden="true" /> Bandingkan
        </Button>
      </form>

      {!aId || !bId ? (
        <EmptyState icon={GitCompare} title="Pilih dua try out" description="Pilih try out awal dan pembanding dengan mapel dan jenjang yang sama, misalnya TO 3 dan TO 4 Matematika SD." />
      ) : !view ? (
        <EmptyState icon={GitCompare} title="Try out tidak bisa dibandingkan" description="Pastikan kedua try out memiliki mapel dan jenjang yang sama dan diikuti sekolah yang dipilih." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: view.a.name, value: view.averageA },
              { label: view.b.name, value: view.averageB },
            ].map((x) => (
              <div key={x.label} className="rounded-lg border border-border bg-white p-4">
                <p className="text-sm text-brand-gray-light">Rata-rata · {x.label}</p>
                <p className="font-heading text-3xl font-semibold">{x.value == null ? "–" : formatNumber(x.value)}</p>
              </div>
            ))}
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-sm text-brand-gray-light">Perubahan rata-rata</p>
              <p className="font-heading text-3xl font-semibold">{view.averageA != null && view.averageB != null ? signed(Math.round((view.averageB - view.averageA) * 100) / 100, " poin") : "–"}</p>
              <p className="text-xs text-brand-gray-light">{school?.name ?? "Semua sekolah"} · {withChange.length} siswa ikut kedua TO</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {[
              { title: "Paling meningkat", list: improved, icon: ArrowUpRight, tone: "text-status-cakap" },
              { title: "Paling menurun", list: declined, icon: ArrowDownRight, tone: "text-status-intervensi" },
            ].map((box) => (
              <ChartCard key={box.title} title={box.title} subtitle="5 siswa">
                <ol className="space-y-1.5 text-sm">
                  {box.list.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <Link href={`/tka/siswa/${s.id}${query}`} className="text-brand-blue hover:underline">{s.fullName}</Link>
                      <span className="flex items-center gap-2 tabular-nums">
                        <span className="text-brand-gray-light">{formatNumber(s.scoreA ?? 0)} → {formatNumber(s.scoreB ?? 0)}</span>
                        <span className={cn("inline-flex items-center font-medium", box.tone)}>
                          <box.icon aria-hidden="true" className="size-3.5" />
                          {signed(s.change)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </ChartCard>
            ))}
          </div>

          <ChartCard title="Perubahan penguasaan per kompetensi" subtitle="% benar di masing-masing TO (hanya butir TO, tanpa latihan)">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-brand-gray-light">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Sub-kompetensi</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">{view.a.name}</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">{view.b.name}</th>
                    <th scope="col" className="py-1.5 font-medium">Perubahan</th>
                  </tr>
                </thead>
                <tbody>
                  {view.competencies.map((c) => (
                    <tr key={c.id} className="border-t border-border/60">
                      <td className="py-1.5 pr-3">{c.name}<span className="block text-xs text-brand-gray-light">{c.elementName}</span></td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{pct(c.ratioA)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{pct(c.ratioB)}</td>
                      <td className="py-1.5">
                        {c.change == null ? (
                          <span className="text-brand-gray-light">Tidak diuji di salah satu TO</span>
                        ) : (
                          <span className={cn("inline-flex items-center gap-1 tabular-nums", c.change > 0.005 ? "text-status-cakap" : c.change < -0.005 ? "text-status-intervensi" : "text-brand-gray-light")}>
                            {c.change > 0.005 ? <ArrowUpRight aria-hidden="true" className="size-3.5" /> : c.change < -0.005 ? <ArrowDownRight aria-hidden="true" className="size-3.5" /> : null}
                            {signed(Math.round(c.change * 1000) / 10, " poin %")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard
            title="Nilai per siswa"
            subtitle={`${view.students.length} siswa`}
            table={<MiniTable head={["Nama", "Kelas", view.a.name, view.b.name, "Perubahan"]} rows={view.students.map((s) => [s.fullName, s.className ?? "–", s.scoreA == null ? "–" : formatNumber(s.scoreA), s.scoreB == null ? "–" : formatNumber(s.scoreB), signed(s.change)])} />}
          >
            <p className="text-sm text-brand-gray-light">Klik “Lihat tabel” untuk daftar lengkap nilai setiap siswa di kedua TO.</p>
          </ChartCard>
        </>
      )}
    </div>
  );
}
