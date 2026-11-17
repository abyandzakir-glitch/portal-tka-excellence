import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page";
import { ChartCard, ChartEmpty, MiniTable } from "@/components/tka/chart-card";
import { HistogramMultiples, LineTrend } from "@/components/tka/charts";
import { FilterBar } from "@/components/tka/filter-bar";
import { Heatmap, WeakestList } from "@/components/tka/heatmap";
import { KpiRow } from "@/components/tka/kpi";
import { DashboardSkeleton } from "@/components/tka/skeleton";
import { TkaNav } from "@/components/tka/tka-nav";
import { requireUser } from "@/lib/auth/session";
import { formatNumber, formatPercent, formatWeek } from "@/lib/format/id";
import { schoolStyle } from "@/lib/tka/colors";
import { loadNetworkView } from "@/lib/tka/load";
import { withTka } from "@/lib/tka/page";

export const metadata: Metadata = { title: "TKA Dashboard" };

export default function TkaPage(props: PageProps<"/tka">) {
  return (
    <>
      <PageHeader title="TKA Dashboard" description="Progres persiapan Tes Kemampuan Akademik di lima sekolah: nilai try out, latihan pekanan, dan penguasaan kompetensi." />
      <Suspense fallback={<DashboardSkeleton />}>
        <NetworkContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function NetworkContent({ searchParams }: { searchParams: PageProps<"/tka">["searchParams"] }) {
  const user = await requireUser();
  const raw = await searchParams;
  // School-level roles only ever see their own school.
  if (user.role === "school_admin" || user.role === "teacher") {
    const qs = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();
    redirect(`/tka/sekolah/${user.schoolCode}${qs ? `?${qs}` : ""}`);
  }
  const { ctx, data, query, subjectName } = await withTka(raw, (tx, c) => loadNetworkView(tx, c));
  const period = ctx.period.label;
  const target = data.kpis.target;
  const hasScores = data.trend.some((s) => s.points.some((p) => p.average != null));

  return (
    <div className="space-y-6">
      <TkaNav active="ringkasan" query={query} />
      <FilterBar years={ctx.years} schools={ctx.schools.map((s) => ({ code: s.code, name: s.name }))} currentSchool={null} periodLabel={period} />
      <KpiRow kpis={data.kpis} subjectName={subjectName} />

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title={`Tren rata-rata nilai TO per sekolah · ${subjectName}`}
          period={period}
          table={
            <MiniTable
              head={["Sekolah", "Try out", "Tanggal", "Rata-rata", "Siswa"]}
              rows={data.trend.flatMap((s) => s.points.map((p) => [s.label, p.tryoutName, p.date, p.average == null ? "–" : formatNumber(p.average), p.n]))}
            />
          }
        >
          {hasScores ? (
            <LineTrend
              ariaLabel={`Grafik garis rata-rata nilai ${subjectName} per sekolah untuk setiap try out`}
              unit="score"
              xFormat="date"
              yDomain={[0, 100]}
              target={target}
              series={data.trend.map((s) => ({
                id: s.id,
                label: s.label,
                style: schoolStyle(s.label),
                points: s.points.map((p) => ({ x: p.date, value: p.average, note: `${p.n} siswa` })),
              }))}
            />
          ) : (
            <ChartEmpty message="Belum ada data TO untuk periode ini." action={{ href: "/input/unggah/hasil", label: "Unggah hasil TO" }} />
          )}
        </ChartCard>

        <ChartCard title="5 kompetensi terlemah di jaringan" subtitle={subjectName} period={period}>
          <WeakestList items={data.weakest} href={(id) => `/tka/kompetensi/${id}${query}`} />
        </ChartCard>
      </div>

      <ChartCard title={`Penguasaan kompetensi per sekolah · ${subjectName}`} subtitle="% penguasaan gabungan TO (70%) dan latihan (30%)" period={period}>
        {data.heatmap.rows.length ? (
          <Heatmap
            data={data.heatmap}
            colHeading="sekolah"
            caption={`Penguasaan kompetensi ${subjectName} per sekolah`}
            href={(comp, school) => `/tka/kompetensi/${comp}${query}${query ? "&" : "?"}sekolah=${ctx.schools.find((s) => s.id === school)?.code ?? ""}`}
          />
        ) : (
          <ChartEmpty message="Belum ada kerangka kompetensi untuk mapel ini." />
        )}
      </ChartCard>

      <ChartCard
        title={`Sebaran nilai TO terakhir per sekolah · ${subjectName}`}
        period={period}
        table={
          <MiniTable
            head={["Sekolah", "Try out", "n", "Min", "Q1", "Median", "Q3", "Maks"]}
            rows={data.distribution.map((d) => [d.label, d.tryoutName ?? "–", d.summary?.n ?? 0, ...(d.summary ? [d.summary.min, d.summary.q1, d.summary.median, d.summary.q3, d.summary.max].map((v) => formatNumber(v)) : ["–", "–", "–", "–", "–"])])}
          />
        }
      >
        <HistogramMultiples groups={data.distribution.map((d) => ({ ...d, note: d.tryoutName ? `${d.tryoutName} · ${d.summary?.n ?? 0} siswa` : null, style: schoolStyle(d.label) }))} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["attempted", "accuracy"] as const).map((m) => (
          <ChartCard
            key={m}
            title={m === "attempted" ? `Soal latihan dikerjakan per pekan · ${subjectName}` : `Akurasi latihan per pekan · ${subjectName}`}
            period={period}
            table={
              <MiniTable
                head={["Sekolah", "Pekan", "Dikerjakan", "Akurasi"]}
                rows={data.practice.flatMap((s) => s.weeks.map((w) => [s.label, formatWeek(w.weekStart), formatNumber(w.attempted), formatPercent(w.accuracy)]))}
              />
            }
          >
            {data.practice.some((s) => s.weeks.length) ? (
              <LineTrend
                ariaLabel={m === "attempted" ? "Grafik jumlah soal latihan per pekan per sekolah" : "Grafik akurasi latihan per pekan per sekolah"}
                unit={m === "attempted" ? "count" : "percent"}
                xFormat="week"
                yDomain={m === "accuracy" ? [0, 1] : undefined}
                height={220}
                series={data.practice.map((s) => ({
                  id: s.id,
                  label: s.label,
                  style: schoolStyle(s.label),
                  points: s.weeks.map((w) => ({ x: w.weekStart, value: m === "attempted" ? w.attempted : w.accuracy })),
                }))}
              />
            ) : (
              <ChartEmpty message="Belum ada log latihan untuk periode ini." action={{ href: "/input/unggah/latihan", label: "Unggah latihan pekanan" }} />
            )}
          </ChartCard>
        ))}
      </div>
    </div>
  );
}
