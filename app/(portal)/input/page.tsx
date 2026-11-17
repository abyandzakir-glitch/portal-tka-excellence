import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardList, FileSpreadsheet, History, ListChecks, NotebookPen, Trophy } from "lucide-react";
import { EmptyState, PageHeader, TableSkeleton } from "@/components/layout/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format/id";
import { IMPORT_KIND_LABEL } from "@/lib/import/pipeline";
import { listRecentBatches } from "@/lib/queries/imports";
import { BatchStatusBadge, formatDateTime } from "./status";

export const metadata: Metadata = { title: "Input Pekanan" };

const CARDS = [
  {
    href: "/input/unggah/hasil",
    title: "Hasil Try Out",
    icon: ListChecks,
    desc: "Jawaban per soal (A–E atau 1/0) atau nilai total siswa untuk satu TO.",
  },
  {
    href: "/input/unggah/latihan",
    title: "Latihan Pekanan",
    icon: NotebookPen,
    desc: "Jumlah soal yang dikerjakan dan dijawab benar per siswa, per pekan, per mapel.",
  },
  {
    href: "/input/unggah/prestasi",
    title: "Prestasi",
    icon: Trophy,
    desc: "Rekap prestasi siswa: template standar atau rekap sekolah sendiri. Unggah ulang tidak membuat data ganda.",
  },
  {
    href: "/input/unggah/kisi",
    title: "Kisi-kisi Try Out",
    icon: ClipboardList,
    desc: "Daftar nomor soal, sub-kompetensi, dan kunci jawaban. Diunggah sekali sebelum hasil TO.",
  },
] as const;

export default function InputPekananPage() {
  return (
    <>
      <PageHeader
        title="Input Pekanan"
        description="Unggah data TKA sekolah Anda. Sistem membaca file Excel/CSV, mencocokkan kolom dan siswa secara otomatis, lalu menampilkan pratinjau sebelum data disimpan."
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <InputContent />
      </Suspense>
    </>
  );
}

async function InputContent() {
  await requireUser(["super_admin", "school_admin"]);
  const batches = await queryAsUser((tx) => listRecentBatches(tx));

  return (
    <div className="space-y-8">
      <section aria-labelledby="unggah-baru" className="space-y-3">
        <h2 id="unggah-baru" className="text-lg font-semibold">Unggah data baru</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group flex gap-3 rounded-lg border border-border bg-white p-4 transition-colors hover:border-brand-blue focus-visible:outline-2 focus-visible:outline-brand-sky"
            >
              <c.icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-blue" />
              <span>
                <span className="block font-heading font-semibold text-brand-gray group-hover:text-brand-blue">{c.title}</span>
                <span className="block text-sm text-brand-gray-light">{c.desc}</span>
              </span>
            </Link>
          ))}
        </div>
        <p className="flex items-center gap-2 text-sm text-brand-gray-light">
          <FileSpreadsheet aria-hidden="true" className="size-4" />
          Template Excel resmi bisa diunduh di halaman unggah masing-masing. File dengan format sendiri juga bisa diunggah.
        </p>
      </section>

      <section aria-labelledby="riwayat" className="space-y-3">
        <h2 id="riwayat" className="text-lg font-semibold">Riwayat unggahan</h2>
        {batches.length === 0 ? (
          <EmptyState icon={History} title="Belum ada unggahan" description="Unggahan yang Anda buat akan tampil di sini beserta statusnya." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Sekolah</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Baris</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Oleh</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/input/batch/${b.id}`} className="text-brand-blue hover:underline">
                        {formatDateTime(b.createdAt)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {IMPORT_KIND_LABEL[b.type]}
                      {b.tryoutName ? <span className="block text-xs text-brand-gray-light">{b.tryoutName}</span> : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{b.schoolCode ?? "Jaringan"}</TableCell>
                    <TableCell className="max-w-56 truncate" title={b.filename ?? undefined}>{b.filename ?? "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(b.rowCount)}</TableCell>
                    <TableCell><BatchStatusBadge status={b.status} errorCount={b.errorCount} /></TableCell>
                    <TableCell>{b.uploaderName ?? "–"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
