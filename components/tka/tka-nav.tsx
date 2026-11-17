import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "intervensi", label: "Kelompok Intervensi" },
  { key: "bandingkan", label: "Perbandingan TO" },
] as const;

/** Sub-navigation of the TKA dashboard; keeps the current filters in every link. */
export function TkaNav({ active, query, schoolCode }: { active: (typeof TABS)[number]["key"]; query: string; schoolCode?: string | null }) {
  const href = (key: string) => {
    if (key === "ringkasan") return `${schoolCode ? `/tka/sekolah/${schoolCode}` : "/tka"}${query}`;
    const sep = query ? "&" : "?";
    return `/tka/${key}${query}${schoolCode ? `${sep}sekolah=${schoolCode}` : ""}`;
  };
  return (
    <nav aria-label="Bagian TKA Dashboard" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={href(t.key)}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-brand-sky",
            active === t.key ? "border-brand-blue font-medium text-brand-blue" : "border-transparent text-brand-gray-light hover:text-brand-gray",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
