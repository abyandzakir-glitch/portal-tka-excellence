import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { todayIso, weekStartOf } from "@/lib/format/id";
import { eq } from "drizzle-orm";
import { aiConfigured } from "@/lib/achievements/ai-extract";
import { settings } from "@/lib/db/schema";
import { listSchools, listSubjects, listTryouts } from "@/lib/queries/imports";
import { SETTING_KEYS } from "@/lib/settings/defaults";
import { UploadForm, type UploadKind } from "./upload-form";

const TITLES: Record<UploadKind, { title: string; description: string }> = {
  hasil: {
    title: "Unggah Hasil Try Out",
    description: "Pilih try out, unduh template berisi daftar siswa, isi jawaban per soal, lalu unggah. File dengan format sendiri juga bisa dipakai.",
  },
  latihan: {
    title: "Unggah Latihan Pekanan",
    description: "Rekap jumlah soal latihan yang dikerjakan dan dijawab benar per siswa. Satu file boleh berisi beberapa pekan.",
  },
  prestasi: {
    title: "Unggah Prestasi",
    description: "Rekap prestasi siswa dalam format apa pun: template standar, atau rekap sekolah sendiri. Sistem mencocokkan kolom, menormalkan tingkat dan peringkat, lalu menampilkan pratinjau. Prestasi yang sudah tersimpan otomatis dilewati.",
  },
  siswa: {
    title: "Impor Data Siswa",
    description: "Tambah atau perbarui data siswa dari Excel/CSV (berdasarkan NIS), termasuk kelasnya di tahun ajaran aktif. Siswa yang tidak ada di file tidak diubah.",
  },
  kisi: {
    title: "Unggah Kisi-kisi Try Out",
    description: "Petakan setiap nomor soal ke sub-kompetensi. Kisi-kisi ini menjadi dasar analisis penguasaan kompetensi siswa.",
  },
};

/** A fixed set of upload kinds: their page shells are prerendered. */
export function generateStaticParams() {
  return Object.keys(TITLES).map((jenis) => ({ jenis }));
}

export async function generateMetadata(props: PageProps<"/input/unggah/[jenis]">): Promise<Metadata> {
  const { jenis } = await props.params;
  return { title: jenis in TITLES ? TITLES[jenis as UploadKind].title : "Unggah" };
}

export default function UploadPage(props: PageProps<"/input/unggah/[jenis]">) {
  return (
    <>
      <nav aria-label="Jejak navigasi" className="mb-2 text-sm">
        <Link href="/input" className="text-brand-blue hover:underline">← Input Pekanan</Link>
      </nav>
      {/* params are read inside the boundary so the shell never waits on URL data. */}
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <UploadBody params={props.params} />
      </Suspense>
    </>
  );
}

async function UploadBody({ params }: { params: PageProps<"/input/unggah/[jenis]">["params"] }) {
  const { jenis } = await params;
  if (!(jenis in TITLES)) notFound();
  const kind = jenis as UploadKind;
  return (
    <>
      <PageHeader title={TITLES[kind].title} description={TITLES[kind].description} />
      <UploadContent kind={kind} />
    </>
  );
}

async function UploadContent({ kind }: { kind: UploadKind }) {
  const user = await requireUser(["super_admin", "school_admin"]);
  const [schoolList, subjectList, tryoutList, aiSetting] = await queryAsUser((tx) =>
    Promise.all([
      listSchools(tx),
      listSubjects(tx),
      listTryouts(tx),
      tx.select({ v: settings.valueJson }).from(settings).where(eq(settings.key, SETTING_KEYS.aiExtraction)).limit(1),
    ]),
  );
  const ownSchool = user.role === "school_admin" ? schoolList.find((s) => s.id === user.schoolId) ?? null : null;
  const level = ownSchool?.level ?? null;

  return (
    <UploadForm
      kind={kind}
      isSuperAdmin={user.role === "super_admin"}
      ownSchool={ownSchool}
      schools={schoolList}
      subjects={level ? subjectList.filter((s) => s.level === level) : subjectList}
      tryouts={tryoutList.filter((t) => (ownSchool ? t.schoolIds.includes(ownSchool.id) || t.ownerSchoolId === ownSchool.id : true))}
      editableTryoutIds={tryoutList.filter((t) => (ownSchool ? t.ownerSchoolId === ownSchool.id : true)).map((t) => t.id)}
      currentWeek={weekStartOf(todayIso())}
      aiEnabled={aiSetting[0]?.v === true && aiConfigured()}
    />
  );
}
