import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { TIME_ZONE } from "@/lib/format/id";
import { cn } from "@/lib/utils";

export type BatchStatus = "draft" | "committed" | "rolled_back" | "failed" | "superseded";

const LABEL: Record<BatchStatus, string> = {
  draft: "Draf — belum disimpan",
  committed: "Tersimpan",
  superseded: "Digantikan",
  rolled_back: "Dibatalkan",
  failed: "Gagal",
};

const STYLE: Record<BatchStatus, string> = {
  draft: "bg-status-berkembang-tint text-status-berkembang",
  committed: "bg-status-cakap-tint text-status-cakap",
  superseded: "bg-status-kurang-data-tint text-status-kurang-data",
  rolled_back: "bg-status-kurang-data-tint text-status-kurang-data",
  failed: "bg-status-intervensi-tint text-status-intervensi",
};

export function BatchStatusBadge({ status, errorCount }: { status: BatchStatus; errorCount?: number }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge className={cn("border-0", STYLE[status])}>{LABEL[status]}</Badge>
      {status === "draft" && errorCount ? (
        <Badge className="border-0 bg-status-intervensi-tint text-status-intervensi">{errorCount} bermasalah</Badge>
      ) : null}
    </span>
  );
}

/** "17 Nov 2026, 14.05" in Asia/Jakarta. */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "–";
  return format(new TZDate(new Date(d), TIME_ZONE), "d MMM yyyy, HH.mm", { locale: localeId });
}
