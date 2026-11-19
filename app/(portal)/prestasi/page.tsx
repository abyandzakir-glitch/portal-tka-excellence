import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowDownRight, ArrowUpRight, FileDown, History, Plus, Trophy, Upload } from "lucide-react";
import { DiagonalMotif } from "@/components/brand/diagonal-motif";
import { SchoolBadge } from "@/components/brand/logo";
import { EmptyState, PageHeader } from "@/components/layout/page";
import { CategoryBars, SchoolLevelBars, SplitBar, TrendChart } from "@/components/prestasi/charts";
import { AchievementFilterBar } from "@/components/prestasi/filter-bar";
import { ChartCard, MiniTable } from "@/components/tka/chart-card";
import { FilterBar } from "@/components/tka/filter-bar";
import { DashboardSkeleton } from "@/components/tka/skeleton";
import { canWriteData } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { isSchoolCode } from "@/lib/brand/schools";
import { CATEGORIES, CATEGORY_LABEL, LEVEL_LABEL, LEVELS, RANK_LABEL } from "@/lib/achievements/labels";
import { loadAchievementView, parseAchievementFilters } from "@/lib/achievements/load";
import { formatDate, formatNumber, formatPercent } from "@/lib/format/id";
import { withTka } from "@/lib/tka/page";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Prestasi" };

