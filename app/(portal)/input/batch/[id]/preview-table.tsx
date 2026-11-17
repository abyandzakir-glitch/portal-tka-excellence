"use client";

import { AlertTriangle, CheckCircle2, CircleAlert, MinusCircle, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveRowEdit } from "../../actions";

type RowStatus = "ok" | "warning" | "error" | "skipped";

export interface PreviewRow {
  rowNumber: number;
  status: RowStatus;
  cells: string[];
  issues: { level: "error" | "warning"; field?: string; fieldLabel?: string; message: string }[];
  values: Record<string, string>;
}

type Filter = "all" | "problems" | "error" | "ok";

const STATUS: Record<RowStatus, { label: string; icon: typeof CheckCircle2; className: string; row: string }> = {
  ok: { label: "Siap", icon: CheckCircle2, className: "text-status-cakap", row: "" },
  warning: { label: "Perlu dicek", icon: AlertTriangle, className: "text-status-berkembang", row: "bg-status-berkembang-tint/60" },
  error: { label: "Bermasalah", icon: CircleAlert, className: "text-status-intervensi", row: "bg-status-intervensi-tint/70" },
  skipped: { label: "Dilewati", icon: MinusCircle, className: "text-status-kurang-data", row: "text-brand-gray-light" },
};

const PAGE = 100;

export function PreviewTable(props: {
  batchId: string;
  editable: boolean;
  columns: string[];
  rows: PreviewRow[];
  editableFields: { key: string; label: string }[];
  defaultFilter: Filter;
}) {
  const [filter, setFilter] = useState<Filter>(props.defaultFilter);
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<PreviewRow | null>(null);

  const counts = {
    all: props.rows.length,
    problems: props.rows.filter((r) => r.status === "error" || r.status === "warning").length,
    error: props.rows.filter((r) => r.status === "error").length,
    ok: props.rows.filter((r) => r.status === "ok").length,
  };
  const visible = props.rows.filter((r) =>
    filter === "all" ? true : filter === "problems" ? r.status === "error" || r.status === "warning" : r.status === filter,
  );
  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "Semua" },
    { key: "problems", label: "Perlu perhatian" },
    { key: "error", label: "Bermasalah" },
    { key: "ok", label: "Siap" },
  ];

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Saring baris" className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={filter === t.key}
            onClick={() => {
              setFilter(t.key);
              setLimit(PAGE);
            }}
            className={cn(
              "rounded-md border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-brand-sky",
              filter === t.key ? "border-brand-blue bg-brand-blue-tint text-brand-blue-dark" : "border-border bg-white hover:bg-muted",
            )}
          >
            {t.label} <span className="tabular-nums">({counts[t.key]})</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-white p-6 text-center text-sm text-brand-gray-light">
          {filter === "all" ? "Tidak ada baris data di file." : "Tidak ada baris pada kategori ini."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Baris</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                {props.columns.map((c) => (
                  <th key={c} scope="col" className="px-3 py-2 font-medium">{c}</th>
                ))}
                <th scope="col" className="min-w-72 px-3 py-2 font-medium">Keterangan</th>
                {props.editable ? <th scope="col" className="px-3 py-2"><span className="sr-only">Ubah</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, limit).map((r) => {
                const st = STATUS[r.status];
                return (
                  <tr key={r.rowNumber} className={cn("border-t border-border align-top", st.row)}>
                    <td className="px-3 py-2 tabular-nums text-brand-gray-light">{r.rowNumber}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={cn("inline-flex items-center gap-1 font-medium", st.className)}>
                        <st.icon aria-hidden="true" className="size-4" />
                        {st.label}
                      </span>
                    </td>
                    {r.cells.map((c, i) => (
                      <td key={i} className="max-w-64 px-3 py-2">{c || "–"}</td>
                    ))}
                    <td className="px-3 py-2">
                      {r.issues.length ? (
                        <ul className="space-y-1">
                          {r.issues.map((i, k) => (
                            <li key={k} className={i.level === "error" ? "text-status-intervensi" : "text-status-berkembang"}>
                              {i.fieldLabel ? <span className="font-medium">{i.fieldLabel}: </span> : null}
                              {i.message}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-brand-gray-light">–</span>
                      )}
                    </td>
                    {props.editable ? (
                      <td className="px-3 py-2">
                        {r.status !== "ok" && props.editableFields.length ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(r)} aria-label={`Ubah baris ${r.rowNumber}`}>
                            <Pencil aria-hidden="true" />
                            Ubah
                          </Button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {visible.length > limit ? (
        <Button type="button" variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
          Tampilkan {Math.min(PAGE, visible.length - limit)} baris berikutnya (dari {visible.length - limit} lagi)
        </Button>
      ) : null}

      {editing ? (
        <EditRowDialog
          key={editing.rowNumber}
          batchId={props.batchId}
          row={editing}
          fields={props.editableFields}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function EditRowDialog(props: {
  batchId: string;
  row: PreviewRow;
  fields: { key: string; label: string }[];
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.fields.map((f) => [f.key, props.row.values[f.key] ?? ""])),
  );
  const [pending, startTransition] = useTransition();
  const problemFields = new Set(props.row.issues.map((i) => i.field).filter(Boolean));

  function save() {
    const changed = Object.fromEntries(
      Object.entries(values)
        .filter(([k, v]) => v !== (props.row.values[k] ?? ""))
        .map(([k, v]) => [k, v.trim() === "" ? null : v.trim()]),
    );
    if (Object.keys(changed).length === 0) {
      props.onClose();
      return;
    }
    startTransition(async () => {
      const res = await saveRowEdit(props.batchId, { rowNumber: props.row.rowNumber, values: changed });
      if (res.error) toast.error(res.error);
      else {
        toast.success(res.message ?? "Tersimpan");
        props.onClose();
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ubah baris {props.row.rowNumber}</DialogTitle>
          <DialogDescription>
            Perubahan hanya berlaku untuk unggahan ini; file asli tidak diubah. Data diperiksa ulang setelah disimpan.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {props.row.issues.length ? (
            <ul className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
              {props.row.issues.map((i, k) => (
                <li key={k} className={i.level === "error" ? "text-status-intervensi" : "text-status-berkembang"}>{i.message}</li>
              ))}
            </ul>
          ) : null}
          {props.fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`edit-${f.key}`} className={problemFields.has(f.key) ? "text-status-intervensi" : undefined}>
                {f.label}
              </Label>
              <Input
                id={`edit-${f.key}`}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                aria-invalid={problemFields.has(f.key) || undefined}
                className="h-9"
              />
            </div>
          ))}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose} disabled={pending}>Batal</Button>
            <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan perubahan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
