"use client";

import { Search, Trash2, X } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { deleteAchievement, saveAchievement, type AchievementFormState } from "@/app/(portal)/prestasi/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORIES, CATEGORY_LABEL, LEVEL_LABEL, LEVELS, RANK_LABEL, RANKS } from "@/lib/achievements/labels";

const selectClass = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky";

export interface FormStudent {
  id: string;
  name: string;
  nis: string;
  className: string | null;
  schoolId: string;
}
export interface FormValues {
  id?: string;
  schoolId: string;
  date: string;
  competition: string;
  category: string;
  level: string;
  rank: string;
  organizer: string;
  evidence: string;
  notes: string;
  participants: { studentId: string | null; rawName: string }[];
}

/** Student autocomplete (§9.4): pick from the school's students, or add a written name. */
function ParticipantPicker(props: { students: FormStudent[]; value: FormValues["participants"]; onChange: (v: FormValues["participants"]) => void }) {
  const [q, setQ] = useState("");
  const listId = useId();
  const term = q.trim().toLowerCase();
  const chosen = new Set(props.value.map((p) => p.studentId).filter(Boolean));
  const matches = term.length >= 2 ? props.students.filter((s) => !chosen.has(s.id) && (s.name.toLowerCase().includes(term) || s.nis.includes(term))).slice(0, 8) : [];
  const add = (p: FormValues["participants"][number]) => {
    props.onChange([...props.value, p]);
    setQ("");
  };
  return (
    <div className="space-y-2">
      {props.value.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Peserta terpilih">
          {props.value.map((p, i) => (
            <li key={`${p.studentId ?? p.rawName}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-brand-blue-tint px-2.5 py-1 text-sm text-brand-blue-dark">
              {p.rawName}
              {p.studentId ? null : <span className="text-xs">(nama tertulis)</span>}
              <button type="button" aria-label={`Hapus ${p.rawName}`} onClick={() => props.onChange(props.value.filter((_, j) => j !== i))} className="rounded-full p-0.5 hover:bg-white">
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-brand-gray-light" />
        <Input
          id="cari-peserta"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches[0]) add({ studentId: matches[0].id, rawName: matches[0].name });
            }
          }}
          placeholder="Ketik nama atau NIS siswa…"
          className="h-9 pl-8"
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        {term.length >= 2 ? (
          <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-white py-1 shadow-sm">
            {matches.map((s) => (
              <li key={s.id} role="option" aria-selected={false}>
                <button type="button" className="flex w-full justify-between px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => add({ studentId: s.id, rawName: s.name })}>
                  <span>{s.name}</span>
                  <span className="text-xs text-brand-gray-light">{s.className ?? ""} · NIS {s.nis}</span>
                </button>
              </li>
            ))}
            <li role="option" aria-selected={false}>
              <button type="button" className="w-full px-3 py-1.5 text-left text-sm text-brand-blue hover:bg-muted" onClick={() => add({ studentId: null, rawName: q.trim() })}>
                + Tambahkan “{q.trim()}” sebagai nama tertulis (tidak ada di daftar siswa)
              </button>
            </li>
          </ul>
        ) : null}
      </div>
      <p className="text-xs text-brand-gray-light">Pilih dari daftar siswa agar prestasi tercatat di profil siswa. Untuk tim, tambahkan semua anggota.</p>
    </div>
  );
}

export function AchievementForm(props: {
  values: FormValues;
  schools: { id: string; name: string }[];
  students: FormStudent[];
  lockedSchool: boolean;
}) {
  const [state, action, pending] = useActionState<AchievementFormState, FormData>(saveAchievement, {});
  const [delState, delAction, deleting] = useActionState<AchievementFormState, FormData>(deleteAchievement, {});
  const [schoolId, setSchoolId] = useState(props.values.schoolId);
  const [participants, setParticipants] = useState(props.values.participants);
  const v = props.values;

  return (
    <div className="max-w-3xl space-y-4">
      <form action={action} className="space-y-5 rounded-lg border border-border bg-white p-5">
        {v.id ? <input type="hidden" name="id" value={v.id} /> : null}
        <input type="hidden" name="peserta" value={JSON.stringify(participants)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="sekolah">Sekolah</Label>
            <select
              id="sekolah"
              name="sekolah"
              className={selectClass}
              value={schoolId}
              disabled={props.lockedSchool}
              onChange={(e) => {
                setSchoolId(e.target.value);
                setParticipants((ps) => ps.filter((p) => !p.studentId)); // matched students belong to the previous school
              }}
              required
            >
              <option value="">Pilih sekolah…</option>
              {props.schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {props.lockedSchool ? <input type="hidden" name="sekolah" value={schoolId} /> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="tanggal">Tanggal prestasi</Label>
            <Input id="tanggal" name="tanggal" type="date" defaultValue={v.date} required className="h-9" />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="cari-peserta">Siswa / tim</Label>
          {schoolId ? (
            <ParticipantPicker students={props.students.filter((s) => s.schoolId === schoolId)} value={participants} onChange={setParticipants} />
          ) : (
            <p className="text-sm text-brand-gray-light">Pilih sekolah dulu.</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="lomba">Nama lomba</Label>
          <Input id="lomba" name="lomba" defaultValue={v.competition} required maxLength={300} placeholder="mis. Olimpiade Sains Nasional 2026" className="h-9" />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { id: "kategori", label: "Kategori", value: v.category, options: CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]] as const) },
            { id: "tingkat", label: "Tingkat", value: v.level, options: LEVELS.map((c) => [c, LEVEL_LABEL[c]] as const) },
            { id: "peringkat", label: "Peringkat", value: v.rank, options: RANKS.map((c) => [c, RANK_LABEL[c]] as const) },
          ].map((s) => (
            <div key={s.id} className="space-y-1">
              <Label htmlFor={s.id}>{s.label}</Label>
              <select id={s.id} name={s.id} defaultValue={s.value} className={selectClass}>
                <option value="">— Tidak diketahui —</option>
                {s.options.map(([val, l]) => (
                  <option key={val} value={val}>{l}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <p className="-mt-3 text-xs text-brand-gray-light">Bila hasil tidak ada di daftar Peringkat (mis. “Medali Partisipasi”), kosongkan Peringkat dan tulis hasil aslinya di Catatan.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="penyelenggara">Penyelenggara</Label>
            <Input id="penyelenggara" name="penyelenggara" defaultValue={v.organizer} maxLength={300} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bukti">Link bukti (opsional)</Label>
            <Input id="bukti" name="bukti" type="url" defaultValue={v.evidence} placeholder="https://…" className="h-9" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="catatan">Catatan</Label>
          <textarea id="catatan" name="catatan" defaultValue={v.notes} rows={3} maxLength={2000} placeholder="mis. Kelas: 5A; Hasil asli: Medali Partisipasi" className="w-full rounded-lg border border-input bg-white px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky" />
        </div>

        {state.error ? (
          <Alert variant="destructive" aria-live="assertive"><AlertDescription>{state.error}</AlertDescription></Alert>
        ) : null}
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Menyimpan…" : v.id ? "Simpan perubahan" : "Simpan prestasi"}</Button>
      </form>

      {v.id ? (
        <form
          action={delAction}
          onSubmit={(e) => {
            if (!confirm("Hapus prestasi ini? Tindakan ini tercatat di audit log.")) e.preventDefault();
          }}
          className="flex items-center gap-3"
        >
          <input type="hidden" name="id" value={v.id} />
          <Button type="submit" variant="destructive" disabled={deleting}>
            <Trash2 aria-hidden="true" /> Hapus prestasi ini
          </Button>
          {delState.error ? <p className="text-sm text-status-intervensi">{delState.error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
