import { AlertTriangle, CircleAlert, CircleDashed, CircleCheck, Star, TrendingDown, TrendingUp, MoveRight, HelpCircle } from "lucide-react";
import { MASTERY_STATUS_LABEL, type MasteryStatus, type TrendDirection } from "@/lib/metrics/mastery";
import { cn } from "@/lib/utils";

/** Semantic status scale (§7.3) — always icon + label, never colour alone. */
export const STATUS_STYLE: Record<MasteryStatus, { text: string; bg: string; icon: typeof CircleAlert }> = {
  intervensi: { text: "text-status-intervensi", bg: "bg-status-intervensi-tint", icon: CircleAlert },
  berkembang: { text: "text-status-berkembang", bg: "bg-status-berkembang-tint", icon: AlertTriangle },
  cakap: { text: "text-status-cakap", bg: "bg-status-cakap-tint", icon: CircleCheck },
  mahir: { text: "text-status-mahir", bg: "bg-status-mahir-tint", icon: Star },
  kurang_data: { text: "text-status-kurang-data", bg: "bg-status-kurang-data-tint", icon: CircleDashed },
};

export function StatusBadge({ status, className }: { status: MasteryStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", s.bg, s.text, className)}>
      <s.icon aria-hidden="true" className="size-3.5" />
      {MASTERY_STATUS_LABEL[status]}
    </span>
  );
}

export function RiskBadge({ reasons }: { reasons: string[] }) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-status-intervensi/40 px-2 py-0.5 text-xs font-medium text-status-intervensi"
      title={reasons.join("\n")}
    >
      <AlertTriangle aria-hidden="true" className="size-3.5" />
      Berisiko
    </span>
  );
}

const TREND: Record<TrendDirection, { label: string; icon: typeof TrendingUp; className: string }> = {
  naik: { label: "Naik", icon: TrendingUp, className: "text-status-cakap" },
  turun: { label: "Turun", icon: TrendingDown, className: "text-status-intervensi" },
  stagnan: { label: "Stagnan", icon: MoveRight, className: "text-brand-gray-light" },
  tidak_diketahui: { label: "Belum bisa dinilai", icon: HelpCircle, className: "text-brand-gray-light" },
};

export function TrendIndicator({ direction, delta }: { direction: TrendDirection; delta: number | null }) {
  const t = TREND[direction];
  const pts = delta == null ? "" : ` (${delta > 0 ? "+" : ""}${(delta * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })} poin)`;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", t.className)} title={`Tren 4 pekan terakhir vs sebelumnya${pts}`}>
      <t.icon aria-hidden="true" className="size-3.5" />
      {t.label}
      {pts ? <span className="sr-only">{pts}</span> : null}
    </span>
  );
}

export function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Keterangan status penguasaan">
      {(["intervensi", "berkembang", "cakap", "mahir", "kurang_data"] as const).map((s) => (
        <li key={s}>
          <StatusBadge status={s} />
        </li>
      ))}
    </ul>
  );
}
