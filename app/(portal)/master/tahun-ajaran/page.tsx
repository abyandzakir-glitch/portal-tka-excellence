import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarDays } from "lucide-react";
import { EmptyState, PageHeader, TableSkeleton } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format/id";
import { listAcademicYears } from "@/lib/queries/master";
import { ActionForm } from "@/components/master/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addAcademicYear, setActiveYear } from "../actions";

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
  const user = await requireUser();
  const rows = await queryAsUser((tx) => listAcademicYears(tx));
  const isSuper = user.role === "super_admin";
  if (rows.length === 0) {
    return <EmptyState icon={CalendarDays} title="Belum ada tahun ajaran" description="Super Admin perlu menambahkan tahun ajaran terlebih dahulu." />;
  }
  return (
    <div className="space-y-4">
      {isSuper ? (
        <ActionForm action={addAcademicYear} submitLabel="Tambah tahun ajaran" className="rounded-lg border border-border bg-white p-4">
          <div className="space-y-1">
            <Label htmlFor="label">Tahun ajaran baru</Label>
            <Input id="label" name="label" required placeholder="mis. 2027/2028" pattern="\d{4}/\d{4}" className="h-9 w-36" />
          </div>
        </ActionForm>
      ) : null}
    <div className="rounded-lg border border-border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tahun ajaran</TableHead>
            <TableHead>Mulai</TableHead>
            <TableHead>Selesai</TableHead>
            <TableHead>Status</TableHead>
            {isSuper ? <TableHead><span className="sr-only">Aksi</span></TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((y) => (
            <TableRow key={y.id}>
              <TableCell className="font-medium">TA {y.label}</TableCell>
              <TableCell>{formatDate(y.startDate)}</TableCell>
              <TableCell>{formatDate(y.endDate)}</TableCell>
              <TableCell>{y.isActive ? <Badge>Aktif</Badge> : <Badge variant="outline">Arsip</Badge>}</TableCell>
              {isSuper ? (
                <TableCell>
                  {y.isActive ? null : (
                    <ActionForm action={setActiveYear} submitLabel="Jadikan aktif" variant="outline" confirm={`Jadikan TA ${y.label} sebagai tahun ajaran aktif? Dashboard dan impor akan memakai tahun ini.`}>
                      <input type="hidden" name="id" value={y.id} />
                    </ActionForm>
                  )}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
    </div>
  );
}
