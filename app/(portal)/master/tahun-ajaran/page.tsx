import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarDays } from "lucide-react";
import { EmptyState, PageHeader, TableSkeleton } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format/id";
import { listAcademicYears } from "@/lib/queries/master";

export const metadata: Metadata = { title: "Tahun Ajaran" };

export default function AcademicYearsPage() {
  return (
    <>
      <PageHeader title="Tahun Ajaran" description="Tahun ajaran berjalan Juli–Juni. Hanya satu tahun ajaran yang aktif." />
      <Suspense fallback={<TableSkeleton rows={3} />}>
        <YearsTable />
      </Suspense>
    </>
  );
}

async function YearsTable() {
  await requireUser();
  const rows = await queryAsUser((tx) => listAcademicYears(tx));
  if (rows.length === 0) {
    return <EmptyState icon={CalendarDays} title="Belum ada tahun ajaran" description="Super Admin perlu menambahkan tahun ajaran terlebih dahulu." />;
  }
  return (
    <div className="rounded-lg border border-border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tahun ajaran</TableHead>
            <TableHead>Mulai</TableHead>
            <TableHead>Selesai</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((y) => (
            <TableRow key={y.id}>
              <TableCell className="font-medium">TA {y.label}</TableCell>
              <TableCell>{formatDate(y.startDate)}</TableCell>
              <TableCell>{formatDate(y.endDate)}</TableCell>
              <TableCell>{y.isActive ? <Badge>Aktif</Badge> : <Badge variant="outline">Arsip</Badge>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
