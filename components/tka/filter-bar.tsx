"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import { PERIOD_LABEL, PERIOD_PRESETS, SUBJECT_CODES, SUBJECT_LABEL } from "@/lib/tka/filters";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 rounded-lg border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky disabled:opacity-50";

/**
 * One filter row above everything it scopes (§12, dataviz): academic year,
 * school, subject and period live in the URL, so a dashboard link can be shared.
 */
export function FilterBar(props: {
  years: { label: string; isActive: boolean }[];
  /** Offer a school switcher (network roles only). */
  schools?: { code: string; name: string }[];
  currentSchool?: string | null;
  showSubject?: boolean;
  periodLabel: string;
  /** School switcher sets ?sekolah= on this page instead of opening the school dashboard. */
  schoolParam?: boolean;
  /** With schoolParam: still offer "all schools" (network view). */
  allSchoolsOption?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const get = (k: string) => params.get(k) ?? "";

  function update(changes: Record<string, string | null>, path = pathname) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    if (sp.get("mapel") === "MAT") sp.delete("mapel");
    if (sp.get("periode") === "ta") sp.delete("periode");
    const qs = sp.toString();
    startTransition(() => router.push(`${path}${qs ? `?${qs}` : ""}`, { scroll: false }));
  }

  const period = get("periode") || "ta";
  const subject = get("mapel") || "MAT";
  const activeYear = props.years.find((y) => y.isActive)?.label ?? "";

  return (
    <div className="mb-6 space-y-2" aria-busy={pending}>
      <div className={cn("flex flex-wrap items-end gap-3 transition-opacity", pending && "opacity-60")}>
        {props.showSubject !== false ? (
          <div className="space-y-1">
            <span className="block text-sm font-medium" id="label-mapel">Mapel</span>
            <div role="radiogroup" aria-labelledby="label-mapel" className="inline-flex rounded-lg border border-input bg-white p-0.5">
              {SUBJECT_CODES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={subject === c}
                  onClick={() => update({ mapel: c })}
                  className={cn(
                    "h-8 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-brand-sky",
                    subject === c ? "bg-brand-blue text-white" : "text-brand-gray hover:bg-muted",
                  )}
                >
                  {SUBJECT_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="f-ta">Tahun ajaran</Label>
          <select id="f-ta" className={selectClass} value={get("ta") || activeYear} onChange={(e) => update({ ta: e.target.value === activeYear ? null : e.target.value })}>
            {props.years.map((y) => (
              <option key={y.label} value={y.label}>
                {y.label}
                {y.isActive ? " (aktif)" : ""}
              </option>
            ))}
          </select>
        </div>

        {props.schools ? (
          <div className="space-y-1">
            <Label htmlFor="f-sekolah">Sekolah</Label>
            <select
              id="f-sekolah"
              className={selectClass}
              value={props.currentSchool ?? ""}
              onChange={(e) =>
                props.schoolParam ? update({ sekolah: e.target.value || null }) : update({}, e.target.value ? `/tka/sekolah/${e.target.value}` : "/tka")
              }
            >
              {props.schoolParam && !props.allSchoolsOption ? null : <option value="">Semua sekolah (jaringan)</option>}
              {props.schools.map((s) => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="f-periode">Periode</Label>
          <select id="f-periode" className={selectClass} value={period} onChange={(e) => update({ periode: e.target.value, bulan: null, pekan: null, dari: null, sampai: null })}>
            {PERIOD_PRESETS.map((p) => (
              <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
            ))}
          </select>
        </div>

        {period === "bulan" ? (
          <div className="space-y-1">
            <Label htmlFor="f-bulan">Bulan</Label>
            <input id="f-bulan" type="month" className={selectClass} defaultValue={get("bulan")} onChange={(e) => e.target.value && update({ bulan: e.target.value })} />
          </div>
        ) : null}
        {period === "pekan" ? (
          <div className="space-y-1">
            <Label htmlFor="f-pekan">Tanggal di pekan itu</Label>
            <input id="f-pekan" type="date" className={selectClass} defaultValue={get("pekan")} onChange={(e) => e.target.value && update({ pekan: e.target.value })} />
          </div>
        ) : null}
        {period === "rentang" ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="f-dari">Dari</Label>
              <input id="f-dari" type="date" className={selectClass} defaultValue={get("dari")} onChange={(e) => e.target.value && update({ dari: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="f-sampai">Sampai</Label>
              <input id="f-sampai" type="date" className={selectClass} defaultValue={get("sampai")} onChange={(e) => e.target.value && update({ sampai: e.target.value })} />
            </div>
          </>
        ) : null}
      </div>
      <p className="text-xs text-brand-gray-light" aria-live="polite">
        Menampilkan data: <span className="font-medium text-brand-gray">{props.periodLabel}</span>
      </p>
    </div>
  );
}
