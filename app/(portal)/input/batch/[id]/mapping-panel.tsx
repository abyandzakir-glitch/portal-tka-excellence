"use client";

import { Columns3, Loader2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateMapping } from "../../actions";

export interface FieldOption {
  key: string;
  label: string;
  required: boolean;
  hint?: string;
}

const selectClass =
  "h-8 w-full rounded-md border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky";

export function MappingPanel(props: {
  batchId: string;
  sheets: { index: number; name: string; rows: number }[];
  sheetIndex: number;
  headerRowIndex: number;
  headerCandidates: { index: number; preview: string }[];
  headers: string[];
  samples: string[][];
  columns: (string | null)[];
  fields: FieldOption[];
  fromProfile: boolean;
}) {
  const [columns, setColumns] = useState(props.columns);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(() => props.fields.some((f) => f.required && !props.columns.includes(f.key)));

  const dirty = columns.some((c, i) => c !== props.columns[i]);
  const missing = props.fields.filter((f) => f.required && !columns.includes(f.key));
  const mappedCount = columns.filter(Boolean).length;
  const used = useMemo(() => new Map(columns.map((c, i) => [c, i])), [columns]);

  function submit(update: { sheetIndex: number; headerRowIndex: number; columns: (string | null)[] }) {
    startTransition(async () => {
      const res = await updateMapping(props.batchId, update);
      if (res.error) toast.error(res.error);
      else toast.success(res.message ?? "Tersimpan");
    });
  }

  function setColumn(col: number, key: string | null) {
    setColumns((prev) => prev.map((c, i) => (i === col ? key : key && c === key ? null : c)));
  }

  return (
    <section aria-labelledby="pemetaan" className="rounded-lg border border-border bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        aria-expanded={open}
        aria-controls="pemetaan-isi"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2">
          <Columns3 aria-hidden="true" className="size-5 text-brand-blue" />
          <span>
            <span id="pemetaan" className="block font-heading font-semibold">Pemetaan kolom</span>
            <span className="block text-sm text-brand-gray-light">
              {mappedCount} kolom dikenali
              {props.fromProfile ? " · memakai pemetaan yang Anda konfirmasi sebelumnya" : " · dicocokkan otomatis"}
              {missing.length ? ` · belum ada kolom: ${missing.map((m) => m.label).join(", ")}` : ""}
            </span>
          </span>
        </span>
        <span className="text-sm text-brand-blue">{open ? "Tutup" : "Periksa / ubah"}</span>
      </button>

      {open ? (
        <div id="pemetaan-isi" className="space-y-4 border-t border-border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {props.sheets.length > 1 ? (
              <div className="space-y-1">
                <Label htmlFor="sheet">Sheet yang dibaca</Label>
                <select
                  id="sheet"
                  className={selectClass}
                  value={props.sheetIndex}
                  disabled={pending}
                  onChange={(e) => submit({ sheetIndex: Number(e.target.value), headerRowIndex: 0, columns })}
                >
                  {props.sheets.map((s) => (
                    <option key={s.index} value={s.index}>{s.name} ({s.rows} baris)</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="header-row">Baris judul kolom</Label>
              <select
                id="header-row"
                className={selectClass}
                value={props.headerRowIndex}
                disabled={pending}
                onChange={(e) => submit({ sheetIndex: props.sheetIndex, headerRowIndex: Number(e.target.value), columns })}
              >
                {props.headerCandidates.map((c) => (
                  <option key={c.index} value={c.index}>Baris {c.index + 1}: {c.preview}</option>
                ))}
              </select>
              <p className="text-xs text-brand-gray-light">Baris di atasnya (judul, catatan) diabaikan.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-brand-gray-light">
                  <th scope="col" className="py-2 pr-3 font-medium">Kolom di file</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Contoh isi</th>
                  <th scope="col" className="w-64 py-2 font-medium">Dibaca sebagai</th>
                </tr>
              </thead>
              <tbody>
                {props.headers.map((h, col) => (
                  <tr key={col} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 font-medium">{h || <span className="text-brand-gray-light">(tanpa judul)</span>}</td>
                    <td className="max-w-72 truncate py-2 pr-3 text-brand-gray-light" title={props.samples[col]?.join(", ")}>
                      {props.samples[col]?.join(", ") || "–"}
                    </td>
                    <td className="py-2">
                      <label className="sr-only" htmlFor={`map-${col}`}>Kolom {h || col + 1} dibaca sebagai</label>
                      <select
                        id={`map-${col}`}
                        className={selectClass}
                        value={columns[col] ?? ""}
                        disabled={pending}
                        onChange={(e) => setColumn(col, e.target.value || null)}
                      >
                        <option value="">— Abaikan —</option>
                        {props.fields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                            {f.required ? " *" : ""}
                            {used.has(f.key) && used.get(f.key) !== col ? " (dipakai kolom lain)" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-brand-gray-light">* wajib ada. Satu jenis data hanya bisa dipakai satu kolom.</p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!dirty || pending}
              onClick={() => submit({ sheetIndex: props.sheetIndex, headerRowIndex: props.headerRowIndex, columns })}
            >
              {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Terapkan & periksa ulang
            </Button>
            {dirty ? (
              <Button type="button" variant="outline" disabled={pending} onClick={() => setColumns(props.columns)}>
                Urungkan perubahan
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
