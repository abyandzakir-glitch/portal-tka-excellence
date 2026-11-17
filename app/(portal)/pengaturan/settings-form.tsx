"use client";

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSettings, type SettingsState } from "./actions";

export interface SettingsFormValues {
  thresholds: { berkembang: number; cakap: number; mahir: number };
  weights: { tryout: number; recentWeeks: number; recentMultiplier: number };
  minItems: number;
  risk: { consecutiveBelowTarget: number; maxDropPoints: number };
  ai: boolean;
  subjects: { id: string; label: string; target: number }[];
  schools: { id: string; name: string; level: "sd" | "smp" }[];
  /** `${subjectId}:${schoolId}` -> override */
  overrides: Record<string, number>;
  subjectLevels: Record<string, "sd" | "smp">;
}

function NumberField(props: { id: string; label: string; defaultValue: number; suffix?: string; hint?: string; step?: string; min?: number; max?: number }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.id}>{props.label}</Label>
      <div className="flex items-center gap-2">
        <Input id={props.id} name={props.id} type="number" inputMode="decimal" step={props.step ?? "1"} min={props.min} max={props.max} defaultValue={props.defaultValue} className="h-9 w-28" required />
        {props.suffix ? <span className="text-sm text-brand-gray-light">{props.suffix}</span> : null}
      </div>
      {props.hint ? <p className="text-xs text-brand-gray-light">{props.hint}</p> : null}
    </div>
  );
}

const round = (x: number) => Math.round(x * 10000) / 100;

export function SettingsForm({ values }: { values: SettingsFormValues }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, {});
  const [toShare, setToShare] = useState(round(values.weights.tryout));

  return (
    <form action={action} className="max-w-4xl space-y-6">
      <fieldset className="space-y-3 rounded-lg border border-border bg-white p-5">
        <legend className="px-1 font-heading text-base font-semibold">Status penguasaan kompetensi</legend>
        <p className="text-sm text-brand-gray-light">Di bawah ambang Berkembang = <span className="font-medium text-status-intervensi">Perlu Intervensi</span>. Batas bawah bersifat inklusif.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField id="berkembang" label="Berkembang mulai" defaultValue={round(values.thresholds.berkembang)} suffix="%" step="0.1" min={0} max={100} />
          <NumberField id="cakap" label="Cakap mulai" defaultValue={round(values.thresholds.cakap)} suffix="%" step="0.1" min={0} max={100} />
          <NumberField id="mahir" label="Mahir mulai" defaultValue={round(values.thresholds.mahir)} suffix="%" step="0.1" min={0} max={100} />
        </div>
        <NumberField id="minButir" label="Minimal butir untuk diberi status" defaultValue={values.minItems} min={1} max={100} hint="Di bawah jumlah ini tampil “Data belum cukup” (butir TO + latihan)." />
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border bg-white p-5">
        <legend className="px-1 font-heading text-base font-semibold">Bobot perhitungan penguasaan</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="bobotTo">Bobot try out</Label>
            <div className="flex items-center gap-2">
              <Input id="bobotTo" name="bobotTo" type="number" min={0} max={100} step="1" value={toShare} onChange={(e) => setToShare(Number(e.target.value))} className="h-9 w-28" required />
              <span className="text-sm text-brand-gray-light">%</span>
            </div>
            <p className="text-xs text-brand-gray-light">Latihan pekanan otomatis {Number.isFinite(toShare) ? Math.max(0, 100 - toShare) : "–"}%.</p>
          </div>
          <NumberField id="pekanTerkini" label="Data terkini = pekan terakhir" defaultValue={values.weights.recentWeeks} suffix="pekan" min={1} max={26} />
          <NumberField id="pengaliTerkini" label="Bobot data terkini" defaultValue={values.weights.recentMultiplier} suffix="×" step="0.1" min={1} max={10} />
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border bg-white p-5">
        <legend className="px-1 font-heading text-base font-semibold">Siswa berisiko</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField id="toBerturut" label="Di bawah target berturut-turut pada" defaultValue={values.risk.consecutiveBelowTarget} suffix="TO" min={1} max={10} />
          <NumberField id="turunMaks" label="atau turun lebih dari" defaultValue={values.risk.maxDropPoints} suffix="poin vs TO sebelumnya" step="0.5" min={0} max={100} />
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border bg-white p-5">
        <legend className="px-1 font-heading text-base font-semibold">Target nilai try out</legend>
        <p className="text-sm text-brand-gray-light">Target per mapel berlaku untuk semua sekolah. Isi kolom sekolah hanya bila sekolah itu memakai target berbeda; kosongkan untuk mengikuti target mapel.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-brand-gray-light">
              <tr>
                <th scope="col" className="py-1.5 pr-3 font-medium">Mapel</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Target</th>
                <th scope="col" className="py-1.5 font-medium">Pengecualian per sekolah</th>
              </tr>
            </thead>
            <tbody>
              {values.subjects.map((s) => (
                <tr key={s.id} className="border-t border-border/60 align-top">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">{s.label}</th>
                  <td className="py-2 pr-3">
                    <label className="sr-only" htmlFor={`target:${s.id}`}>Target {s.label}</label>
                    <Input id={`target:${s.id}`} name={`target:${s.id}`} type="number" min={0} max={100} step="0.5" defaultValue={s.target} className="h-9 w-24" required />
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-3">
                      {values.schools
                        .filter((sc) => sc.level === values.subjectLevels[s.id])
                        .map((sc) => (
                          <label key={sc.id} className="flex items-center gap-1.5 text-xs">
                            <span className="w-36 truncate" title={sc.name}>{sc.name}</span>
                            <Input name={`target:${s.id}:${sc.id}`} type="number" min={0} max={100} step="0.5" defaultValue={values.overrides[`${s.id}:${sc.id}`] ?? ""} placeholder="–" className="h-8 w-20" />
                          </label>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border border-border bg-white p-5">
        <legend className="px-1 font-heading text-base font-semibold">Ekstraksi AI (Smart Import prestasi)</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="ai" defaultChecked={values.ai} className="mt-0.5" />
          <span>
            Izinkan ekstraksi data prestasi dari teks bebas, PDF, dan foto memakai layanan AI pihak ketiga (Anthropic Claude).
            <span className="block text-xs text-brand-gray-light">Nonaktif secara bawaan. Hanya konten file yang diunggah yang dikirim, dan hasilnya selalu ditinjau sebelum disimpan.</span>
          </span>
        </label>
      </fieldset>

      {state.error ? (
        <Alert variant="destructive" aria-live="assertive"><AlertDescription>{state.error}</AlertDescription></Alert>
      ) : state.message ? (
        <p role="status" className="text-sm text-status-cakap">{state.message}</p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Menyimpan…" : "Simpan pengaturan"}</Button>
    </form>
  );
}
