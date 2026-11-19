import Link from "next/link";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { PageHeader } from "@/components/layout/page";
import { canWriteData } from "@/lib/auth/roles";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { formatNumber, formatPercent, formatWeek, todayIso, weekStartOf } from "@/lib/format/id";
import { addWeeks, INPUT_STATUS_LABEL, type InputStatus } from "@/lib/metrics/input-status";
import { listRecentBatches, TKA_BATCH_KINDS } from "@/lib/queries/imports";
import { loadWeekStatus, TKA_GRADE, type SchoolWeekStatus } from "@/lib/queries/input-status";
import { cn } from "@/lib/utils";
import { BatchTable } from "./batch-table";
import { formatDateTime } from "./status";
import { UploadMenu } from "./upload-menu";

const STATUS_STYLE: Record<InputStatus, { badge: string; dot: string }> = {
  lengkap: { badge: "bg-status-cakap-tint text-status-cakap", dot: "bg-status-cakap" },
  sebagian: { badge: "bg-brand-sky-tint text-brand-sky-deeper", dot: "bg-brand-sky" },
  belum: { badge: "bg-muted text-brand-gray-light", dot: "bg-brand-gray-light/60" },
};

function StatusPill({ status }: { status: InputStatus }) {
  const st = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", st.badge)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", st.dot)} />
      {INPUT_STATUS_LABEL[status]}
    </span>
  );
}

function parseWeek(raw: string | string[] | undefined, current: string): string {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) return current;
  const w = weekStartOf(raw);
  return w > current ? current : w;
}

type LevelFilter = "semua" | "sd" | "smp";
const LEVEL_TABS: { key: LevelFilter; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "sd", label: "SD" },
  { key: "smp", label: "SMP" },
];

function href(week: string, current: string, level: LevelFilter): string {
  const qs = new URLSearchParams();
  if (week !== current) qs.set("pekan", week);
  if (level !== "semua") qs.set("jenjang", level);
  const s = qs.toString();
  return s ? `/input?${s}` : "/input";
}

