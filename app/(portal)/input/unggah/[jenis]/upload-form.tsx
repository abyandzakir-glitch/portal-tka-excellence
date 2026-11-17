"use client";

import { Download, FileUp, Loader2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startImport, type ActionState } from "../../actions";

export type UploadKind = "hasil" | "latihan" | "kisi" | "prestasi";

interface SchoolOption {
  id: string;
  code: string;
  name: string;
  level: "sd" | "smp";
}
interface SubjectOption {
  id: string;
  name: string;
  level: "sd" | "smp";
}
interface TryoutOption {
  id: string;
  name: string;
  date: string;
  level: "sd" | "smp";
  subjectName: string;
  ownerSchoolId: string | null;
  schoolIds: string[];
  itemCount: number;
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky disabled:opacity-50";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p id={`${id}-hint`} className="text-xs text-brand-gray-light">{hint}</p> : null}
    </div>
  );
}

function TemplateLink({ href, label }: { href: string | null; label: string }) {
  if (!href) {
    return <p className="text-sm text-brand-gray-light">Lengkapi pilihan di atas untuk mengunduh template.</p>;
  }
  return (
    <a href={href} className="inline-flex items-center gap-2 text-sm font-medium text-brand-blue hover:underline" download>
      <Download aria-hidden="true" className="size-4" />
      {label}
    </a>
  );
}

