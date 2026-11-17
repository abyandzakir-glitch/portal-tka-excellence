import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { SchoolBadge } from "@/components/brand/logo";
import { PageHeader } from "@/components/layout/page";
import { ChartCard, ChartEmpty, MiniTable } from "@/components/tka/chart-card";
import { HistogramMultiples, LineTrend } from "@/components/tka/charts";
import { FilterBar } from "@/components/tka/filter-bar";
import { Heatmap, WeakestList } from "@/components/tka/heatmap";
import { KpiRow } from "@/components/tka/kpi";
import { DashboardSkeleton } from "@/components/tka/skeleton";
import { StudentTable } from "@/components/tka/student-table";
import { TkaNav } from "@/components/tka/tka-nav";
import { requireUser } from "@/lib/auth/session";
import { isSchoolCode } from "@/lib/brand/schools";
import { formatNumber, formatPercent, formatWeek } from "@/lib/format/id";
import { classStyle } from "@/lib/tka/colors";
import { loadSchoolView } from "@/lib/tka/load";
import { withTka } from "@/lib/tka/page";

export const metadata: Metadata = { title: "TKA — Dashboard Sekolah" };

export default function SchoolPage(props: PageProps<"/tka/sekolah/[kode]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <SchoolContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function SchoolContent(props: { params: PageProps<"/tka/sekolah/[kode]">["params"]; searchParams: PageProps<"/tka/sekolah/[kode]">["searchParams"] }) {
  const user = await requireUser();
  const { kode } = await props.params;
  if (!isSchoolCode(kode)) notFound();
  if (user.schoolCode && user.schoolCode !== kode) redirect(`/tka/sekolah/${user.schoolCode}`);

  const { ctx, data, query, subjectName, isNetwork } = await withTka(await props.searchParams, async (tx, c) => {
    const school = c.schools.find((s) => s.code === kode);
    return school ? loadSchoolView(tx, c, school) : null;
  });
  if (!data) notFound();
  const period = ctx.period.label;
  const classIndex = new Map(data.trend.map((t, i) => [t.id, i]));
  const hasScores = data.trend.some((s) => s.points.some((p) => p.average != null));

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.school.name}
        description={
          <span className="inline-flex items-center gap-2">
            {isSchoolCode(data.school.code) ? <SchoolBadge code={data.school.code} size={18} /> : null}
            Dashboard TKA sekolah · {data.kpis.students} siswa kelas akhir
          </span>
        }
      />
      <TkaNav active="ringkasan" query={query} schoolCode={data.school.code} />
      <FilterBar
        years={ctx.years}
        schools={isNetwork ? ctx.schools.map((s) => ({ code: s.code, name: s.name })) : undefined}
        currentSchool={data.school.code}
        periodLabel={period}
      />
      <KpiRow kpis={data.kpis} subjectName={subjectName} />

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title={`Tren rata-rata nilai TO per kelas · ${subjectName}`}
          period={period}
          table={<MiniTable head={["Kelas", "Try out", "Rata-rata", "Siswa"]} rows={data.trend.flatMap((s) => s.points.map((p) => [s.label, p.tryoutName, p.average == null ? "–" : formatNumber(p.average), p.n]))} />}
        >
          {hasScores ? (
            <LineTrend
              ariaLabel={`Grafik rata-rata nilai ${subjectName} per kelas`}
              unit="score"
              xFormat="date"
              yDomain={[0, 100]}
              target={data.kpis.target}
              series={data.trend.map((s) => ({ id: s.id, label: s.label, style: classStyle(classIndex.get(s.id)!), points: s.points.map((p) => ({ x: p.date, value: p.average, note: `${p.n} siswa` })) }))}
            />
          ) : (
            <ChartEmpty message="Belum ada data TO untuk periode ini." action={{ href: "/input/unggah/hasil", label: "Unggah hasil TO" }} />
          )}
        </ChartCard>
        <ChartCard title="5 kompetensi terlemah di sekolah" subtitle={subjectName} period={period}>
          <WeakestList items={data.weakest} href={(id) => `/tka/kompetensi/${id}${query}${query ? "&" : "?"}sekolah=${data.school.code}`} />
        </ChartCard>
      </div>

      <ChartCard title={`Penguasaan kompetensi per kelas · ${subjectName}`} subtitle="% penguasaan gabungan TO (70%) dan latihan (30%)" period={period}>
        <Heatmap
          data={data.heatmap}
          colHeading="kelas"
          caption={`Penguasaan kompetensi ${subjectName} per kelas`}
          href={(comp, cls) => `/tka/kompetensi/${comp}${query}${query ? "&" : "?"}sekolah=${data.school.code}&kelas=${cls}`}
        />
      </ChartCard>

      <ChartCard title={`Sebaran nilai TO terakhir per kelas · ${subjectName}`} period={period}>
        <HistogramMultiples groups={data.distribution.map((d) => ({ ...d, note: d.tryoutName ? `${d.tryoutName} · ${d.summary?.n ?? 0} siswa` : null, style: classStyle(classIndex.get(d.id) ?? 0) }))} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["attempted", "accuracy"] as const).map((m) => (
          <ChartCard
            key={m}
            title={m === "attempted" ? `Soal latihan dikerjakan per pekan · ${subjectName}` : `Akurasi latihan per pekan · ${subjectName}`}
            period={period}
            table={<MiniTable head={["Kelas", "Pekan", "Dikerjakan", "Akurasi"]} rows={data.practice.flatMap((s) => s.weeks.map((w) => [s.label, formatWeek(w.weekStart), formatNumber(w.attempted), formatPercent(w.accuracy)]))} />}
          >
            {data.practice.some((s) => s.weeks.length) ? (
              <LineTrend
                ariaLabel={m === "attempted" ? "Grafik jumlah soal latihan per pekan per kelas" : "Grafik akurasi latihan per pekan per kelas"}
                unit={m === "attempted" ? "count" : "percent"}
                xFormat="week"
                yDomain={m === "accuracy" ? [0, 1] : undefined}
                height={220}
                series={data.practice.map((s) => ({ id: s.id, label: s.label, style: classStyle(classIndex.get(s.id) ?? 0), points: s.weeks.map((w) => ({ x: w.weekStart, value: m === "attempted" ? w.attempted : w.accuracy })) }))}
              />
            ) : (
              <ChartEmpty message="Belum ada log latihan untuk periode ini." action={{ href: "/input/unggah/latihan", label: "Unggah latihan pekanan" }} />
            )}
          </ChartCard>
        ))}
      </div>

      <section aria-labelledby="daftar-siswa" className="space-y-3">
        <h2 id="daftar-siswa" className="text-lg font-semibold">Daftar siswa</h2>
        <StudentTable rows={data.students} query={query} subjectName={subjectName} />
      </section>
    </div>
  );
}