/** Pusat Input Pekanan (CLAUDE.md §9.1): weekly TKA completeness per school, upload entry, recent uploads. */
export async function InputBoard({ searchParams }: { searchParams: PageProps<"/input">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const current = weekStartOf(todayIso());
  const week = parseWeek(sp.pekan, current);
  const writer = canWriteData(user.role);
  const [all, batches] = await queryAsUser((tx) =>
    Promise.all([loadWeekStatus(tx, week), writer ? listRecentBatches(tx, { kinds: TKA_BATCH_KINDS, limit: 5 }) : Promise.resolve([])]),
  );

  const hasBothLevels = all.some((r) => r.level === "sd") && all.some((r) => r.level === "smp");
  const level: LevelFilter = hasBothLevels && (sp.jenjang === "sd" || sp.jenjang === "smp") ? sp.jenjang : "semua";
  const rows = level === "semua" ? all : all.filter((r) => r.level === level);

  // Summary over the shown schools.
  const counted = rows.filter((r) => r.overall !== null);
  const complete = counted.filter((r) => r.overall === "lengkap").length;
  const toExpected = rows.reduce((n, r) => n + r.expected * r.tryouts.length, 0);
  const toScored = rows.reduce((n, r) => n + r.tryouts.reduce((m, t) => m + Math.min(t.scored, r.expected), 0), 0);
  const practiceExpected = rows.reduce((n, r) => n + r.expected, 0);
  const practiceIn = rows.reduce((n, r) => n + Math.min(r.practice.students, r.expected), 0);

  const weekLabel = formatWeek(week).replace(/^Pekan\s+/, "");

  return (
    <>
      <PageHeader
        title="Input Pekanan"
        actions={
          <>
            <nav aria-label="Pilih pekan" className="flex h-9 items-center rounded-lg border border-border bg-white">
              <Link
                href={href(addWeeks(week, -1), current, level)}
                aria-label="Pekan sebelumnya"
                className="flex h-full items-center rounded-l-lg px-2 text-brand-gray hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand-sky"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </Link>
              <span className="px-2 text-sm font-medium tabular-nums" aria-live="polite">
                {weekLabel}
                {week === current ? <span className="sr-only"> (pekan ini)</span> : null}
              </span>
              {week < current ? (
                <Link
                  href={href(addWeeks(week, 1), current, level)}
                  aria-label="Pekan berikutnya"
                  className="flex h-full items-center rounded-r-lg px-2 text-brand-gray hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand-sky"
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Link>
              ) : (
                <span aria-hidden="true" className="flex h-full items-center px-2 text-brand-gray-light/40">
                  <ChevronRight className="size-4" />
                </span>
              )}
            </nav>
            {writer ? <UploadMenu /> : null}
          </>
        }
      />

      <div className="space-y-8">
        <dl className="grid divide-y divide-border rounded-lg border border-border bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Stat label="Sekolah lengkap" value={counted.length ? `${complete} / ${counted.length}` : "–"} />
          <Stat
            label="Hasil try out masuk"
            value={toExpected ? formatPercent(toScored / toExpected) : "–"}
            note={toExpected ? undefined : "Tidak ada TO pekan ini atau pekan lalu"}
          />
          <Stat label="Latihan pekanan masuk" value={practiceExpected ? formatPercent(practiceIn / practiceExpected) : "–"} />
        </dl>

        <section aria-labelledby="kelengkapan" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="kelengkapan" className="text-lg font-semibold">Kelengkapan per sekolah</h2>
              <p className="text-xs text-brand-gray-light">
                Lengkap = semua siswa kelas {TKA_GRADE.sd}/{TKA_GRADE.smp} punya catatan latihan pekan ini, dan hasil TO pekan ini/pekan lalu masuk per butir.
              </p>
            </div>
            {hasBothLevels ? (
              <nav aria-label="Saring jenjang" className="flex rounded-lg bg-muted p-1 text-sm">
                {LEVEL_TABS.map((t) => (
                  <Link
                    key={t.key}
                    href={href(week, current, t.key)}
                    aria-current={level === t.key ? "page" : undefined}
                    className={cn(
                      "rounded-md px-3 py-1 focus-visible:outline-2 focus-visible:outline-brand-sky",
                      level === t.key ? "bg-white font-medium text-brand-gray ring-1 ring-border" : "text-brand-gray-light hover:text-brand-gray",
                    )}
                  >
                    {t.label}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((s) => (
              <SchoolCard key={s.schoolId} s={s} writer={writer} />
            ))}
          </div>
        </section>

        {writer ? (
          <section aria-labelledby="riwayat" className="overflow-hidden rounded-lg border border-border bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <h2 id="riwayat" className="text-lg font-semibold">Riwayat unggahan</h2>
              <Link href="/input/riwayat" className="text-sm font-medium text-brand-blue underline underline-offset-4 hover:no-underline">
                Lihat semua
              </Link>
            </div>
            {batches.length === 0 ? (
              <p className="flex items-center gap-2 px-5 py-6 text-sm text-brand-gray-light">
                <History aria-hidden="true" className="size-4" />
                Belum ada unggahan. Unggahan yang Anda buat akan tampil di sini beserta statusnya.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <BatchTable batches={batches} />
              </div>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-sm text-brand-gray-light">{label}</dt>
      <dd className="font-heading text-2xl font-semibold tabular-nums text-brand-gray">{value}</dd>
      {note ? <dd className="text-xs text-brand-gray-light">{note}</dd> : null}
    </div>
  );
}

function Progress({ label, done, total, extra }: { label: React.ReactNode; done: number; total: number; extra?: string }) {
  const ratio = total > 0 ? Math.min(done / total, 1) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">
          {formatNumber(done)} / {formatNumber(total)}
        </span>
      </div>
      {/* The numbers above carry the value; the bar is decorative. */}
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand-sky" style={{ width: `${ratio * 100}%` }} />
      </div>
      {extra ? <p className="text-xs text-brand-gray-light">{extra}</p> : null}
    </div>
  );
}

const SECTION_LABEL = "text-xs font-semibold uppercase tracking-wide text-brand-gray-light";

function SchoolCard({ s, writer }: { s: SchoolWeekStatus; writer: boolean }) {
  // Two try-outs of the same subject in the window: name them; otherwise the subject is enough.
  const dupSubjects = new Set(s.tryouts.map((t) => t.subject).filter((x, i, a) => a.indexOf(x) !== i));
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-white p-5" aria-labelledby={`sekolah-${s.code}`}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 id={`sekolah-${s.code}`} className="font-heading font-semibold">{s.name}</h3>
          <p className="text-xs text-brand-gray-light">
            {formatNumber(s.expected)} siswa · kelas {TKA_GRADE[s.level]}
          </p>
        </div>
        {s.overall ? <StatusPill status={s.overall} /> : null}
      </header>

      <div className="space-y-2.5">
        <h4 className={SECTION_LABEL}>Hasil try out</h4>
        {s.tryouts.length === 0 ? (
          <p className="text-sm text-brand-gray-light">Tidak ada TO pekan ini atau pekan lalu.</p>
        ) : (
          s.tryouts.map((t) => (
            <Progress
              key={t.id}
              label={
                <span title={t.name}>
                  {t.subject}
                  {dupSubjects.has(t.subject) ? <span className="text-brand-gray-light"> · {t.name}</span> : null}
                </span>
              }
              done={t.scored}
              total={s.expected}
              extra={t.totalsOnly > 0 ? `${formatNumber(t.totalsOnly)} siswa nilai total saja (tanpa jawaban per butir)` : undefined}
            />
          ))
        )}
      </div>

      <Progress label={<span className={SECTION_LABEL}>Latihan pekanan</span>} done={s.practice.students} total={s.expected} />

      <footer className="mt-auto space-y-3 border-t border-border pt-3">
        <p className="text-xs text-brand-gray-light">
          {s.lastUpload
            ? `Diperbarui ${formatDateTime(s.lastUpload.at)}${s.lastUpload.by ? ` oleh ${s.lastUpload.by}` : ""}`
            : "Belum ada unggahan"}
        </p>
        {writer ? (
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={`/input/unggah/hasil?sekolah=${s.schoolId}`}
              className="flex h-9 items-center justify-center rounded-lg border border-border text-sm font-medium text-brand-blue hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand-sky"
            >
              Unggah TO
            </Link>
            <Link
              href={`/input/unggah/latihan?sekolah=${s.schoolId}`}
              className="flex h-9 items-center justify-center rounded-lg border border-border text-sm font-medium text-brand-blue hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand-sky"
            >
              Unggah Latihan
            </Link>
          </div>
        ) : null}
      </footer>
    </article>
  );
}
