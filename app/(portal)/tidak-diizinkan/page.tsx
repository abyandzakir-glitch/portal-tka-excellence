import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/layout/page";

export const metadata: Metadata = { title: "Akses Ditolak" };

export default function ForbiddenPage() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="Anda tidak memiliki akses ke halaman ini"
      description="Halaman ini hanya untuk peran tertentu. Jika menurut Anda ini keliru, hubungi Super Admin yayasan."
      action={{ href: "/", label: "Kembali ke Beranda" }}
    />
  );
}
