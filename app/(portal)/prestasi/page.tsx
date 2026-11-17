import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Prestasi" };

export default function PrestasiPage() {
  return <ComingSoon title="Prestasi" phase={4} description="Rekap prestasi siswa lima sekolah per tingkat, kategori, peringkat, dan tren waktu." />;
}
