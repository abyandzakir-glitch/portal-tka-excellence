import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format/id";
import { IMPORT_KIND_LABEL } from "@/lib/import/pipeline";
import type { RecentBatch } from "@/lib/queries/imports";
import { BatchStatusBadge, formatDateTime } from "./status";

/** "SD Talenta Juara Cimahi" -> "SD Cimahi" (the network name adds nothing inside one table). */
export function shortSchoolName(name: string | null): string {
  return name ? name.replace(/\s*Talenta Juara\s*/i, " ").trim() : "Jaringan";
}

/** "Bahasa Indonesia" + sd -> "B. Indonesia SD". */
function batchDetail(b: RecentBatch): string | null {
  if (!b.subjectName) return b.tryoutName;
  const subject = b.subjectName.replace(/^Bahasa\s+/i, "B. ");
  return b.tryoutLevel ? `${subject} ${b.tryoutLevel.toUpperCase()}` : subject;
}

/** Upload history table shared by Input Pekanan (latest 5) and Riwayat Unggahan (full list). */
export function BatchTable({ batches, showFile = false }: { batches: RecentBatch[]; showFile?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-5">Waktu</TableHead>
          <TableHead>Jenis</TableHead>
          <TableHead>Sekolah</TableHead>
          {showFile ? <TableHead>File</TableHead> : null}
          <TableHead className="text-right">Baris</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="pr-5">Oleh</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.map((b) => {
          const detail = batchDetail(b);
          return (
            <TableRow key={b.id}>
              <TableCell className="whitespace-nowrap pl-5">
                <Link href={`/input/batch/${b.id}`} className="text-brand-blue hover:underline">
                  {formatDateTime(b.createdAt)}
                </Link>
              </TableCell>
              <TableCell>
                <span className="font-semibold">{IMPORT_KIND_LABEL[b.type]}</span>
                {detail ? <span className="text-brand-gray-light" title={b.tryoutName ?? undefined}> · {detail}</span> : null}
              </TableCell>
              <TableCell className="whitespace-nowrap" title={b.schoolName ?? undefined}>{shortSchoolName(b.schoolName)}</TableCell>
              {showFile ? (
                <TableCell className="max-w-56 truncate" title={b.filename ?? undefined}>{b.filename ?? "–"}</TableCell>
              ) : null}
              <TableCell className="text-right tabular-nums">{formatNumber(b.rowCount)}</TableCell>
              <TableCell><BatchStatusBadge status={b.status} errorCount={b.errorCount} /></TableCell>
              <TableCell className="pr-5">{b.uploaderName ?? "–"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