export function UploadForm(props: {
  kind: UploadKind;
  isSuperAdmin: boolean;
  ownSchool: SchoolOption | null;
  schools: SchoolOption[];
  subjects: SubjectOption[];
  tryouts: TryoutOption[];
  editableTryoutIds: string[];
  currentWeek: string;
}) {
  const { kind, isSuperAdmin, ownSchool } = props;
  const [state, action, pending] = useActionState<ActionState, FormData>(startImport, {});
  const [schoolId, setSchoolId] = useState(ownSchool?.id ?? "");
  const [tryoutId, setTryoutId] = useState("");
  const [mode, setMode] = useState<"baru" | "ubah">("baru");
  const [subjectId, setSubjectId] = useState("");
  const [week, setWeek] = useState(props.currentWeek);
  // Controlled so React does not clear them when the action returns an error.
  const [name, setName] = useState("");
  const [date, setDate] = useState("");

  const school = props.schools.find((s) => s.id === schoolId) ?? null;
  const subject = props.subjects.find((s) => s.id === subjectId) ?? null;

  const resultTryouts = useMemo(
    () => (school ? props.tryouts.filter((t) => t.schoolIds.includes(school.id)) : []),
    [props.tryouts, school],
  );
  const editableTryouts = props.tryouts.filter((t) => props.editableTryoutIds.includes(t.id));
  const chosenTryout = props.tryouts.find((t) => t.id === tryoutId) ?? null;

  let templateHref: string | null = null;
  let templateLabel = "Unduh template";
  if (kind === "hasil" && school && chosenTryout) {
    templateHref = `/input/template/hasil?to=${chosenTryout.id}&sekolah=${school.id}`;
    templateLabel = `Unduh template hasil ${chosenTryout.name} (${school.code}) — daftar siswa sudah terisi`;
  } else if (kind === "latihan" && school) {
    templateHref = `/input/template/latihan?sekolah=${school.id}&pekan=${week || props.currentWeek}`;
    templateLabel = `Unduh template latihan pekanan ${school.code}`;
  } else if (kind === "prestasi") {
    templateHref = `/input/template/prestasi${school ? `?sekolah=${school.id}` : ""}`;
    templateLabel = `Unduh template standar prestasi${school ? ` (${school.code})` : ""}`;
  } else if (kind === "kisi") {
    const sid = mode === "baru" ? subject?.id : undefined;
    const fromTryout = mode === "ubah" && chosenTryout ? props.subjects.find((s) => s.name === chosenTryout.subjectName && s.level === chosenTryout.level) : undefined;
    const target = sid ?? fromTryout?.id;
    if (target) {
      templateHref = `/input/template/kisi?mapel=${target}`;
      templateLabel = `Unduh template kisi-kisi ${subject?.name ?? fromTryout?.name} ${(subject?.level ?? fromTryout?.level ?? "").toUpperCase()}`;
    }
  }

  const levelSchools = subject ? props.schools.filter((s) => s.level === subject.level) : [];

  return (
    <form action={action} className="max-w-3xl space-y-6" aria-busy={pending}>
      <input type="hidden" name="jenis" value={kind} />

      <section className="space-y-4 rounded-lg border border-border bg-white p-5">
        <h2 className="text-base font-semibold">1. Pilih data</h2>

        {kind !== "kisi" ? (
          isSuperAdmin ? (
            <Field id="sekolah" label="Sekolah">
              <select
                id="sekolah"
                name="sekolah"
                className={selectClass}
                value={schoolId}
                onChange={(e) => {
                  setSchoolId(e.target.value);
                  setTryoutId("");
                }}
                required={kind !== "prestasi"}
              >
                <option value="">{kind === "prestasi" ? "Semua sekolah — baca kolom Sekolah di file" : "Pilih sekolah…"}</option>
                {props.schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-sm">Sekolah: <span className="font-semibold">{ownSchool?.name}</span></p>
          )
        ) : null}

        {kind === "hasil" ? (
          <Field id="to" label="Try out" hint={school && resultTryouts.length === 0 ? "Belum ada try out untuk sekolah ini. Unggah kisi-kisi TO terlebih dahulu." : undefined}>
            <select id="to" name="to" className={selectClass} value={tryoutId} onChange={(e) => setTryoutId(e.target.value)} disabled={!school} required>
              <option value="">{school ? "Pilih try out…" : "Pilih sekolah dulu"}</option>
              {resultTryouts.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.date} {t.itemCount ? `(${t.itemCount} soal)` : "(belum ada kisi-kisi)"}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {kind === "latihan" ? (
          <Field
            id="pekan"
            label="Pekan (bila file tidak punya kolom Pekan/Tanggal)"
            hint="Tanggal mana pun di pekan tersebut; sistem memakai hari Senin-nya. Kolom Pekan di file selalu diutamakan."
          >
            <Input id="pekan" name="pekan" type="date" value={week} onChange={(e) => setWeek(e.target.value)} className="h-9 max-w-48" />
          </Field>
        ) : null}

        {kind === "kisi" ? (
          <>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Kisi-kisi untuk</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="modus" value="baru" checked={mode === "baru"} onChange={() => setMode("baru")} />
                Try out baru
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="modus" value="ubah" checked={mode === "ubah"} onChange={() => setMode("ubah")} disabled={editableTryouts.length === 0} />
                Perbarui kisi-kisi try out yang sudah ada (mis. soal dianulir atau kunci diralat)
              </label>
            </fieldset>

            {mode === "baru" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="nama" label="Nama try out">
                  <Input
                    id="nama"
                    name="nama"
                    required
                    maxLength={120}
                    placeholder="mis. TO 5 Matematika SMP"
                    className="h-9"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field id="tanggal" label="Tanggal pelaksanaan">
                  <Input id="tanggal" name="tanggal" type="date" required className="h-9" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field id="mapel" label="Mapel & jenjang">
                  <select id="mapel" name="mapel" className={selectClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
                    <option value="">Pilih mapel…</option>
                    {props.subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} — {s.level.toUpperCase()}</option>
                    ))}
                  </select>
                </Field>
                {isSuperAdmin ? (
                  <fieldset className="space-y-1 sm:col-span-2">
                    <legend className="text-sm font-medium">Sekolah peserta (TO bersama jaringan)</legend>
                    {subject ? (
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {levelSchools.map((s) => (
                          <label key={s.id} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" name="peserta" value={s.id} defaultChecked />
                            {s.name}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-brand-gray-light">Pilih mapel dulu.</p>
                    )}
                  </fieldset>
                ) : (
                  <p className="text-sm text-brand-gray-light sm:col-span-2">
                    TO ini hanya untuk {ownSchool?.name}. TO bersama jaringan dibuat oleh Super Admin yayasan.
                  </p>
                )}
              </div>
            ) : (
              <Field id="to" label="Try out">
                <select id="to" name="to" className={selectClass} value={tryoutId} onChange={(e) => setTryoutId(e.target.value)} required>
                  <option value="">Pilih try out…</option>
                  {editableTryouts.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {t.date} ({t.itemCount} soal)
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-white p-5">
        <h2 className="text-base font-semibold">2. Siapkan file</h2>
        <TemplateLink href={templateHref} label={templateLabel} />
        <p className="text-sm text-brand-gray-light">
          Tidak wajib memakai template: file rekap dengan susunan kolom sendiri juga bisa dibaca. Anda bisa memeriksa dan
          membetulkan pemetaan kolomnya di langkah berikutnya.
        </p>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-white p-5">
        <h2 className="text-base font-semibold">3. Unggah</h2>
        <Field id="file" label="File Excel atau CSV" hint="Format .xlsx, .xls, atau .csv, maksimal 5 MB. File asli disimpan sebagai arsip unggahan.">
          <Input id="file" name="file" type="file" accept=".xlsx,.xls,.csv" required aria-describedby="file-hint" className="h-auto py-1.5" />
        </Field>
        {state.error ? (
          <Alert variant="destructive" aria-live="assertive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <FileUp aria-hidden="true" />}
          {pending ? "Membaca file…" : "Unggah & periksa"}
        </Button>
        <p className="text-xs text-brand-gray-light">Data belum tersimpan sampai Anda menekan “Simpan” di halaman pratinjau.</p>
      </section>
    </form>
  );
}
