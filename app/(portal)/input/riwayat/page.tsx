import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { History } from "lucide-react";
import { EmptyState, PageHeader, TableSkeleton } from "@/components/layout/page";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { ALL_BATCH_KINDS, listRecentBatches, TKA_BATCH_KINDS, type BatchKind } from "@/lib/queries/imports";
import { cn } from "@/lib/utils";
import { BatchTable } from "../batch-table";

export const metadata: Metadata = { title: "Riwayat Unggahan" };

const FILTERS: { key: string; label: string; kinds: BatchKind[] }[] = [
  { key: "semua", label: "Semua", kinds: ALL_BATCH_KINDS },
  { key: "tka", label: "TKA", kinds: TKA_BATCH_KINDS },
  { key: "prestasi", label: "Prestasi", kinds: ["achievements"] },
];

export default function RiwayatPage(props: PageProps<"/input/riwayat">) {
  return (
    <>
      <nav aria-label="Jejak navigasi" className="mb-2 text-sm">
        <Link href="/input" className="text-brand-blue hover:underline">← Input Pekanan</Link>
      </nav>
      <PageHeader
        title="Riwayat Unggahan"
        description="100 unggahan terakhir. Buka salah satu untuk melihat pratinjau, melanjutkan draf, atau (Super Admin) membatalkan unggahan."
      />
      <Suspense fallback={<TableSkeleton rows={10} />}>
        <RiwayatContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function RiwayatContent({ searchParams }: { searchParams: PageProps<"/input/riwayat">["searchParams"] }) {
  await requireUser(["super_admin", "school_admin"]);
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === sp.jenis) ?? FILTERS[0]!;
  const batches = await queryAsUser((tx) => listRecentBatches(tx, { kinds: filter.kinds, limit: 100 }));

  return (
    <div className="space-y-4">
      <nav aria-label="Saring jenis unggahan" className="inline-flex rounded-lg bg-muted p-1 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "semua" ? "/input/riwayat" : `/input/riwayat?jenis=${f.key}`}
            aria-current={filter.key === f.key ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 focus-visible:outline-2 focus-visible:outline-brand-sky",
              filter.key === f.key ? "bg-white font-medium text-brand-gray ring-1 ring-border" : "text-brand-gray-light hover:text-brand-gray",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {batches.length === 0 ? (
        <EmptyState icon={History} title="Belum ada unggahan" description="Unggahan yang Anda buat akan tampil di sini beserta statusnya." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <BatchTable batches={batches} showFile />
        </div>
      )}
    </div>
  );
}
