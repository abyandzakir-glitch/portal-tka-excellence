"use client";

import { Combine, Loader2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mergeTryoutGroup, saveTryoutSchools, type TryoutActionState } from "./actions";

export function MergeButton({ ids, name, count }: { ids: string[]; name: string; count: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Combine aria-hidden="true" />
        Gabungkan {count} TO
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gabungkan menjadi satu TO jaringan?</DialogTitle>
            <DialogDescription>
              {count} try out “{name}” digabung ke yang paling awal. Semua nilai siswa, jawaban per soal, riwayat unggahan, dan sekolah pesertanya
              dipindahkan ke TO itu, lalu TO kembarnya dihapus. Penggabungan hanya berjalan bila kisi-kisinya sama persis. Tindakan ini tercatat di
              audit log dan tidak bisa dibatalkan dari portal.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Batal</Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await mergeTryoutGroup(ids);
                  if (r.error) toast.error(r.error);
                  else {
                    toast.success(r.message);
                    setOpen(false);
                  }
                })
              }
            >
              {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              Ya, gabungkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SchoolsForm(props: { tryoutId: string; schools: { id: string; code: string }[]; selected: string[]; locked: string[] }) {
  const [state, action, pending] = useActionState<TryoutActionState, FormData>(saveTryoutSchools, {});
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.message) toast.success(state.message);
  }, [state]);
  return (
    <form action={action} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <input type="hidden" name="tryoutId" value={props.tryoutId} />
      <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <legend className="sr-only">Sekolah peserta</legend>
        <span className="text-brand-gray-light" aria-hidden="true">Peserta:</span>
        {props.schools.map((s) => {
          const locked = props.locked.includes(s.id);
          return (
            <label key={s.id} className="flex items-center gap-1" title={locked ? "Sudah punya hasil untuk TO ini" : undefined}>
              <input type="checkbox" name="sekolah" value={s.id} defaultChecked={props.selected.includes(s.id)} disabled={locked} />
              {locked ? <input type="hidden" name="sekolah" value={s.id} /> : null}
              {s.code}
            </label>
          );
        })}
      </fieldset>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        Simpan peserta
      </Button>
    </form>
  );
}
