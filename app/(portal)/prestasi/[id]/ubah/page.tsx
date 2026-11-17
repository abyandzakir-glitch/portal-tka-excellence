import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { AchievementForm } from "@/components/prestasi/achievement-form";
import { loadAchievementForm } from "../../form-data";

export const metadata: Metadata = { title: "Ubah Prestasi" };

export default function EditAchievementPage(props: PageProps<"/prestasi/[id]/ubah">) {
  return (
    <>
      <nav aria-label="Jejak navigasi" className="mb-2 text-sm">
        <Link href="/prestasi/daftar" className="text-brand-blue hover:underline">← Daftar Prestasi</Link>
      </nav>
      <PageHeader title="Ubah Prestasi" description="Koreksi data satu prestasi. Setiap perubahan tercatat di audit log." />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Content params={props.params} />
      </Suspense>
    </>
  );
}

async function Content({ params }: { params: PageProps<"/prestasi/[id]/ubah">["params"] }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await loadAchievementForm(id);
  if (!data) notFound();
  return <AchievementForm values={data.values} schools={data.schools} students={data.students} lockedSchool={data.lockedSchool} />;
}
