"use client";

import { Loader2, Save, Trash2, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { commitImport, discardImport, rollbackImport, type ActionState } from "../../actions";
import type { BatchStatus } from "../../status";

function Confirm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.pending}>Batal</Button>
          <Button type="button" variant="destructive" onClick={props.onConfirm} disabled={props.pending}>
            {props.pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {props.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BatchActions(props: {
  batchId: string;
  status: BatchStatus;
  isSuperAdmin: boolean;
  savable: number;
  errors: number;
  warnings: number;
  blocked: boolean;
  replaces: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirm, setConfirm] = useState<"discard" | "rollback" | null>(null);

  function run(fn: () => Promise<ActionState>, after?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) toast.error(res.error);
      else if (res?.message) toast.success(res.message);
      after?.();
    });
  }

  if (props.status === "draft") {
    const needsAck = props.warnings > 0;
    const disabled = pending || props.blocked || props.savable === 0 || (needsAck && !acknowledged);
    return (
      <section aria-labelledby="simpan" className="space-y-3 rounded-lg border border-border bg-white p-4">
        <h2 id="simpan" className="text-base font-semibold">Simpan data</h2>
        {props.blocked ? (
          <p className="text-sm text-status-intervensi">Perbaiki masalah pada seluruh file (lihat kotak merah di atas) sebelum menyimpan.</p>
        ) : (
          <p className="text-sm">
            {props.savable} baris akan disimpan.
            {props.errors > 0 ? ` ${props.errors} baris bermasalah tidak ikut disimpan; perbaiki dengan tombol "Ubah" atau di file lalu unggah ulang.` : ""}
          </p>
        )}
        {props.replaces && !props.blocked ? <p className="text-sm text-brand-gray-light">{props.replaces} Data lama tetap bisa dipulihkan oleh Super Admin.</p> : null}
        {needsAck && !props.blocked ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            Saya sudah memeriksa {props.warnings} baris berstatus “Perlu dicek” (mis. nama siswa yang dicocokkan otomatis).
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="lg" disabled={disabled} onClick={() => run(() => commitImport(props.batchId))}>
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}
            Simpan {props.savable} baris
          </Button>
          <Button type="button" size="lg" variant="outline" disabled={pending} onClick={() => setConfirm("discard")}>
            <Trash2 aria-hidden="true" />
            Hapus draf
          </Button>
        </div>
        <Confirm
          open={confirm === "discard"}
          onOpenChange={(o) => setConfirm(o ? "discard" : null)}
          title="Hapus draf unggahan ini?"
          description="Pratinjau dan pemetaan untuk file ini dihapus. Tidak ada data yang tersimpan yang berubah."
          confirmLabel="Hapus draf"
          pending={pending}
          onConfirm={() => run(() => discardImport(props.batchId))}
        />
      </section>
    );
  }

  if (props.status === "committed" && props.isSuperAdmin) {
    return (
      <section aria-labelledby="batalkan" className="space-y-3 rounded-lg border border-border bg-white p-4">
        <h2 id="batalkan" className="text-base font-semibold">Batalkan unggahan (rollback)</h2>
        <p className="text-sm text-brand-gray-light">
          Menghapus semua data dari unggahan ini dan memulihkan data yang digantikannya. Tindakan ini tercatat di audit log.
        </p>
        <Button type="button" variant="destructive" disabled={pending} onClick={() => setConfirm("rollback")}>
          <Undo2 aria-hidden="true" />
          Batalkan unggahan ini
        </Button>
        <Confirm
          open={confirm === "rollback"}
          onOpenChange={(o) => setConfirm(o ? "rollback" : null)}
          title="Batalkan unggahan ini?"
          description="Semua data dari unggahan ini dihapus dari dashboard, dan data sebelumnya (bila ada) dipulihkan."
          confirmLabel="Ya, batalkan"
          pending={pending}
          onConfirm={() => run(() => rollbackImport(props.batchId), () => setConfirm(null))}
        />
      </section>
    );
  }

  return null;
}
