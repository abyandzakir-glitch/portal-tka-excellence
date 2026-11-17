import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { RoleGuard } from "@/components/layout/guard";

export const metadata: Metadata = { title: "Pengguna" };

export default function PenggunaPage() {
  return (
    <RoleGuard roles={["super_admin"]}>
      <ComingSoon title="Pengguna" phase={5} description="Undang pengguna baru dan atur peran serta sekolahnya." />
    </RoleGuard>
  );
}
