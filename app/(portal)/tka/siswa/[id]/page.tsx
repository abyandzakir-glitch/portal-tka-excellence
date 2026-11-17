import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Target } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page";
import { ChartCard, ChartEmpty, MiniTable } from "@/components/tka/chart-card";
import { LineTrend } from "@/components/tka/charts";
import { FilterBar } from "@/components/tka/filter-bar";
import { DashboardSkeleton } from "@/components/tka/skeleton";
import { RiskBadge, STATUS_STYLE, StatusBadge, TrendIndicator } from "@/components/tka/status";
import { formatDate, formatNumber, formatPercent, formatWeek } from "@/lib/format/id";
import { MASTERY_STATUS_LABEL } from "@/lib/metrics/mastery";
import { SINGLE_SERIES } from "@/lib/tka/colors";
import { loadStudentView } from "@/lib/tka/load";
import { withTka } from "@/lib/tka/page";
import { cn } from "@/lib/utils";
import { AddInterventionForm, IV_STATUS, UpdateInterventionForm } from "./intervention-panel";

export const metadata: Metadata = { title: "TKA — Profil Siswa" };

const pct = (r: number | null) => (r == null ? "–" : `${(r * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`);
const single = { color: SINGLE_SERIES, dash: "", marker: "circle" as const };

