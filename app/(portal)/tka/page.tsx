import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "TKA Dashboard" };

export default function TKADashboardPage() {
  return <ComingSoon title="TKA Dashboard" phase={3} description="Progres persiapan TKA: tren nilai try out, latihan pekanan, dan penguasaan kompetensi per materi." />;
}
