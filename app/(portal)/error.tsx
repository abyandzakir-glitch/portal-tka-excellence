"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Friendly error page for the portal (CLAUDE.md §12: no stack traces).
 * The digest lets the Super Admin find the matching server log entry.
 */
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="flex flex-col items-center rounded-lg border border-dashed border-border bg-white px-6 py-12 text-center">
      <CloudOff aria-hidden="true" className="mb-3 size-10 text-brand-sky" />
      <h1 className="font-heading text-lg font-semibold text-brand-gray">Halaman ini belum bisa ditampilkan</h1>
      <p className="mt-1 max-w-md text-sm text-brand-gray-light">
        Biasanya karena koneksi ke server sedang terganggu. Data Anda aman. Coba muat ulang; bila masih gagal, hubungi Super Admin yayasan
        {error.digest ? (
          <>
            {" "}dan sebutkan kode <span className="font-mono text-brand-gray">{error.digest}</span>
          </>
        ) : null}
        .
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => reset()}>Coba lagi</Button>
        <Link href="/" className="text-sm font-medium text-brand-blue underline-offset-4 hover:underline">Kembali ke Beranda →</Link>
      </div>
    </div>
  );
}
