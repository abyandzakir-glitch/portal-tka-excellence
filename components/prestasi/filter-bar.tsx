"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import { CATEGORIES, CATEGORY_LABEL, LEVEL_LABEL, LEVELS, RANK_LABEL, RANKS } from "@/lib/achievements/labels";

const selectClass = "h-9 rounded-lg border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky";

const DIMENSIONS = [
  { key: "tingkat", label: "Tingkat", options: [...LEVELS.map((v) => [v, LEVEL_LABEL[v]] as const), ["KOSONG", "Tidak diketahui"] as const] },
  { key: "kategori", label: "Kategori", options: [...CATEGORIES.map((v) => [v, CATEGORY_LABEL[v]] as const), ["KOSONG", "Belum dikategorikan"] as const] },
  { key: "peringkat", label: "Peringkat", options: [...RANKS.map((v) => [v, RANK_LABEL[v]] as const), ["KOSONG", "Tanpa peringkat baku"] as const] },
  { key: "peserta", label: "Peserta", options: [["individu", "Individu"], ["tim", "Tim"], ["tanpa_nama", "Tanpa nama"]] as const },
] as const;

/** Achievement-specific filters (§8.2), kept in the URL next to year/period/school. */
export function AchievementFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const set = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    const qs = sp.toString();
    startTransition(() => router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false }));
  };
  const active = DIMENSIONS.some((d) => params.get(d.key));
  return (
    <div className="-mt-3 mb-6 flex flex-wrap items-end gap-3" aria-busy={pending}>
      {DIMENSIONS.map((d) => (
        <div key={d.key} className="space-y-1">
          <Label htmlFor={`f-${d.key}`}>{d.label}</Label>
          <select id={`f-${d.key}`} className={selectClass} value={params.get(d.key) ?? ""} onChange={(e) => set(d.key, e.target.value)}>
            <option value="">Semua</option>
            {d.options.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      ))}
      {active ? (
        <button
          type="button"
          className="h-9 rounded-md px-2 text-sm text-brand-blue hover:underline"
          onClick={() => {
            const sp = new URLSearchParams(params.toString());
            for (const d of DIMENSIONS) sp.delete(d.key);
            const qs = sp.toString();
            startTransition(() => router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false }));
          }}
        >
          Hapus filter
        </button>
      ) : null}
    </div>
  );
}
