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

export function SchoolsForm(props: {
  tryoutId: string;
  /** The TO's reference date (default for a newly added school). */
  date: string;
  schools: { id: string; code: string }[];
  /** school id -> sitting date, for participating schools. */
  dates: Record<string, string>;
  locked: string[];
}) {
  const [state, action, pending] = useActionState<TryoutActionState, FormData>(saveTryoutSchools, {});
  const [checked, setChecked] = useState(() => new Set(Object.keys(props.dates)));
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.message) toast.success(state.message);
  }, [state]);
  return (
    <form action={action} className="space-y-2 text-sm">
      <input type="hidden" name="tryoutId" value={props.tryoutId} />
      <fieldset>
        <legend className="mb-1 text-brand-gray-light">Sekolah peserta & tanggal pelaksanaannya</legend>
        <ul className="space-y-1">
          {props.schools.map((s) => {
            const locked = props.locked.includes(s.id);
            const on = checked.has(s.id);
            return (
              <li key={s.id} className="flex items-center gap-2">
                <label className="flex w-28 items-center gap-1.5" title={locked ? "Sudah punya hasil untuk TO ini" : undefined}>
                  <input
                    type="checkbox"
                    name="sekolah"
                    value={s.id}
                    checked={on}
                    disabled={locked}
                    onChange={(e) =>
                      setChecked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(s.id);
                        else next.delete(s.id);
                        return next;
                      })
                    }
                  />
                  {locked ? <input type="hidden" name="sekolah" value={s.id} /> : null}
                  {s.code}
                </label>
                <input
                  type="date"
                  name={`tanggal_${s.id}`}
                  defaultValue={props.dates[s.id] ?? props.date}
                  disabled={!on}
                  required={on}
                  aria-label={`Tanggal pelaksanaan di ${s.code}`}
                  className="h-8 rounded-md border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky disabled:opacity-40"
                />
              </li>
            );
          })}
        </ul>
      </fieldset>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        Simpan peserta & tanggal
      </Button>
    </form>
  );
}
