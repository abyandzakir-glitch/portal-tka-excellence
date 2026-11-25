import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { AlertTriangle, ClipboardList } from "lucide-react";
import { Suspense } from "react";
import { EmptyState, PageHeader, TableSkeleton } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { LEVEL_LABEL } from "@/lib/brand/schools";
import { formatDate, formatNumber } from "@/lib/format/id";
import { listSchools } from "@/lib/queries/imports";
import { normalizeTryoutName } from "@/lib/tka/tryouts";
import { MergeButton, SchoolsForm } from "./tryout-forms";

export const metadata: Metadata = { title: "Try Out" };

export default function TryoutsPage() {
  return (
    <>
      <PageHeader
        title="Try Out"
        description="Satu try out (satu kisi-kisi) dipakai bersama oleh semua sekolah pesertanya, dan tiap sekolah boleh melaksanakannya di tanggal berbeda. Atur sekolah peserta dan tanggalnya, dan gabungkan try out kembar yang terlanjur dibuat terpisah."
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <TryoutList />
      </Suspense>
    </>
  );
}

interface Row {
  id: string;
  name: string;
  date: string;
  level: "sd" | "smp";
  subject: string;
  subject_id: string;
  year_id: string;
  year: string;
  owner: string | null;
  items: number;
  /** school id -> sitting date. */
  school_dates: Record<string, string>;
  results: { school_id: string; n: number }[];
}

async function TryoutList() {
  await requireUser(["super_admin"]);
  const [rows, schoolList] = await queryAsUser((tx) =>
    Promise.all([
      tx.execute<Row & Record<string, unknown>>(sql`
        select t.id, t.name, t.date::text as date, t.level, s.name as subject, t.subject_id, t.academic_year_id as year_id, y.label as year,
               o.school_code as owner,
               (select count(*)::int from public.tryout_items i where i.tryout_id = t.id) as items,
               coalesce((select jsonb_object_agg(ts.school_id, ts.date::text) from public.tryout_schools ts where ts.tryout_id = t.id), '{}') as school_dates,
               coalesce((select jsonb_agg(jsonb_build_object('school_id', x.school_id, 'n', x.n))
                           from (select school_id, count(*)::int as n from public.tryout_scores sc where sc.tryout_id = t.id group by school_id) x), '[]') as results
          from public.tryouts t
          join public.subjects s on s.id = t.subject_id
          join public.academic_years y on y.id = t.academic_year_id
          left join public.schools o on o.id = t.owner_school_id
         order by y.start_date desc, t.level, s.sort_order, t.name, t.date`),
      listSchools(tx),
    ]),
  );
  if (!rows.length) return <EmptyState icon={ClipboardList} title="Belum ada try out" description="Try out dibuat saat kisi-kisinya diunggah di Input Pekanan." />;

  const groups = new Map<string, Row[]>();
  for (const r of rows as unknown as Row[]) {
    const key = `${r.year_id}|${r.subject_id}|${normalizeTryoutName(r.name)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const code = (id: string) => schoolList.find((s) => s.id === id)?.code ?? "?";
  const duplicates = [...groups.values()].filter((g) => g.length > 1);

  return (
    <div className="space-y-4">
      {duplicates.length ? (
        <p className="flex items-start gap-2 rounded-lg border border-status-berkembang/40 bg-status-berkembang-tint p-3 text-sm">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-status-berkembang" />
          <span>
            Ada <strong>{duplicates.length} try out kembar</strong> (nama, mapel, dan tahun ajaran sama). Gabungkan supaya pilihan di Unggah Hasil TO dan Perbandingan TO tidak ambigu.
          </span>
        </p>
      ) : null}
      {[...groups.values()].map((g) => {
        const first = g[0]!;
        const dup = g.length > 1;
        return (
          <section
            key={first.id}
            aria-label={`${first.name}, ${first.subject}`}
            className={`rounded-lg border bg-white p-4 ${dup ? "border-status-berkembang" : "border-border"}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-base font-semibold">{first.name}</h2>
                <p className="text-sm text-brand-gray-light">
                  {first.subject} · <Badge variant="secondary">{LEVEL_LABEL[first.level]}</Badge> · TA {first.year}
                </p>
              </div>
              {dup ? <MergeButton ids={g.map((r) => r.id)} name={first.name} count={g.length} /> : null}
            </div>
            <ul className="mt-3 divide-y divide-border">
              {g.map((r) => {
                const total = r.results.reduce((a, x) => a + x.n, 0);
                return (
                  <li key={r.id} className="grid gap-2 py-3 md:grid-cols-[1fr_auto] md:items-start">
                    <div className="text-sm">
                      <p>
                        <span className="font-medium">{formatDate(r.date)}</span> (tanggal acuan) · {r.owner ? `milik ${r.owner}` : "TO jaringan"} ·{" "}
                        {r.items ? `${r.items} soal` : "belum ada kisi-kisi"} · {formatNumber(total)} nilai siswa
                        {r.results.length ? ` (${r.results.map((x) => `${code(x.school_id)} ${x.n}`).join(", ")})` : ""}
                      </p>
                    </div>
                    <SchoolsForm
                      tryoutId={r.id}
                      date={r.date}
                      schools={schoolList.filter((s) => s.level === r.level).map((s) => ({ id: s.id, code: s.code }))}
                      dates={r.school_dates}
                      locked={r.results.map((x) => x.school_id)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
