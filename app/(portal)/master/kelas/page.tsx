import type { Metadata } from "next";
import { Suspense } from "react";
import { DoorOpen } from "lucide-react";
import { EmptyState, PageHeader, TableSkeleton } from "@/components/layout/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format/id";
import { getActiveAcademicYear, listClasses } from "@/lib/queries/master";

export const metadata: Metadata = { title: "Kelas" };

export default function ClassesPage() {
  return (
    <>
      <PageHeader title="Kelas" description="Daftar kelas pada tahun ajaran aktif beserta jumlah siswanya." />
      <Suspense fallback={<TableSkeleton />}>
        <ClassesTable />
      </Suspense>
    </>
  );
}

async function ClassesTable() {
  await requireUser();
  const { year, rows } = await queryAsUser(async (tx) => {
    const year = await getActiveAcademicYear(tx);
    return { year, rows: year ? await listClasses(tx, year.id) : [] };
  });

  if (!year) {
    return <EmptyState icon={DoorOpen} title="Belum ada tahun ajaran aktif" action={{ href: "/master/tahun-ajaran", label: "Lihat tahun ajaran" }} />;
  }
  if (rows.length === 0) {
    return <EmptyState icon={DoorOpen} title={`Belum ada kelas untuk TA ${year.label}`} />;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-brand-gray-light">Tahun ajaran aktif: TA {year.label}</p>
      <div className="rounded-lg border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sekolah</TableHead>
              <TableHead>Kelas</TableHead>
              <TableHead>Tingkat</TableHead>
              <TableHead className="text-right">Jumlah siswa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.schoolName}</TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>Kelas {c.grade}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(c.studentCount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
