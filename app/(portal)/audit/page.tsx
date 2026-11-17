import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { RoleGuard } from "@/components/layout/guard";

export const metadata: Metadata = { title: "Audit Log" };

export default function AuditLogPage() {
  return (
    <RoleGuard roles={["super_admin"]}>
      <ComingSoon title="Audit Log" phase={5} description="Riwayat setiap perubahan dan impor data." />
    </RoleGuard>
  );
}
