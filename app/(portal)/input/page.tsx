import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { RoleGuard } from "@/components/layout/guard";

export const metadata: Metadata = { title: "Input Pekanan" };

export default function InputPekananPage() {
  return (
    <RoleGuard roles={["super_admin","school_admin"]}>
      <ComingSoon title="Input Pekanan" phase={2} description="Unggah hasil try out, log latihan pekanan, dan data prestasi sekolah Anda." />
    </RoleGuard>
  );
}
