import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = { title: "Halaman Tidak Ditemukan" };

/** Unmatched URLs (outside the portal layout). */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-4 text-center">
      <Image src="/brand/web/logo-master-full.png" alt="Sekolah Talenta Juara" width={180} height={60} priority className="h-auto w-44" />
      <div>
        <h1 className="font-heading text-2xl font-semibold text-brand-gray">Halaman tidak ditemukan</h1>
        <p className="mt-1 text-sm text-brand-gray-light">Alamat yang Anda buka tidak ada di Portal Academic Excellence.</p>
      </div>
      <Link href="/" className="text-sm font-medium text-brand-blue underline-offset-4 hover:underline">Kembali ke Beranda →</Link>
    </main>
  );
}
