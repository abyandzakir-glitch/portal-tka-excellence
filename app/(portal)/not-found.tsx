import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/layout/page";

/** Shown when a page calls notFound(), e.g. a student or batch id that does not exist or is outside your access. */
export default function PortalNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Data tidak ditemukan"
      description="Data yang Anda cari tidak ada, sudah dihapus, atau berada di luar akses akun Anda."
      action={{ href: "/", label: "Kembali ke Beranda" }}
    />
  );
}
