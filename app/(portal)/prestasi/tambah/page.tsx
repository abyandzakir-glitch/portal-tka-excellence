import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { AchievementForm } from "@/components/prestasi/achievement-form";
import { loadAchievementForm } from "../form-data";

export const metadata: Metadata = { title: "Tambah Prestasi" };

export default function AddAchievementPage() {
  return (
    <>
      <nav aria-label="Jejak navigasi" className="mb-2 text-sm">
        <Link href="/prestasi" className="text-brand-blue hover:underline">← Dashboard Prestasi</Link>
      </nav>
      <PageHeader title="Tambah Prestasi" description="Input cepat satu prestasi. Untuk banyak prestasi sekaligus, gunakan Unggah rekap." />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const data = (await loadAchievementForm(null))!;
  return <AchievementForm values={data.values} schools={data.schools} students={data.students} lockedSchool={data.lockedSchool} />;
}
