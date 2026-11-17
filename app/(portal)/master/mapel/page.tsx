import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { LEVEL_LABEL } from "@/lib/brand/schools";
import { listSubjectsWithCounts } from "@/lib/queries/master";

export const metadata: Metadata = { title: "Mata Pelajaran" };

export default function SubjectsPage() {
  return (
    <>
      <PageHeader
        title="Mata Pelajaran"
        description="Mata pelajaran TKA per jenjang. Mapel baru (mis. IPA) bisa ditambahkan tanpa perubahan kode."
      />
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <SubjectsTable />
      </Suspense>
    </>
  );
}

async function SubjectsTable() {
  await requireUser();
  const rows = await queryAsUser((tx) => listSubjectsWithCounts(tx));
  return (
    <div className="rounded-lg border border-border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mata pelajaran</TableHead>
            <TableHead>Kode</TableHead>
            <TableHead>Jenjang</TableHead>
            <TableHead className="text-right">Sub-kompetensi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell className="font-mono text-xs">{s.code}</TableCell>
              <TableCell>
                <Badge variant="secondary">{LEVEL_LABEL[s.level]}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <Link href={`/master/kompetensi#${s.id}`} className="text-brand-blue underline-offset-4 hover:underline">
                  {s.subCompetencyCount}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
