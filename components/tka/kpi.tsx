import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { DiagonalMotif } from "@/components/brand/diagonal-motif";
import { formatDate, formatNumber, formatPercent } from "@/lib/format/id";
import type { Kpis } from "@/lib/tka/load";
import { cn } from "@/lib/utils";

function Tile(props: { label: string; value: string; note?: React.ReactNode; tone?: "blue" | "red" | "sky" }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-white p-4">
      <DiagonalMotif variant="corner" tone={props.tone ?? "sky"} className="absolute right-0 top-0 size-7" />
      <p className="pr-6 text-sm text-brand-gray-light">{props.label}</p>
      <p className="mt-1 font-heading text-3xl font-semibold text-brand-gray">{props.value}</p>
      {props.note ? <div className="mt-1 text-xs text-brand-gray-light">{props.note}</div> : null}
    </div>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span>Belum ada TO pembanding</span>;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", value > 0 ? "text-status-cakap" : value < 0 ? "text-status-intervensi" : "text-brand-gray-light")}>
      <Icon aria-hidden="true" className="size-3.5" />
      {value > 0 ? "+" : ""}
      {value.toLocaleString("id-ID", { maximumFractionDigits: 2 })} poin vs TO sebelumnya
    </span>
  );
}

/** KPI row (§7.2a). Numbers use the brand headline face (Cabin) per the brand guide. */
export function KpiRow({ kpis, subjectName }: { kpis: Kpis; subjectName: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Tile
        label={`Rata-rata nilai TO terakhir · ${subjectName}`}
        value={kpis.average == null ? "–" : kpis.average.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
        note={<Delta value={kpis.delta} />}
      />
      <Tile
        label="Siswa mencapai target"
        value={formatPercent(kpis.shareMeetingTarget)}
        note={kpis.target != null ? `Target ${subjectName}: ${kpis.target}` : "Target berbeda per sekolah"}
        tone="sky"
      />
      <Tile
        label="Partisipasi TO terakhir"
        value={formatPercent(kpis.participation)}
        note={`${formatNumber(kpis.present)} dari ${formatNumber(kpis.expected)} siswa ikut`}
        tone="sky"
      />
      <Tile
        label={`Soal latihan pekan ini · ${subjectName}`}
        value={formatNumber(kpis.practiceThisWeek)}
        note={`Pekan mulai ${formatDate(kpis.practiceWeekStart)}`}
      />
      <Tile
        label="Siswa perlu intervensi"
        value={formatNumber(kpis.needsIntervention)}
        note={`dari ${formatNumber(kpis.students)} siswa · ${formatNumber(kpis.atRisk)} berisiko (semua mapel)`}
        tone="red"
      />
    </div>
  );
}
