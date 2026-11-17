import Link from "next/link";
import { CheckCircle2, CircleDashed, CircleDot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { canWriteData } from "@/lib/auth/roles";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { formatDate, formatNumber, formatWeek, todayIso, weekStartOf } from "@/lib/format/id";
import { addWeeks, INPUT_STATUS_LABEL, type InputStatus } from "@/lib/metrics/input-status";
import { loadWeekStatus, TKA_GRADE, type LastUpload, type SchoolWeekStatus } from "@/lib/queries/input-status";
import { cn } from "@/lib/utils";
import { formatDateTime } from "./status";

const STATUS_STYLE: Record<InputStatus, string> = {
  lengkap: "bg-status-cakap-tint text-status-cakap",
  sebagian: "bg-status-berkembang-tint text-status-berkembang",
  belum: "bg-status-intervensi-tint text-status-intervensi",
};
const STATUS_ICON = { lengkap: CheckCircle2, sebagian: CircleDot, belum: CircleDashed } as const;

function StatusBadge({ status }: { status: InputStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge className={cn("gap-1 border-0", STATUS_STYLE[status])}>
      <Icon aria-hidden="true" className="size-3.5" />
      {INPUT_STATUS_LABEL[status]}
    </Badge>
  );
}

/** Who uploaded last. Data entered outside an upload batch (e.g. migrated) has no uploader: show nothing. */
function Last({ last }: { last: LastUpload | null }) {
  if (!last) return null;
  return (
    <span className="block text-xs text-brand-gray-light">
      Terakhir diunggah {last.by ? `oleh ${last.by}, ` : ""}{formatDateTime(last.at)}
    </span>
  );
}

function parseWeek(raw: string | string[] | undefined, current: string): string {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) return current;
  const w = weekStartOf(raw);
  return w > current ? current : w;
}

/** Pusat Input Pekanan (CLAUDE.md §9.1): completeness per school for one week. */
export async function WeekStatusBoard({ searchParams }: { searchParams: PageProps<"/input">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const current = weekStartOf(todayIso());
  const week = parseWeek(sp.pekan, current);
  const rows = await queryAsUser((tx) => loadWeekStatus(tx, week));
  const writer = canWriteData(user.role);

  const counted = rows.filter((r) => r.overall !== null);
  const complete = counted.filter((r) => r.overall === "lengkap").length;
  const weekHref = (w: string) => (w === current ? "/input" : `/input?pekan=${w}`);

  return (
    <section aria-labelledby="status-pekan" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="status-pekan" className="text-lg font-semibold">
            Status input {week === current ? "pekan ini" : "pekan"}: {formatWeek(week)}
          </h2>
          <p className="text-sm text-brand-gray-light" aria-live="polite">
            {rows.length > 1 ? `${complete} dari ${counted.length} sekolah lengkap. ` : ""}
            Lengkap = latihan semua siswa kelas {TKA_GRADE.sd}/{TKA_GRADE.smp} dan hasil TO pekan ini/pekan lalu sudah masuk.
          </p>
        </div>
        <nav aria-label="Pilih pekan" className="flex items-center gap-3 text-sm">
          <Link href={weekHref(addWeeks(week, -1))} className="text-brand-blue hover:underline">← Pekan sebelumnya</Link>
          {week < current ? (
            <Link href={weekHref(addWeeks(week, 1))} className="text-brand-blue hover:underline">Pekan berikutnya →</Link>
          ) : null}
        </nav>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((s) => (
          <SchoolCard key={s.schoolId} s={s} writer={writer} />
        ))}
      </div>
    </section>
  );
}

function SchoolCard({ s, writer }: { s: SchoolWeekStatus; writer: boolean }) {
  return (
    <article className="flex flex-col rounded-lg border border-border bg-white" aria-labelledby={`sekolah-${s.code}`}>
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 id={`sekolah-${s.code}`} className="font-heading font-semibold">{s.name}</h3>
          <p className="text-xs text-brand-gray-light">
            <span className="font-mono">{s.code}</span> · {formatNumber(s.expected)} siswa kelas {TKA_GRADE[s.level]}
          </p>
        </div>
        {s.overall ? <StatusBadge status={s.overall} /> : null}
      </header>
      <dl className="flex-1 divide-y divide-border/60 text-sm">
        <div className="px-4 py-2.5">
          <dt className="flex items-center justify-between gap-2 font-medium">
            Hasil try out
            {s.tryouts.length === 0 ? <span className="text-xs font-normal text-brand-gray-light">Tidak ada TO</span> : null}
          </dt>
          <dd className="space-y-1.5">
            {s.tryouts.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-2">
                <span>
                  {t.name} <span className="text-xs text-brand-gray-light">({formatDate(t.date)})</span>
                  <span className="block text-xs text-brand-gray-light">
                    {formatNumber(t.scored)} dari {formatNumber(s.expected)} siswa
                    {t.totalsOnly > 0 ? ` · ${formatNumber(t.totalsOnly)} nilai total saja` : ""}
                  </span>
                </span>
                <StatusBadge status={t.status} />
              </div>
            ))}
            {s.tryouts.length > 0 ? <Last last={s.tryoutLast} /> : null}
          </dd>
        </div>
        <div className="px-4 py-2.5">
          <dt className="flex items-center justify-between gap-2 font-medium">
            Latihan pekanan
            <StatusBadge status={s.practice.status} />
          </dt>
          <dd>
            <span className="block text-xs text-brand-gray-light">
              {formatNumber(s.practice.students)} dari {formatNumber(s.expected)} siswa punya catatan latihan
            </span>
            <Last last={s.practice.last} />
          </dd>
        </div>
        <div className="px-4 py-2.5">
          <dt className="font-medium">Prestasi <span className="text-xs font-normal text-brand-gray-light">(informasi, tidak memengaruhi status)</span></dt>
          <dd>
            <span className="block text-xs text-brand-gray-light">
              {s.achievements.count > 0 ? `${formatNumber(s.achievements.count)} prestasi dicatat pekan ini` : "Belum ada prestasi baru dicatat pekan ini"}
            </span>
            <Last last={s.achievements.last} />
          </dd>
        </div>
      </dl>
      {writer && s.overall !== "lengkap" ? (
        <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-sm">
          {s.tryouts.some((t) => t.status !== "lengkap") ? (
            <Link href="/input/unggah/hasil" className="text-brand-blue hover:underline">Unggah hasil TO →</Link>
          ) : null}
          {s.practice.status !== "lengkap" ? (
            <Link href="/input/unggah/latihan" className="text-brand-blue hover:underline">Unggah latihan →</Link>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
