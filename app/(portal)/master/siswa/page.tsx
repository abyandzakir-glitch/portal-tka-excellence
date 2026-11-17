import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Users } from "lucide-react";
import { z } from "zod";
import { EmptyState, PageHeader, TableSkeleton } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isNetworkRole } from "@/lib/auth/roles";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { SCHOOL_CODES } from "@/lib/brand/schools";
import { formatNumber } from "@/lib/format/id";
import { getActiveAcademicYear, listStudents } from "@/lib/queries/master";
import { StudentFilters } from "./student-filters";

export const metadata: Metadata = { title: "Siswa" };

const PAGE_SIZE = 50;

const paramsSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  sekolah: z.enum(SCHOOL_CODES).optional().catch(undefined),
  hal: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export default function StudentsPage(props: PageProps<"/master/siswa">) {
  return (
    <>
      <PageHeader title="Siswa" description="Data siswa per sekolah dan kelasnya pada tahun ajaran aktif." />
      <Suspense fallback={<TableSkeleton />}>
        <StudentsContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function StudentsContent({ searchParams }: { searchParams: PageProps<"/master/siswa">["searchParams"] }) {
  const user = await requireUser();
  const raw = await searchParams;
  const params = paramsSchema.parse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    sekolah: typeof raw.sekolah === "string" ? raw.sekolah : undefined,
    hal: typeof raw.hal === "string" ? raw.hal : undefined,
  });

  const { rows, total } = await queryAsUser(async (tx) => {
    const year = await getActiveAcademicYear(tx);
    return listStudents(tx, year?.id ?? null, {
      q: params.q || undefined,
      schoolCode: params.sekolah,
      page: params.hal,
      pageSize: PAGE_SIZE,
    });
  });

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.sekolah) sp.set("sekolah", params.sekolah);
    if (p > 1) sp.set("hal", String(p));
    const qs = sp.toString();
    return qs ? `/master/siswa?${qs}` : "/master/siswa";
  };

  return (
    <div className="space-y-4">
      <StudentFilters showSchoolFilter={isNetworkRole(user.role)} />
      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={params.q || params.sekolah ? "Tidak ada siswa yang cocok dengan filter" : "Belum ada data siswa"}
          description={params.q || params.sekolah ? "Coba ubah kata kunci atau filter sekolah." : undefined}
        />
      ) : (
        <>
          <p className="text-sm text-brand-gray-light" aria-live="polite">
            Menampilkan {formatNumber((params.hal - 1) * PAGE_SIZE + 1)}–{formatNumber(Math.min(params.hal * PAGE_SIZE, total))} dari{" "}
            {formatNumber(total)} siswa
          </p>
          <div className="overflow-x-auto rounded-lg border border-border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>NIS</TableHead>
                  <TableHead>NISN</TableHead>
                  <TableHead>Sekolah</TableHead>
                  <TableHead>Kelas</TableHead>
                  <TableHead>L/P</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.fullName}</TableCell>
                    <TableCell className="tabular-nums">{s.nis}</TableCell>
                    <TableCell className="tabular-nums">{s.nisn ?? "–"}</TableCell>
                    <TableCell className="font-mono text-xs">{s.schoolCode}</TableCell>
                    <TableCell>{s.className ?? "–"}</TableCell>
                    <TableCell>{s.gender ?? "–"}</TableCell>
                    <TableCell>
                      {s.isActive ? <Badge variant="secondary">Aktif</Badge> : <Badge variant="outline">Nonaktif</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pages > 1 ? (
            <nav aria-label="Halaman" className="flex items-center justify-between text-sm">
              {params.hal > 1 ? (
                <Link href={pageHref(params.hal - 1)} className="text-brand-blue hover:underline">← Sebelumnya</Link>
              ) : <span />}
              <span className="text-brand-gray-light">Halaman {params.hal} dari {pages}</span>
              {params.hal < pages ? (
                <Link href={pageHref(params.hal + 1)} className="text-brand-blue hover:underline">Berikutnya →</Link>
              ) : <span />}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
