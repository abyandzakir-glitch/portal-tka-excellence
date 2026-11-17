import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { ActionForm } from "@/components/master/action-form";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { schools } from "@/lib/db/schema";
import { formatDate } from "@/lib/format/id";
import { listUsers, STATUS_BADGE } from "@/lib/queries/users";
import { inviteUser } from "./actions";
import { RoleFields } from "./role-fields";

export const metadata: Metadata = { title: "Pengguna" };

export default function PenggunaPage() {
  return (
    <>
      <PageHeader title="Pengguna" description="Undang pengguna baru, atur peran dan sekolahnya, atau nonaktifkan akun yang tidak dipakai lagi." />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requireUser(["super_admin"]);
  const { users, schoolList } = await queryAsUser(async (tx) => ({
    users: await listUsers(tx),
    schoolList: await tx.select({ id: schools.id, name: schools.name }).from(schools).orderBy(asc(schools.level), asc(schools.schoolCode)),
  }));

  return (
    <div className="space-y-6">
      <section className="max-w-3xl rounded-lg border border-border bg-white p-5" aria-labelledby="undang-judul">
        <h2 id="undang-judul" className="font-heading text-base font-semibold">Undang pengguna</h2>
        <p className="mb-3 text-sm text-brand-gray-light">Pengguna menerima email berisi tautan untuk membuat kata sandi. Tautan berlaku 24 jam.</p>
        <ActionForm action={inviteUser} stacked submitLabel="Kirim undangan" pendingLabel="Mengirim…" className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="baru-nama">Nama lengkap</Label>
            <Input id="baru-nama" name="nama" required maxLength={200} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="baru-email">Email</Label>
            <Input id="baru-email" name="email" type="email" required autoComplete="off" className="h-9" />
          </div>
          <RoleFields idPrefix="baru" schools={schoolList} />
        </ActionForm>
      </section>

      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead>Sekolah</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Terakhir masuk</TableHead>
              <TableHead><span className="sr-only">Aksi</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.fullName}</TableCell>
                <TableCell className="text-sm">{u.email}</TableCell>
                <TableCell className="text-sm">{ROLE_LABEL[u.role]}</TableCell>
                <TableCell className="text-sm">{u.schoolName ?? "Semua sekolah"}</TableCell>
                <TableCell><Badge variant={STATUS_BADGE[u.status].variant}>{STATUS_BADGE[u.status].label}</Badge></TableCell>
                <TableCell className="text-sm tabular-nums">{u.lastSignInAt ? formatDate(u.lastSignInAt) : "–"}</TableCell>
                <TableCell>
                  <Link href={`/pengguna/${u.id}`} className="text-sm text-brand-blue hover:underline" aria-label={`Kelola ${u.fullName}`}>Kelola</Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