export default function StudentPage(props: PageProps<"/tka/siswa/[id]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Content params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content(props: { params: PageProps<"/tka/siswa/[id]">["params"]; searchParams: PageProps<"/tka/siswa/[id]">["searchParams"] }) {
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { ctx, data, query, user } = await withTka(await props.searchParams, (tx, c) => loadStudentView(tx, c, id));
  if (!data) notFound();
  const st = data.student;
  const canManage = user.role === "super_admin" || user.role === "school_admin" || user.role === "teacher";
  const period = ctx.period.label;

  return (
    <div className="space-y-6">
      <nav aria-label="Jejak navigasi" className="text-sm">
        <Link href={`/tka/sekolah/${st.schoolCode}${query}`} className="text-brand-blue hover:underline">← {st.schoolName}</Link>
      </nav>
      <PageHeader
        title={st.fullName}
        description={`NIS ${st.nis}${st.nisn ? ` · NISN ${st.nisn}` : ""} · ${st.schoolName} · Kelas ${st.className ?? "–"}`}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-brand-gray-light">Status keseluruhan:</span>
            <StatusBadge status={data.overall} />
            {data.atRisk ? <RiskBadge reasons={data.riskReasons} /> : null}
          </span>
        }
      />
      <FilterBar years={ctx.years} showSubject={false} periodLabel={period} />

      {data.atRisk ? (
        <ul className="space-y-1 rounded-lg border border-status-intervensi/30 bg-status-intervensi-tint p-3 text-sm text-status-intervensi">
          {data.riskReasons.map((r) => (
            <li key={r}>⚠ {r}</li>
          ))}
        </ul>
      ) : null}

      <section aria-labelledby="rekomendasi" className="rounded-lg border border-border bg-white p-4">
        <h2 id="rekomendasi" className="flex items-center gap-2 font-heading text-base font-semibold">
          <Target aria-hidden="true" className="size-5 text-brand-blue" />
          Rekomendasi fokus intervensi
        </h2>
        <p className="text-xs text-brand-gray-light">Penguasaan rendah × bobot kompetensi di kisi-kisi TO, hanya kompetensi dengan data cukup · {period}</p>
        {data.recommendations.length ? (
          <ol className="mt-3 grid gap-3 md:grid-cols-3">
            {data.recommendations.map((r, i) => (
              <li key={r.competencyId} className="rounded-md border border-border p-3">
                <p className="text-xs text-brand-gray-light">Prioritas {i + 1} · {r.subjectName}</p>
                <p className="font-medium">{r.name}</p>
                <p className="mt-1 text-sm">
                  Penguasaan <span className="font-semibold tabular-nums">{pct(r.ratio)}</span> · bobot di kisi-kisi {pct(r.weight)}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-brand-gray-light">Tidak ada kompetensi yang perlu diprioritaskan, atau datanya belum cukup.</p>
        )}
      </section>

      {data.subjects.map((subj) => {
        const hasScores = subj.scores.some((s) => s.score != null);
        return (
          <section key={subj.id} aria-labelledby={`mapel-${subj.code}`} className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 border-b border-border pb-2">
              <h2 id={`mapel-${subj.code}`} className="text-lg font-semibold">{subj.name}</h2>
              <StatusBadge status={subj.status.status} />
              <span className="text-sm text-brand-gray-light">Penguasaan {pct(subj.status.ratio)} dari {subj.status.items} butir</span>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard
                title={`Nilai try out · ${subj.name}`}
                subtitle={`Target ${subj.target}`}
                period={period}
                table={<MiniTable head={["Try out", "Tanggal", "Nilai", "Keterangan"]} rows={subj.scores.map((s) => [s.name, formatDate(s.date), s.score == null ? "–" : formatNumber(s.score), !s.present ? "Absen" : s.hasItemDetail ? "Per butir" : "Nilai total"])} />}
              >
                {hasScores ? (
                  <LineTrend
                    ariaLabel={`Grafik nilai ${subj.name} ${st.fullName} per try out dengan garis target ${subj.target}`}
                    unit="score"
                    xFormat="date"
                    yDomain={[0, 100]}
                    target={subj.target}
                    height={220}
                    series={[{ id: "s", label: st.fullName, style: single, points: subj.scores.map((s) => ({ x: s.date, value: s.score, note: s.name })) }]}
                  />
                ) : (
                  <ChartEmpty message="Belum ada nilai TO pada periode ini." />
                )}
              </ChartCard>
              <ChartCard
                title={`Latihan pekanan · ${subj.name}`}
                subtitle="Jumlah soal dikerjakan"
                period={period}
                table={<MiniTable head={["Pekan", "Dikerjakan", "Akurasi"]} rows={subj.practice.map((p) => [formatWeek(p.weekStart), formatNumber(p.attempted), formatPercent(p.accuracy)])} />}
              >
                {subj.practice.length ? (
                  <LineTrend
                    ariaLabel={`Grafik jumlah soal latihan ${subj.name} per pekan`}
                    unit="count"
                    xFormat="week"
                    height={220}
                    series={[{ id: "a", label: "Soal dikerjakan", style: single, points: subj.practice.map((p) => ({ x: p.weekStart, value: p.attempted, note: `akurasi ${formatPercent(p.accuracy)}` })) }]}
                  />
                ) : (
                  <ChartEmpty message="Belum ada log latihan pada periode ini." />
                )}
              </ChartCard>
            </div>

            <ChartCard title={`Peta penguasaan kompetensi · ${subj.name}`} subtitle="Gabungan TO (70%) dan latihan (30%); tren = 4 pekan terakhir vs sebelumnya" period={period}>
              <ul className="space-y-2.5">
                {subj.competencies.map((c) => {
                  const s = STATUS_STYLE[c.status];
                  return (
                    <li key={c.id} className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                      <span className="min-w-0 text-sm">
                        {c.name}
                        <span className="block truncate text-xs text-brand-gray-light">{c.elementName} · {c.items} butir</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 flex-1 rounded-full bg-muted" aria-hidden="true">
                          <span className={cn("block h-2.5 rounded-full", c.status === "kurang_data" ? "bg-status-kurang-data/40" : "bg-brand-blue")} style={{ width: `${Math.max(2, (c.ratio ?? 0) * 100)}%` }} />
                        </span>
                        <span className="w-14 text-right text-sm tabular-nums">{c.status === "kurang_data" ? "–" : pct(c.ratio)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1 text-xs font-medium", s.text)}>
                          <s.icon aria-hidden="true" className="size-3.5" />
                          {MASTERY_STATUS_LABEL[c.status]}
                        </span>
                        <TrendIndicator direction={c.trend} delta={c.trendDelta} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </ChartCard>

            {subj.wrong.length ? (
              <ChartCard title={`Butir yang salah atau tidak dijawab · ${subj.name}`} subtitle="Dikelompokkan per kompetensi; TO terbaru di atas">
                <div className="space-y-2">
                  {subj.wrong.map((w, i) => (
                    <details key={w.tryoutId} open={i === 0} className="rounded-md border border-border p-3">
                      <summary className="cursor-pointer font-medium">
                        {w.tryoutName} · {w.byCompetency.reduce((a, g) => a + g.items.length, 0)} butir
                      </summary>
                      <ul className="mt-2 space-y-1 text-sm">
                        {w.byCompetency.map((g) => (
                          <li key={g.competencyId ?? "none"}>
                            <span className="font-medium">{g.name}</span>:{" "}
                            {g.items
                              .map((it) => `no. ${it.number}${it.answer ? ` (jawab ${it.answer}${it.key ? `, kunci ${it.key}` : ""})` : " (kosong)"}`)
                              .join("; ")}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              </ChartCard>
            ) : null}
          </section>
        );
      })}

      <section aria-labelledby="intervensi" className="space-y-3 rounded-lg border border-border bg-white p-4">
        <h2 id="intervensi" className="font-heading text-base font-semibold">Catatan intervensi</h2>
        {data.interventions.length ? (
          <ul className="space-y-3">
            {data.interventions.map((iv) => (
              <li key={iv.id} className="rounded-md border border-border p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{iv.action}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{IV_STATUS[iv.status]}</span>
                </p>
                <p className="text-xs text-brand-gray-light">
                  {iv.competencyName ? `${iv.competencyName} · ` : ""}oleh {iv.ownerName ?? "–"} · dicatat {formatDate(iv.createdAt.toISOString().slice(0, 10))}
                  {iv.startedAt ? ` · mulai ${formatDate(iv.startedAt)}` : ""}
                  {iv.endedAt ? ` · selesai ${formatDate(iv.endedAt)}` : ""}
                </p>
                {iv.notes ? <p className="mt-1">{iv.notes}</p> : null}
                {iv.outcome ? <p className="mt-1"><span className="font-medium">Hasil:</span> {iv.outcome}</p> : null}
                {canManage ? <UpdateInterventionForm id={iv.id} status={iv.status} outcome={iv.outcome} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-brand-gray-light">Belum ada catatan intervensi untuk siswa ini.</p>
        )}
        {canManage ? (
          <details className="rounded-md border border-dashed border-border p-3" open={!data.interventions.length}>
            <summary className="cursor-pointer font-medium text-brand-blue">Tambah catatan intervensi</summary>
            <div className="mt-3">
              <AddInterventionForm
                studentId={st.id}
                suggested={data.recommendations[0]?.competencyId}
                competencies={data.subjects.flatMap((s) => s.competencies.map((c) => ({ id: c.id, name: c.name, subject: s.name })))}
              />
            </div>
          </details>
        ) : null}
      </section>
    </div>
  );
}
