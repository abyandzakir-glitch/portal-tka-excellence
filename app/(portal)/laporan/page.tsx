import type { Metadata } from "next";
import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { FileDown } from "lucide-react";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { academicYears } from "@/lib/db/schema";
import { todayIso } from "@/lib/format/id";

export const metadata: Metadata = { title: "Laporan Manajemen" };

const selectClass = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky";

export default function LaporanPage() {
  return (
    <>
      <PageHeader
        title="Laporan Manajemen"
        description="Satu dokumen PDF berisi ringkasan persiapan TKA per mapel, nilai TO terakhir per sekolah, kompetensi terlemah, rekap prestasi, dan kelengkapan input pekanan kelima sekolah."
      />
      <Suspense fallback={<TableSkeleton rows={3} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requireUser(["super_admin", "viewer"]);
  const years = await queryAsUser((tx) => tx.select({ label: academicYears.label, isActive: academicYears.isActive }).from(academicYears).orderBy(asc(academicYears.startDate)));
  const active = years.find((y) => y.isActive)?.label;
  const month = todayIso().slice(0, 7);

  return (
    <form action="/laporan/pdf" method="get" className="grid max-w-2xl gap-4 rounded-lg border border-border bg-white p-5 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="ta">Tahun ajaran</Label>
        <select id="ta" name="ta" defaultValue={active} className={selectClass}>
          {years.map((y) => (
            <option key={y.label} value={y.label}>TA {y.label}{y.isActive ? " (aktif)" : ""}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="periode">Periode</Label>
        <select id="periode" name="periode" defaultValue="ta" className={selectClass}>
          <option value="ta">Tahun ajaran penuh</option>
          <option value="s1">Semester 1 (Jul–Des)</option>
          <option value="s2">Semester 2 (Jan–Jun)</option>
          <option value="bulan">Bulan ini</option>
        </select>
        <input type="hidden" name="bulan" value={month} />
      </div>
      <div className="col-span-full flex flex-wrap items-center gap-3">
        <Button type="submit">
          <FileDown aria-hidden="true" />
          Unduh PDF
        </Button>
        <p className="text-sm text-brand-gray-light">Dokumen internal: berisi nama siswa. Simpan dan bagikan hanya kepada pihak berwenang.</p>
      </div>
    </form>
  );
}
