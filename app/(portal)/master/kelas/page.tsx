import type { Metadata } from "next";
import { Suspense } from "react";
import { DoorOpen } from "lucide-react";
import { EmptyState, PageHeader, TableSkeleton } from "@/components/layout/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format/id";
import { ActionForm } from "@/components/master/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canWriteData } from "@/lib/auth/roles";
import { listSchools } from "@/lib/queries/imports";
import { getActiveAcademicYear, listClasses } from "@/lib/queries/master";
import { addClass } from "../actions";

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
  const user = await requireUser();
  const { year, rows, schoolList } = await queryAsUser(async (tx) => {
    const year = await getActiveAcademicYear(tx);
    return { year, rows: year ? await listClasses(tx, year.id) : [], schoolList: await listSchools(tx) };
  });
  const addForm =
    year && canWriteData(user.role) ? (
      <ActionForm action={addClass} submitLabel="Tambah kelas" className="rounded-lg border border-border bg-white p-4">
        {user.schoolId ? null : (
          <div className="space-y-1">
            <Label htmlFor="sekolah">Sekolah</Label>
            <select id="sekolah" name="sekolah" required className="h-9 rounded-lg border border-input bg-white px-2 text-sm">
              <option value="">Pilih sekolah…</option>
              {schoolList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="nama-kelas">Kelas baru (TA {year.label})</Label>
          <Input id="nama-kelas" name="nama" required placeholder="mis. 6C" className="h-9 w-32" />
        </div>
      </ActionForm>
    ) : null;

  if (!year) {
    return <EmptyState icon={DoorOpen} title="Belum ada tahun ajaran aktif" action={{ href: "/master/tahun-ajaran", label: "Lihat tahun ajaran" }} />;
  }
  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        {addForm}
        <EmptyState icon={DoorOpen} title={`Belum ada kelas untuk TA ${year.label}`} description="Kelas juga dibuat otomatis saat mengimpor data siswa." />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {addForm}
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
