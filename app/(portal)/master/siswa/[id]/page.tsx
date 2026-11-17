import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { ActionForm } from "@/components/master/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { academicYears, classEnrollments, classes, schools, students } from "@/lib/db/schema";
import { saveStudent, setStudentActive } from "../../actions";

export const metadata: Metadata = { title: "Ubah Data Siswa" };

const selectClass = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky";

export default function StudentEditPage(props: PageProps<"/master/siswa/[id]">) {
  return (
    <>
      <nav aria-label="Jejak navigasi" className="mb-2 text-sm">
        <Link href="/master/siswa" className="text-brand-blue hover:underline">← Daftar siswa</Link>
      </nav>
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Content params={props.params} />
      </Suspense>
    </>
  );
}

async function Content({ params }: { params: PageProps<"/master/siswa/[id]">["params"] }) {
  await requireUser(["super_admin", "school_admin"]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await queryAsUser(async (tx) => {
    const [st] = await tx
      .select({ s: students, schoolName: schools.name })
      .from(students)
      .innerJoin(schools, eq(schools.id, students.schoolId))
      .where(eq(students.id, id))
      .limit(1);
    if (!st) return null;
    const [year] = await tx.select().from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
    const classList = year
      ? await tx.select({ id: classes.id, name: classes.name }).from(classes).where(and(eq(classes.schoolId, st.s.schoolId), eq(classes.academicYearId, year.id))).orderBy(classes.name)
      : [];
    const [enr] = year
      ? await tx.select({ classId: classEnrollments.classId }).from(classEnrollments).where(and(eq(classEnrollments.studentId, id), eq(classEnrollments.academicYearId, year.id))).limit(1)
      : [];
    return { ...st, year, classList, classId: enr?.classId ?? "" };
  });
  if (!data) notFound();
  const s = data.s;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={s.fullName} description={`NIS ${s.nis} · ${data.schoolName}${s.isActive ? "" : " · Nonaktif"}`} />
      <ActionForm action={saveStudent} submitLabel="Simpan perubahan" className="grid gap-4 rounded-lg border border-border bg-white p-5 sm:grid-cols-2">
        <input type="hidden" name="id" value={s.id} />
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="nama">Nama lengkap</Label>
          <Input id="nama" name="nama" defaultValue={s.fullName} required maxLength={200} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="nisn">NISN</Label>
          <Input id="nisn" name="nisn" defaultValue={s.nisn ?? ""} inputMode="numeric" pattern="\d{10}" title="10 digit" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="jk">Jenis kelamin</Label>
          <select id="jk" name="jk" defaultValue={s.gender ?? ""} className={selectClass}>
            <option value="">—</option>
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="kelas">Kelas {data.year ? `(TA ${data.year.label})` : ""}</Label>
          <select id="kelas" name="kelas" defaultValue={data.classId} className={selectClass} disabled={!data.year}>
            <option value="">— Belum ditempatkan —</option>
            {data.classList.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <p className="text-xs text-brand-gray-light">NIS tidak bisa diubah karena dipakai untuk mencocokkan data impor. Untuk NIS yang salah, hubungi Super Admin.</p>
        </div>
      </ActionForm>

      <section className="rounded-lg border border-border bg-white p-5">
        <h2 className="font-heading text-base font-semibold">{s.isActive ? "Nonaktifkan siswa" : "Aktifkan kembali"}</h2>
        <p className="mb-3 text-sm text-brand-gray-light">
          {s.isActive
            ? "Untuk siswa yang pindah atau lulus. Data nilai dan prestasinya tetap tersimpan, tetapi siswa tidak lagi dihitung di dashboard."
            : "Siswa akan kembali dihitung di dashboard."}
        </p>
        <ActionForm
          action={setStudentActive}
          submitLabel={s.isActive ? "Nonaktifkan" : "Aktifkan kembali"}
          variant={s.isActive ? "destructive" : "outline"}
          confirm={s.isActive ? `Nonaktifkan ${s.fullName}?` : undefined}
        >
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="aktif" value={s.isActive ? "0" : "1"} />
        </ActionForm>
      </section>
    </div>
  );
}
