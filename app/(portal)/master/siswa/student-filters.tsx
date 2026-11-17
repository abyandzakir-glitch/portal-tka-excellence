"use client";

import { parseAsString, useQueryStates } from "nuqs";
import { Search } from "lucide-react";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SCHOOL_VISUALS, SCHOOL_CODES } from "@/lib/brand/schools";

/** Filters are kept in the URL (shareable links, §12) and re-render the server page. */
export function StudentFilters({ showSchoolFilter }: { showSchoolFilter: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(
    { q: parseAsString.withDefault(""), sekolah: parseAsString.withDefault(""), hal: parseAsString },
    { shallow: false, startTransition, limitUrlUpdates: { method: "debounce", timeMs: 350 } },
  );

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={isPending}>
      <div className="w-full max-w-xs space-y-1">
        <Label htmlFor="cari-siswa">Cari siswa</Label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-brand-gray-light" />
          <Input
            id="cari-siswa"
            type="search"
            placeholder="Nama, NIS, atau NISN"
            className="h-9 pl-8"
            defaultValue={filters.q}
            onChange={(e) => void setFilters({ q: e.target.value || null, hal: null })}
          />
        </div>
      </div>
      {showSchoolFilter ? (
        <div className="space-y-1">
          <Label htmlFor="filter-sekolah">Sekolah</Label>
          <select
            id="filter-sekolah"
            className="h-9 rounded-lg border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky"
            value={filters.sekolah}
            onChange={(e) => void setFilters({ sekolah: e.target.value || null, hal: null }, { limitUrlUpdates: undefined })}
          >
            <option value="">Semua sekolah</option>
            {SCHOOL_CODES.map((code) => (
              <option key={code} value={code}>
                {SCHOOL_VISUALS[code].defaultName}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
