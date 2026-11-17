import type { Metadata } from "next";
import { Suspense } from "react";
import { SchoolBadge } from "@/components/brand/logo";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { isSchoolCode, LEVEL_LABEL } from "@/lib/brand/schools";
import { formatNumber } from "@/lib/format/id";
import { listSchoolsWithCounts } from "@/lib/queries/master";

export const metadata: Metadata = { title: "Sekolah" };

export default function SchoolsPage() {
  return (
    <>
      <PageHeader
        title="Sekolah"
        description="Lima sekolah jaringan Talenta Juara. Kode sekolah dipakai untuk mencocokkan data saat impor."
      />
      <Suspense fallback={<TableSkeleton rows={5} />}>
        <SchoolsTable />
      </Suspense>
    </>
  );
}

async function SchoolsTable() {
  await requireUser();
  const rows = await queryAsUser((tx) => listSchoolsWithCounts(tx));
  return (
    <div className="rounded-lg border border-border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sekolah</TableHead>
            <TableHead>Kode</TableHead>
            <TableHead>Jenjang</TableHead>
            <TableHead>Kota</TableHead>
            <TableHead className="text-right">Siswa aktif</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell>{isSchoolCode(s.schoolCode) ? <SchoolBadge code={s.schoolCode} name={s.name} /> : s.name}</TableCell>
              <TableCell className="font-mono text-xs">{s.schoolCode}</TableCell>
              <TableCell>
                <Badge variant="secondary">{LEVEL_LABEL[s.level]}</Badge>
              </TableCell>
              <TableCell>{s.city}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(s.studentCount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
