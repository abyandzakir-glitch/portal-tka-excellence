"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import { ACHIEVEMENT_PERIOD_LABEL, ACHIEVEMENT_PERIODS, type AchievementPeriodPreset } from "@/lib/achievements/period";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 rounded-lg border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky disabled:opacity-50";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** URL keys owned by this bar; old academic-year keys are dropped on any change. */
const PERIOD_KEYS = ["tahun", "periode", "bulan", "pekan", "dari", "sampai", "ta"] as const;

/**
 * Prestasi filters: calendar year (not academic year), school, and period
 * within the year. All in the URL so a dashboard link can be shared (§12).
 */
export function AchievementPeriodBar(props: {
  /** Selectable calendar years, newest first. */
  years: number[];
  currentYear: number;
  /** The year used when the URL has none (current year in Asia/Jakarta, from the server). */
  defaultYear: number;
  preset: AchievementPeriodPreset;
  /** "YYYY-MM" when preset is "bulan". */
  month: string | null;
  schools?: { code: string; name: string }[];
  currentSchool?: string | null;
  periodLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const get = (k: string) => params.get(k) ?? "";

  function update(changes: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    sp.delete("ta"); // TKA academic-year filter does not apply here
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    if (sp.get("periode") === "tahun") sp.delete("periode");
    if (sp.get("tahun") === String(props.defaultYear)) sp.delete("tahun");
    const qs = sp.toString();
    startTransition(() => router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false }));
  }

  function setYear(year: string) {
    if (props.preset === "bulan") {
      // Keep the same month in the newly chosen year.
      const mm = props.month?.slice(5, 7) ?? "01";
      update({ tahun: year, bulan: `${year}-${mm}` });
    } else if (props.preset === "pekan" || props.preset === "rentang") {
      // A week or a free range is not tied to one year: switching year means the whole year.
      update({ tahun: year, periode: null, pekan: null, dari: null, sampai: null });
    } else {
      update({ tahun: year });
    }
  }

  function setPreset(preset: string) {
    const clear = Object.fromEntries(PERIOD_KEYS.filter((k) => k !== "tahun").map((k) => [k, null]));
    update({ ...clear, periode: preset });
  }

  return (
    <div className="mb-6 space-y-2" aria-busy={pending}>
      <div className={cn("flex flex-wrap items-end gap-3 transition-opacity", pending && "opacity-60")}>
        <div className="space-y-1">
          <Label htmlFor="f-tahun">Tahun</Label>
          <select id="f-tahun" className={selectClass} value={String(props.currentYear)} onChange={(e) => setYear(e.target.value)}>
            {props.years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {props.schools ? (
          <div className="space-y-1">
            <Label htmlFor="f-sekolah">Sekolah</Label>
            <select id="f-sekolah" className={selectClass} value={props.currentSchool ?? ""} onChange={(e) => update({ sekolah: e.target.value || null })}>
              <option value="">Semua sekolah (jaringan)</option>
              {props.schools.map((s) => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="f-periode">Periode</Label>
          <select id="f-periode" className={selectClass} value={props.preset} onChange={(e) => setPreset(e.target.value)}>
            {ACHIEVEMENT_PERIODS.map((p) => (
              <option key={p} value={p}>{ACHIEVEMENT_PERIOD_LABEL[p]}</option>
            ))}
          </select>
        </div>

        {props.preset === "bulan" ? (
          <div className="space-y-1">
            <Label htmlFor="f-bulan">Bulan</Label>
            <select
              id="f-bulan"
              className={selectClass}
              value={props.month?.slice(5, 7) ?? ""}
              onChange={(e) => update({ bulan: `${props.currentYear}-${e.target.value}` })}
            >
              {MONTHS.map((m, i) => {
                const mm = String(i + 1).padStart(2, "0");
                return <option key={mm} value={mm}>{m}</option>;
              })}
            </select>
          </div>
        ) : null}
        {props.preset === "pekan" ? (
          <div className="space-y-1">
            <Label htmlFor="f-pekan">Tanggal di pekan itu</Label>
            <input id="f-pekan" type="date" className={selectClass} defaultValue={get("pekan")} onChange={(e) => e.target.value && update({ pekan: e.target.value })} />
          </div>
        ) : null}
        {props.preset === "rentang" ? (
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
