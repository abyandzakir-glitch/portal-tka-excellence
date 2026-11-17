"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MASTERY_STATUS_LABEL, type MasteryStatus } from "@/lib/metrics/mastery";
import type { StudentTableRow } from "@/lib/tka/load";
import { RiskBadge, StatusBadge } from "./status";

type SortKey = "fullName" | "className" | "lastScore" | "change" | "practiceAccuracy" | "weakest" | "status";
const STATUS_RANK: Record<MasteryStatus, number> = { intervensi: 0, berkembang: 1, cakap: 2, mahir: 3, kurang_data: 4 };

const num = (v: number | null, digits = 2) => (v == null ? "–" : v.toLocaleString("id-ID", { maximumFractionDigits: digits }));
const pct = (v: number | null) => (v == null ? "–" : `${(v * 100).toLocaleString("id-ID", { maximumFractionDigits: 0 })}%`);

type Sort = { key: SortKey; dir: 1 | -1 };

function Th({ k, children, right, sort, onSort }: { k: SortKey; children: React.ReactNode; right?: boolean; sort: Sort; onSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={right ? "text-right" : "text-left"}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 px-3 py-2 font-medium hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-sky"
      >
        {children}
        <Icon aria-hidden="true" className="size-3.5" />
      </button>
    </th>
  );
}

/** Student table (§7.2b): sortable, filterable, searchable. */
export function StudentTable({ rows, query, subjectName }: { rows: StudentTableRow[]; query: string; subjectName: string }) {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "status", dir: 1 });
  const onSort = (k: SortKey) => setSort((s) => ({ key: k, dir: s.key === k ? ((s.dir * -1) as 1 | -1) : 1 }));
  const classes = [...new Set(rows.map((r) => r.className).filter(Boolean))].sort() as string[];

  // Filtered + sorted rows. Memoised automatically by the React Compiler.
  const visible = (() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!term || r.fullName.toLowerCase().includes(term) || r.nis.includes(term)) &&
        (!cls || r.className === cls) &&
        (!status || (status === "berisiko" ? r.atRisk : r.status === status)),
    );
    const val = (r: StudentTableRow): number | string => {
      switch (sort.key) {
        case "fullName":
          return r.fullName;
        case "className":
          return r.className ?? "";
        case "status":
          return STATUS_RANK[r.status] * 10 + (r.atRisk ? 0 : 1);
        case "weakest":
          return r.weakest?.ratio ?? 9;
        default:
          return r[sort.key] ?? (sort.dir === 1 ? Infinity : -Infinity);
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
      return c * sort.dir || a.fullName.localeCompare(b.fullName);
    });
  })();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs space-y-1">
          <Label htmlFor="cari">Cari siswa</Label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-brand-gray-light" />
            <Input id="cari" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama atau NIS" className="h-9 pl-8" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="kelas">Kelas</Label>
          <select id="kelas" value={cls} onChange={(e) => setCls(e.target.value)} className="h-9 rounded-lg border border-input bg-white px-2 text-sm">
            <option value="">Semua kelas</option>
            {classes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">Status</Label>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-input bg-white px-2 text-sm">
            <option value="">Semua status</option>
            <option value="berisiko">Berisiko</option>
            {(["intervensi", "berkembang", "cakap", "mahir", "kurang_data"] as const).map((s) => (
              <option key={s} value={s}>{MASTERY_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <p className="ml-auto text-sm text-brand-gray-light" aria-live="polite">{visible.length} dari {rows.length} siswa</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50 text-brand-gray-light">
            <tr>
              <Th k="fullName" sort={sort} onSort={onSort}>Nama</Th>
              <Th k="className" sort={sort} onSort={onSort}>Kelas</Th>
              <Th k="lastScore" right sort={sort} onSort={onSort}>Nilai TO terakhir</Th>
              <Th k="change" right sort={sort} onSort={onSort}>Perubahan</Th>
              <Th k="practiceAccuracy" right sort={sort} onSort={onSort}>Akurasi latihan</Th>
              <Th k="weakest" sort={sort} onSort={onSort}>Kompetensi terlemah</Th>
              <Th k="status" sort={sort} onSort={onSort}>Status</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <Link href={`/tka/siswa/${r.id}${query}`} className="font-medium text-brand-blue hover:underline">{r.fullName}</Link>
                  <span className="block text-xs tabular-nums text-brand-gray-light">NIS {r.nis}</span>
                </td>
                <td className="px-3 py-2">{r.className ?? "–"}</td>
                <td className="px-3 py-2 text-right tabular-nums" title={r.lastTryoutName ?? undefined}>{num(r.lastScore)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.change == null ? "–" : (
                    <span className={r.change < 0 ? "text-status-intervensi" : r.change > 0 ? "text-status-cakap" : undefined}>
                      {r.change > 0 ? "+" : ""}
                      {num(r.change)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(r.practiceAccuracy)}</td>
                <td className="max-w-64 px-3 py-2">{r.weakest ? `${r.weakest.name} (${pct(r.weakest.ratio)})` : "–"}</td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    <StatusBadge status={r.status} />
                    {r.atRisk ? <RiskBadge reasons={r.riskReasons} /> : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-brand-gray-light">
        Nilai, perubahan, akurasi, dan kompetensi terlemah untuk {subjectName}. Status = status terendah dari semua mapel; “Berisiko” mengikuti aturan nilai TO.
      </p>
    </div>
  );
}
