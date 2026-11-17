import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Pencil, Trophy } from "lucide-react";
import { EmptyState, PageHeader, TableSkeleton } from "@/components/layout/page";
import { AchievementFilterBar } from "@/components/prestasi/filter-bar";
import { FilterBar } from "@/components/tka/filter-bar";
import { canWriteData } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { CATEGORY_LABEL, LEVEL_LABEL, RANK_LABEL } from "@/lib/achievements/labels";
import { loadAchievementView, parseAchievementFilters } from "@/lib/achievements/load";
import { formatDate, formatNumber } from "@/lib/format/id";
import { withTka } from "@/lib/tka/page";

export const metadata: Metadata = { title: "Daftar Prestasi" };

export default function AchievementListPage(props: PageProps<"/prestasi/daftar">) {
  return (
    <>
      <nav aria-label="Jejak navigasi" className="mb-2 text-sm">
        <Link href="/prestasi" className="text-brand-blue hover:underline">← Dashboard Prestasi</Link>
      </nav>
      <PageHeader title="Daftar Prestasi" description="Semua prestasi sesuai filter. Klik Ubah untuk mengoreksi satu data." />
      <Suspense fallback={<TableSkeleton rows={10} />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/prestasi/daftar">["searchParams"] }) {
  const user = await requireUser();
  const raw = await searchParams;
  const f = parseAchievementFilters(raw);
  const { ctx, data, isNetwork } = await withTka(raw, async (tx, c) => {
    const code = user.schoolCode ?? c.filters.sekolah ?? null;
    const school = code ? (c.schools.find((s) => s.code === code) ?? null) : null;
    return { school, view: await loadAchievementView(tx, c, f, school?.id ?? null) };
  });
  const code = (id: string) => ctx.schools.find((s) => s.id === id)?.code ?? "";
  const canEdit = canWriteData(user.role);
  const rows = data.view.records;

  return (
    <div className="space-y-4">
      <FilterBar
        years={ctx.years}
        schools={isNetwork ? ctx.schools.map((s) => ({ code: s.code, name: s.name })) : undefined}
        currentSchool={data.school?.code ?? null}
        showSubject={false}
        schoolParam
        allSchoolsOption
        periodLabel={data.view.period.label}
      />
      <AchievementFilterBar />
      {rows.length === 0 ? (
        <EmptyState icon={Trophy} title="Tidak ada prestasi yang cocok dengan filter" description="Ubah periode atau filter di atas." />
      ) : (
        <>
          <p className="text-sm text-brand-gray-light" aria-live="polite">{formatNumber(rows.length)} prestasi</p>
          <div className="overflow-x-auto rounded-lg border border-border bg-white">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-muted/50 text-left text-brand-gray-light">
                <tr>
                  {["Tanggal", "Sekolah", "Siswa/Tim", "Nama Lomba", "Kategori", "Tingkat", "Peringkat", "Poin", "Catatan"].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
                  ))}
                  {canEdit ? <th scope="col" className="px-3 py-2"><span className="sr-only">Ubah</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(a.achievedOn)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{code(a.schoolId)}</td>
                    <td className="px-3 py-2">
                      {a.participants.length
                        ? a.participants.map((p, i) => (
                            <span key={i}>
                              {i ? ", " : ""}
                              {p.studentId ? <Link href={`/tka/siswa/${p.studentId}`} className="text-brand-blue hover:underline">{p.rawName}</Link> : <span title="Belum tercocokkan dengan data siswa">{p.rawName}*</span>}
                            </span>
                          ))
                        : <span className="text-brand-gray-light">Tanpa nama</span>}
                    </td>
                    <td className="px-3 py-2">
                      {a.competitionName}
                      {a.evidenceUrl ? (
                        <a href={a.evidenceUrl} target="_blank" rel="noopener noreferrer" className="block text-xs text-brand-blue hover:underline">Bukti ↗</a>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{a.category ? CATEGORY_LABEL[a.category] : "–"}</td>
                    <td className="px-3 py-2">{a.level ? LEVEL_LABEL[a.level] : "–"}</td>
                    <td className="px-3 py-2">{a.rank ? RANK_LABEL[a.rank] : "–"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(a.points)}</td>
                    <td className="max-w-72 px-3 py-2 text-xs text-brand-gray-light">{a.notes ?? ""}</td>
                    {canEdit ? (
                      <td className="px-3 py-2">
                        <Link href={`/prestasi/${a.id}/ubah`} className="inline-flex items-center gap-1 text-brand-blue hover:underline" aria-label={`Ubah prestasi ${a.competitionName}`}>
                          <Pencil aria-hidden="true" className="size-3.5" /> Ubah
                        </Link>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-brand-gray-light">* nama tertulis yang belum tercocokkan dengan data siswa (tetap dihitung).</p>
        </>
      )}
    </div>
  );
}