export default function PrestasiPage(props: PageProps<"/prestasi">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

function Delta({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (!previous) return <span>{label}: {formatNumber(previous)}</span>;
  const diff = current - previous;
  const Icon = diff >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon aria-hidden="true" className={cn("size-3.5", diff >= 0 ? "text-status-cakap" : "text-status-intervensi")} />
      {diff >= 0 ? "+" : ""}
      {formatPercent(diff / previous)} vs {label} ({formatNumber(previous)})
    </span>
  );
}

function Tile(props: { label: string; value: string; note: React.ReactNode; tone?: "blue" | "red" | "sky" }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-white p-4">
      <DiagonalMotif variant="corner" tone={props.tone ?? "sky"} className="absolute right-0 top-0 size-7" />
      <p className="pr-6 text-sm text-brand-gray-light">{props.label}</p>
      <p className="mt-1 font-heading text-3xl font-semibold">{props.value}</p>
      <div className="mt-1 text-xs text-brand-gray-light">{props.note}</div>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/prestasi">["searchParams"] }) {
  const user = await requireUser();
  const raw = await searchParams;
  const f = parseAchievementFilters(raw);
  const { ctx, data, isNetwork } = await withTka(raw, async (tx, c) => {
    const code = user.schoolCode ?? c.filters.sekolah ?? null;
    const school = code ? (c.schools.find((s) => s.code === code) ?? null) : null;
    return { school, view: await loadAchievementView(tx, c, f, school?.id ?? null) };
  });
  const { view, school } = data;
  const qs = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();
  const listHref = (extra: Record<string, string>) => {
    const sp = new URLSearchParams(qs);
    for (const [k, v] of Object.entries(extra)) sp.set(k, v);
    return `/prestasi/daftar?${sp.toString()}`;
  };
  const code = (id: string) => ctx.schools.find((s) => s.id === id)?.code ?? "";
  const prevLabel = "tahun lalu";
  const k = view.kpis;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prestasi"
        description={`Rekap prestasi siswa ${school ? school.name : "lima sekolah"}: per sekolah, tingkat, kategori, dan dari waktu ke waktu.`}
        actions={
          <>
            <a href={`/prestasi/ekspor?${qs}${qs ? "&" : ""}format=xlsx`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-white px-2.5 text-sm text-brand-blue hover:bg-muted">
              <FileDown aria-hidden="true" className="size-4" /> Excel
            </a>
            <a href={`/prestasi/ekspor?${qs}${qs ? "&" : ""}format=pdf`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-white px-2.5 text-sm text-brand-blue hover:bg-muted">
              <FileDown aria-hidden="true" className="size-4" /> PDF
            </a>
            {canWriteData(user.role) ? (
              <>
                <Link href="/input/riwayat?jenis=prestasi" className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-white px-2.5 text-sm text-brand-blue hover:bg-muted">
                  <History aria-hidden="true" className="size-4" /> Riwayat unggahan
                </Link>
                <Link href="/input/unggah/prestasi" className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-white px-2.5 text-sm text-brand-blue hover:bg-muted">
                  <Upload aria-hidden="true" className="size-4" /> Unggah rekap
                </Link>
                <Link href="/prestasi/tambah" className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-blue px-2.5 text-sm text-white hover:bg-brand-blue/90">
                  <Plus aria-hidden="true" className="size-4" /> Tambah prestasi
                </Link>
              </>
            ) : null}
          </>
        }
      />
      <FilterBar
        years={ctx.years}
        schools={isNetwork ? ctx.schools.map((s) => ({ code: s.code, name: s.name })) : undefined}
        currentSchool={school?.code ?? null}
        showSubject={false}
        schoolParam
        allSchoolsOption
        periodLabel={`${view.period.label} · dibandingkan ${formatDate(view.previous.start)} – ${formatDate(view.previous.end)}`}
      />
      <AchievementFilterBar />

      {k.total === 0 && k.previousTotal === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Belum ada prestasi pada periode ini"
          description="Coba ubah periode atau filter, atau tambahkan data prestasi."
          action={canWriteData(user.role) ? { href: "/input/unggah/prestasi", label: "Unggah rekap prestasi" } : undefined}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Total prestasi" value={formatNumber(k.total)} note={<Delta current={k.total} previous={k.previousTotal} label={prevLabel} />} />
            <Tile label="Siswa berprestasi (unik)" value={formatNumber(k.students)} note={<Delta current={k.students} previous={k.previousStudents} label={prevLabel} />} tone="sky" />
            <Tile label="Tingkat nasional & internasional" value={formatNumber(k.nationalPlus)} note={<Delta current={k.nationalPlus} previous={k.previousNationalPlus} label={prevLabel} />} tone="red" />
            <Tile label="Poin Prestasi" value={formatNumber(k.points)} note="Bobot tingkat × peringkat (lihat Pengaturan)" />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard
              className="xl:col-span-2"
              title="Prestasi per sekolah dan tingkat"
              period={view.period.label}
              table={
                <MiniTable
                  head={["Sekolah", ...LEVELS.map((l) => LEVEL_LABEL[l]), "Tidak diketahui", "Total"]}
                  rows={view.schools.map((s) => {
                    const c = view.bySchoolLevel[s.id]!;
                    return [s.code, ...LEVELS.map((l) => c[l]), c.KOSONG, Object.values(c).reduce((a, b) => a + b, 0)];
                  })}
                />
              }
            >
              <SchoolLevelBars rows={view.schools.map((s) => ({ label: s.code, href: listHref({ sekolah: s.code }), counts: view.bySchoolLevel[s.id]! }))} />
            </ChartCard>
            <ChartCard title="Akademik vs Non-Akademik" subtitle="Akademik = Akademik + Teknologi (bisa diubah di Pengaturan)" period={view.period.label}>
              <SplitBar
                parts={[
                  { label: "Akademik", value: view.academic.academic, color: "#1E5FA8" },
                  { label: "Non-Akademik", value: view.academic.nonAcademic, color: "#C2410C" },
                  { label: "Belum dikategorikan", value: view.academic.unknown, color: "#9A9A9E" },
                ]}
              />
            </ChartCard>
          </div>

          <ChartCard title="Matriks sekolah × tingkat" subtitle="Klik angka untuk melihat daftar prestasinya" period={view.period.label}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-brand-gray-light">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Sekolah</th>
                    {LEVELS.map((l) => (
                      <th key={l} scope="col" className="py-1.5 pr-3 text-right font-medium">{LEVEL_LABEL[l]}</th>
                    ))}
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">Tidak diketahui</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {view.schools.map((s) => {
                    const c = view.bySchoolLevel[s.id]!;
                    const total = Object.values(c).reduce((a, b) => a + b, 0);
                    return (
                      <tr key={s.id} className="border-t border-border/60">
                        <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                          {isSchoolCode(s.code) ? <SchoolBadge code={s.code} name={s.name} size={16} /> : s.name}
                        </th>
                        {[...LEVELS, "KOSONG" as const].map((l) => (
                          <td key={l} className="py-1.5 pr-3 text-right tabular-nums">
                            {c[l] ? <Link href={listHref({ sekolah: s.code, tingkat: l })} className="text-brand-blue hover:underline">{c[l]}</Link> : <span className="text-brand-gray-light">0</span>}
                          </td>
                        ))}
                        <td className="py-1.5 text-right font-semibold tabular-nums">
                          <Link href={listHref({ sekolah: s.code })} className="text-brand-blue hover:underline">{total}</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Prestasi per kategori" period={view.period.label}>
              <CategoryBars
                rows={[...CATEGORIES.map((c) => ({ label: CATEGORY_LABEL[c], value: view.byCategory[c], href: listHref({ kategori: c }) })), { label: "Belum dikategorikan", value: view.byCategory.KOSONG, href: listHref({ kategori: "KOSONG" }) }]}
              />
              <p className="mt-3 text-xs text-brand-gray-light">
                Individu {formatNumber(view.byParticipant.individu)} · Tim {formatNumber(view.byParticipant.tim)}
                {view.byParticipant.tanpa_nama ? ` · Tanpa nama ${formatNumber(view.byParticipant.tanpa_nama)}` : ""}
              </p>
            </ChartCard>
            <ChartCard
              title="Tren prestasi"
              period={view.period.label}
              table={<MiniTable head={["Bulan", "Jumlah", "Kumulatif"]} rows={view.monthly.map((m) => [m.key, m.count, m.cumulative])} />}
            >
              <TrendChart monthly={view.monthly} weekly={view.weekly} />
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard title="Peringkat Poin Prestasi antarsekolah" subtitle="Bobot tingkat × peringkat" period={view.period.label}>
              <ol className="space-y-2 text-sm">
                {view.pointsBySchool.map((p, i) => (
                  <li key={p.schoolId} className="flex items-center gap-2">
                    <span className="w-5 text-brand-gray-light">{i + 1}.</span>
                    <span className="font-mono text-xs">{code(p.schoolId)}</span>
                    <span className="ml-auto font-semibold tabular-nums">{formatNumber(p.points)}</span>
                    <span className="w-24 text-right text-xs text-brand-gray-light">{formatNumber(p.count)} prestasi</span>
                  </li>
                ))}
              </ol>
            </ChartCard>
            <ChartCard title="Prestasi terbaru" subtitle="10 data terakhir yang masuk">
              <ul className="space-y-2.5 text-sm">
                {view.latest.map((a) => {
                  const c = code(a.schoolId);
                  return (
                    <li key={a.id} className="border-b border-border/60 pb-2 last:border-0">
                      <p className="flex items-center gap-2">
                        {isSchoolCode(c) ? <SchoolBadge code={c} size={14} /> : null}
                        <span className="font-mono text-xs text-brand-gray-light">{c}</span>
                        <span className="ml-auto text-xs text-brand-gray-light">{formatDate(a.achievedOn)}</span>
                      </p>
                      <p className="font-medium">{a.rank ? RANK_LABEL[a.rank] : "Prestasi"} · {a.competitionName}</p>
                      <p className="text-xs text-brand-gray-light">
                        {a.participants.map((p) => p.rawName).join(", ") || "Tanpa nama"}
                        {a.level ? ` · ${LEVEL_LABEL[a.level]}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </ChartCard>
            <ChartCard title="Siswa dengan prestasi terbanyak" period={view.period.label}>
              <ol className="space-y-1.5 text-sm">
                {view.top.map((t, i) => (
                  <li key={t.key} className="flex items-center gap-2">
                    <span className="w-5 text-brand-gray-light">{i + 1}.</span>
                    {t.studentId ? (
                      <Link href={`/tka/siswa/${t.studentId}`} className="truncate text-brand-blue hover:underline">{t.name}</Link>
                    ) : (
                      <span className="truncate" title="Belum tercocokkan dengan data siswa">{t.name}*</span>
                    )}
                    <span className="font-mono text-xs text-brand-gray-light">{code(t.schoolId)}</span>
                    <span className="ml-auto tabular-nums">{t.count}×</span>
                    <span className="w-14 text-right text-xs text-brand-gray-light tabular-nums">{formatNumber(t.points)} poin</span>
                  </li>
                ))}
              </ol>
              {view.top.some((t) => !t.studentId) ? <p className="mt-2 text-xs text-brand-gray-light">* nama belum tercocokkan dengan data siswa</p> : null}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
