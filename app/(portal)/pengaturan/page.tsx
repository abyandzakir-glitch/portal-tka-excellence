import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { RoleGuard } from "@/components/layout/guard";

export const metadata: Metadata = { title: "Pengaturan" };

export default function PengaturanPage() {
  return (
    <RoleGuard roles={["super_admin"]}>
      <ComingSoon title="Pengaturan" phase={3} description="Ambang status penguasaan, bobot perhitungan, target nilai TO, dan saklar fitur AI." />
    </RoleGuard>
  );
}
