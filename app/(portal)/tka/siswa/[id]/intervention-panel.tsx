"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addIntervention, updateIntervention, type InterventionState } from "./actions";

export const IV_STATUS = { planned: "Direncanakan", in_progress: "Berjalan", done: "Selesai" } as const;

const selectClass = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky";

export function AddInterventionForm(props: { studentId: string; competencies: { id: string; name: string; subject: string }[]; suggested?: string }) {
  const [state, action, pending] = useActionState<InterventionState, FormData>(addIntervention, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="studentId" value={props.studentId} />
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="iv-action">Tindakan</Label>
        <Input id="iv-action" name="action" required maxLength={500} placeholder="mis. Kelas remedial pecahan 2× sepekan" className="h-9" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="iv-comp">Kompetensi (opsional)</Label>
        <select id="iv-comp" name="competencyId" className={selectClass} defaultValue={props.suggested ?? ""}>
          <option value="">— Umum —</option>
          {props.competencies.map((c) => (
            <option key={c.id} value={c.id}>{c.subject}: {c.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="iv-status">Status</Label>
          <select id="iv-status" name="status" className={selectClass} defaultValue="planned">
            {Object.entries(IV_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="iv-start">Mulai</Label>
          <Input id="iv-start" name="startedAt" type="date" className="h-9" />
        </div>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="iv-notes">Catatan (opsional)</Label>
        <textarea id="iv-notes" name="notes" rows={2} maxLength={2000} className="w-full rounded-lg border border-input bg-white px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky" />
      </div>
      {state.error ? (
        <Alert variant="destructive" className="sm:col-span-2"><AlertDescription>{state.error}</AlertDescription></Alert>
      ) : state.message ? (
        <p className="text-sm text-status-cakap sm:col-span-2" role="status">{state.message}</p>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan catatan"}</Button>
      </div>
    </form>
  );
}

export function UpdateInterventionForm(props: { id: string; status: keyof typeof IV_STATUS; outcome: string | null }) {
  const [state, action, pending] = useActionState<InterventionState, FormData>(updateIntervention, {});
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={props.id} />
      <div className="space-y-1">
        <Label htmlFor={`st-${props.id}`} className="text-xs">Status</Label>
        <select id={`st-${props.id}`} name="status" defaultValue={props.status} className="h-8 rounded-md border border-input bg-white px-2 text-sm">
          {Object.entries(IV_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div className="min-w-48 flex-1 space-y-1">
        <Label htmlFor={`out-${props.id}`} className="text-xs">Hasil</Label>
        <Input id={`out-${props.id}`} name="outcome" defaultValue={props.outcome ?? ""} maxLength={2000} className="h-8" placeholder="mis. Nilai latihan naik ke 75%" />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "…" : "Perbarui"}</Button>
      {state.error ? <p className="w-full text-xs text-status-intervensi">{state.error}</p> : null}
    </form>
  );
}
