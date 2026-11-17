import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { ActionForm } from "@/components/master/action-form";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { schools } from "@/lib/db/schema";
import { formatDate } from "@/lib/format/id";
import { listUsers, STATUS_BADGE } from "@/lib/queries/users";
import { resendAccess, setUserActive, updateUser } from "../actions";
import { RoleFields } from "../role-fields";

export const metadata: Metadata = { title: "Kelola Pengguna" };

export default function ManageUserPage(props: PageProps<"/pengguna/[id]">) {
  return (
    <>
      <nav aria-label="Jejak navigasi" className="mb-2 text-sm">
        <Link href="/pengguna" className="text-brand-blue hover:underline">← Daftar pengguna</Link>
      </nav>
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Content params={props.params} />
      </Suspense>
    </>
  );
}

async function Content({ params }: { params: PageProps<"/pengguna/[id]">["params"] }) {
  const me = await requireUser(["super_admin"]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { user, schoolList } = await queryAsUser(async (tx) => ({
    user: (await listUsers(tx, id))[0],
    schoolList: await tx.select({ id: schools.id, name: schools.name }).from(schools).orderBy(asc(schools.level), asc(schools.schoolCode)),
  }));
  if (!user) notFound();
  const self = user.id === me.id;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={user.fullName} description={user.email} />
      <p className="-mt-4 flex flex-wrap items-center gap-2 text-sm text-brand-gray-light">
        <Badge variant={STATUS_BADGE[user.status].variant}>{STATUS_BADGE[user.status].label}</Badge>
        {user.lastSignInAt ? <span>Terakhir masuk {formatDate(user.lastSignInAt)}</span> : user.invitedAt ? <span>Diundang {formatDate(user.invitedAt)}</span> : null}
      </p>

      <section className="rounded-lg border border-border bg-white p-5" aria-labelledby="peran-judul">
        <h2 id="peran-judul" className="mb-3 font-heading text-base font-semibold">Nama, peran, dan sekolah</h2>
        <ActionForm action={updateUser} submitLabel="Simpan perubahan" className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={user.id} />
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ubah-nama">Nama lengkap</Label>
            <Input id="ubah-nama" name="nama" defaultValue={user.fullName} required maxLength={200} className="h-9" />
          </div>
          <RoleFields idPrefix="ubah" schools={schoolList} defaultRole={user.role === "teacher" ? "viewer" : user.role} defaultSchool={user.schoolId} />
        </ActionForm>
        {self ? <p className="mt-2 text-xs text-brand-gray-light">Ini akun Anda sendiri: peran Super Admin tidak bisa diturunkan dari sini.</p> : null}
      </section>

      {user.status !== "inactive" ? (
        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="font-heading text-base font-semibold">{user.status === "invited" ? "Kirim ulang undangan" : "Atur ulang kata sandi"}</h2>
          <p className="mb-3 text-sm text-brand-gray-light">
            {user.status === "invited"
              ? "Untuk pengguna yang belum menerima email atau tautannya sudah kedaluwarsa."
              : "Pengguna menerima email berisi tautan untuk membuat kata sandi baru."}
          </p>
          <ActionForm action={resendAccess} submitLabel={user.status === "invited" ? "Kirim ulang undangan" : "Kirim tautan atur ulang"} pendingLabel="Mengirim…" variant="outline">
            <input type="hidden" name="id" value={user.id} />
          </ActionForm>
        </section>
      ) : null}

      {!self ? (
        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="font-heading text-base font-semibold">{user.isActive ? "Nonaktifkan akun" : "Aktifkan kembali"}</h2>
          <p className="mb-3 text-sm text-brand-gray-light">
            {user.isActive
              ? "Pengguna tidak bisa masuk lagi. Riwayat unggahan dan catatan audit atas namanya tetap tersimpan."
              : "Pengguna bisa masuk kembali dengan kata sandi lamanya."}
          </p>
          <ActionForm
            action={setUserActive}
            submitLabel={user.isActive ? "Nonaktifkan" : "Aktifkan kembali"}
            variant={user.isActive ? "destructive" : "outline"}
            confirm={user.isActive ? `Nonaktifkan akun ${user.fullName}?` : undefined}
          >
            <input type="hidden" name="id" value={user.id} />
            <input type="hidden" name="aktif" value={user.isActive ? "0" : "1"} />
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
