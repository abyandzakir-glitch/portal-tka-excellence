import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, CircleAlert, FileDown } from "lucide-react";
import { z } from "zod";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { formatDate, formatNumber, formatWeek } from "@/lib/format/id";
import type { BatchConfig, BatchSource } from "@/lib/import/db/config";
import { loadCompetencies, loadTryoutItems } from "@/lib/import/db/context";
import { fieldLabel } from "@/lib/import/mapping";
import { fieldSetFor, IMPORT_KIND_LABEL } from "@/lib/import/pipeline";
import type { Cell } from "@/lib/import/sheet";
import type { BlueprintItem } from "@/lib/import/tka/blueprint";
import type { PracticeRow } from "@/lib/import/tka/practice";
import { itemKey, type ResultRow } from "@/lib/import/tka/results";
import type { Issue, RowStatus } from "@/lib/import/types";
import { cellToString } from "@/lib/import/values";
import { CATEGORIES, CATEGORY_LABEL, LEVEL_LABEL, LEVELS, RANK_LABEL, RANKS } from "@/lib/achievements/labels";
import type { AchievementRow } from "@/lib/import/achievements/validate";
import type { StudentRow } from "@/lib/import/students/validate";
import { getBatch, listBatchRows, listSchools, listSubjects } from "@/lib/queries/imports";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BatchStatusBadge, formatDateTime } from "../../status";
import { BatchActions } from "./batch-actions";
import { MappingPanel, type FieldOption } from "./mapping-panel";
import { PreviewTable, type PreviewRow } from "./preview-table";

export const metadata: Metadata = { title: "Pratinjau Impor" };

export default function BatchPage(props: PageProps<"/input/batch/[id]">) {
  return (
    <>
      <nav aria-label="Jejak navigasi" className="mb-2 text-sm">
        <Link href="/input" className="text-brand-blue hover:underline">← Input Pekanan</Link>
      </nav>
      <Suspense fallback={<TableSkeleton rows={10} />}>
        <BatchContent params={props.params} />
      </Suspense>
    </>
  );
}

const PREVIEW_HEADER_ROWS = 15;

async function BatchContent({ params }: { params: PageProps<"/input/batch/[id]">["params"] }) {
  const user = await requireUser(["super_admin", "school_admin"]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const data = await queryAsUser(async (tx) => {
    const found = await getBatch(tx, id);
    if (!found) return null;
    const rows = await listBatchRows(tx, id);
    const subjectList = await listSubjects(tx);
    const comps = await loadCompetencies(tx, subjectList.map((s) => s.id));
    const config = found.batch.mappingJson as BatchConfig;
    const items = config.kind === "tryout_results" && config.options.tryoutId ? await loadTryoutItems(tx, config.options.tryoutId) : [];
    const schoolList = await listSchools(tx);
    return { found, rows, subjectList, comps, items, schoolList };
  });
  if (!data) notFound();

  const { batch, schoolName, tryoutName, uploaderName } = data.found;
  const config = batch.mappingJson as BatchConfig;
  const source = batch.sourceJson as BatchSource | null;
  const set = fieldSetFor(config.kind);
  const isDraft = batch.status === "draft";

  // ---- Mapping panel data -------------------------------------------------
  const sheet = source?.sheets[config.sheetIndex];
  const headerCandidates = (sheet?.rows ?? []).slice(0, PREVIEW_HEADER_ROWS).map((r, i) => ({
    index: i,
    preview: r.map(cellToString).filter(Boolean).slice(0, 6).join(" · ").slice(0, 90) || "(baris kosong)",
  }));
  const dataStart = config.headerRowIndex + 1;
  const samples = config.headers.map((_, col) =>
    (sheet?.rows ?? [])
      .slice(dataStart)
      .map((r) => cellToString(r[col]))
      .filter(Boolean)
      .slice(0, 3),
  );
  const fieldOptions: FieldOption[] = set.fields.map((f) => ({ key: f.key, label: f.label, required: Boolean(f.required), hint: f.hint }));
  if (config.kind === "tryout_results") {
    const numbers = new Set<number>(data.items.map((i) => i.number));
    for (const c of config.columns) if (c?.startsWith("item:")) numbers.add(Number(c.slice(5)));
    for (const n of [...numbers].sort((a, b) => a - b)) fieldOptions.push({ key: itemKey(n), label: `Soal no. ${n}`, required: false });
  }

  // ---- Preview rows ----------------------------------------------------------
  const subjectName = new Map(data.subjectList.map((s) => [s.id, s.name]));
  const compName = new Map([...data.comps.values()].flat().map((c) => [c.id, c.name]));
  const raw = (values: Record<string, Cell>, key: string) => cellToString(values[key]);
  const columnsByKind: Record<BatchConfig["kind"], string[]> = {
    tryout_blueprint: ["No", "Sub-kompetensi", "Level Kognitif", "Kesulitan", "Kunci", "Dianulir"],
    tryout_results: ["NIS", "Nama", "Kehadiran", "Nilai", "Soal dijawab"],
    practice_logs: ["NIS", "Nama", "Pekan", "Mapel", "Sub-kompetensi", "Dikerjakan", "Benar"],
    achievements: ["Tanggal", "Sekolah", "Peserta", "Nama Lomba", "Kategori", "Tingkat", "Peringkat", "Catatan"],
    students: ["NIS", "NISN", "Nama", "L/P", "Kelas", "Sekolah", "Perubahan"],
  };
  const schoolCode = new Map(data.schoolList.map((s) => [s.id, s.code]));
  const previewRows: PreviewRow[] = data.rows.map((r) => {
    const values = (r.rawJson ?? {}) as Record<string, Cell>;
    let cells: string[];
    if (config.kind === "tryout_blueprint") {
      const d = r.normalizedJson as BlueprintItem | null;
      cells = d
        ? [String(d.number), d.competencyName, d.cognitiveLevel ?? "–", d.difficulty ?? "–", d.answerKey ?? "–", d.isVoided ? "Ya" : "–"]
        : [raw(values, "number"), raw(values, "competency"), raw(values, "cognitive_level"), raw(values, "difficulty"), raw(values, "answer_key"), raw(values, "voided")];
    } else if (config.kind === "tryout_results") {
      const d = r.normalizedJson as ResultRow | null;
      cells = d
        ? [
            d.nis,
            d.studentName,
            d.status === "present" ? "Hadir" : "Absen",
            d.rawScore == null ? "–" : formatNumber(d.rawScore),
            d.hasItemDetail ? `${d.responses.filter((x) => x.answer != null).length} dari ${d.responses.length}` : "Nilai total",
          ]
        : [raw(values, "nis") || raw(values, "nisn"), raw(values, "name"), raw(values, "attendance"), raw(values, "total_score"), "–"];
    } else if (config.kind === "students") {
      const d = r.normalizedJson as StudentRow | null;
      cells = d
        ? [d.nis, d.nisn ?? "–", d.fullName, d.gender ?? "–", d.className ?? "–", schoolCode.get(d.schoolId) ?? "–", d.existingId ? d.changes.join("; ") : "Siswa baru"]
        : [raw(values, "nis"), raw(values, "nisn"), raw(values, "name"), raw(values, "gender"), raw(values, "class"), raw(values, "school"), "–"];
    } else if (config.kind === "achievements") {
      const d = r.normalizedJson as AchievementRow | null;
      cells = d
        ? [
            formatDate(d.achievedOn),
            schoolCode.get(d.schoolId) ?? "–",
            d.participants.length
              ? d.participants.map((p) => `${p.rawName}${p.studentId ? "" : " (belum cocok)"}`).join(", ")
              : "(tanpa nama)",
            d.competitionName,
            d.category ? CATEGORY_LABEL[d.category] : "–",
            d.level ? LEVEL_LABEL[d.level] : "–",
            d.rank ? RANK_LABEL[d.rank] : "–",
            d.notes ?? "",
          ]
        : [raw(values, "date"), raw(values, "school"), raw(values, "participants"), raw(values, "competition") || raw(values, "field"), raw(values, "category"), raw(values, "level"), raw(values, "rank"), raw(values, "notes")];
    } else {
      const d = r.normalizedJson as PracticeRow | null;
      cells = d
        ? [
            d.nis,
            d.studentName,
            formatWeek(d.weekStart),
            subjectName.get(d.subjectId) ?? "–",
            d.competencyId ? (compName.get(d.competencyId) ?? "–") : "Campuran",
            formatNumber(d.attempted),
            formatNumber(d.correct),
          ]
        : [raw(values, "nis") || raw(values, "nisn"), raw(values, "name"), raw(values, "week"), raw(values, "subject"), raw(values, "competency"), raw(values, "attempted"), raw(values, "correct")];
    }
    return {
      rowNumber: r.rowIndex,
      status: r.status as RowStatus,
      cells,
      issues: ((r.issuesJson ?? []) as Issue[]).map((i) => ({
        ...i,
        fieldLabel: i.field ? fieldLabel(set, i.field) : undefined,
      })),
      values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v == null ? "" : String(v)])),
    };
  });
  // Achievements: every canonical field is editable (e.g. set a Kategori the file never had),
  // with dropdowns for the fixed enums. Other kinds: the mapped columns.
  const editableFields =
    config.kind === "achievements"
      ? set.fields.map((f) => ({
          key: f.key,
          label: f.label,
          options:
            f.key === "category"
              ? CATEGORIES.map((v) => ({ value: v, label: CATEGORY_LABEL[v] }))
              : f.key === "level"
                ? LEVELS.map((v) => ({ value: v, label: LEVEL_LABEL[v] }))
                : f.key === "rank"
                  ? RANKS.map((v) => ({ value: v, label: RANK_LABEL[v] }))
                  : f.key === "school"
                    ? data.schoolList.map((s) => ({ value: s.code, label: s.name }))
                    : undefined,
        }))
      : config.columns
          .filter((c): c is string => Boolean(c))
          .filter((c) => !c.startsWith("item:"))
          .map((key) => ({ key, label: fieldLabel(set, key) }));

  // ---- Original file link -----------------------------------------------------
  let fileUrl: string | null = null;
  if (batch.filePath) {
    const supabase = await createSupabaseServerClient();
    const { data: signed } = await supabase.storage.from("imports").createSignedUrl(batch.filePath, 600, { download: batch.originalFilename ?? true });
    fileUrl = signed?.signedUrl ?? null;
  }

  const fileErrors = config.fileIssues.filter((i) => i.level === "error");
  const fileWarnings = config.fileIssues.filter((i) => i.level === "warning");
  const s = config.summary;
  const opts = config.options;
  const subtitle = [
    IMPORT_KIND_LABEL[config.kind],
    tryoutName ?? opts.newTryout?.name,
    schoolName ?? (config.kind === "tryout_blueprint" ? "TO bersama jaringan" : null),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <PageHeader
        title={batch.originalFilename ?? "Unggahan"}
        description={subtitle}
        actions={<BatchStatusBadge status={batch.status} />}
      />

      <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-border bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-brand-gray-light">Diunggah</dt><dd>{formatDateTime(batch.createdAt)} oleh {uploaderName ?? "–"}</dd></div>
        {batch.committedAt ? <div><dt className="text-brand-gray-light">Disimpan</dt><dd>{formatDateTime(batch.committedAt)}</dd></div> : null}
        {batch.rolledBackAt ? <div><dt className="text-brand-gray-light">Dibatalkan</dt><dd>{formatDateTime(batch.rolledBackAt)}</dd></div> : null}
        {opts.newTryout ? (
          <div><dt className="text-brand-gray-light">TO baru</dt><dd>{opts.newTryout.name}, {formatDate(opts.newTryout.date)}</dd></div>
        ) : null}
        {opts.defaultWeek ? <div><dt className="text-brand-gray-light">Pekan bawaan</dt><dd>{formatWeek(opts.defaultWeek)}</dd></div> : null}
        {fileUrl ? (
          <div>
            <dt className="text-brand-gray-light">File asli</dt>
            <dd><a href={fileUrl} className="inline-flex items-center gap-1 text-brand-blue hover:underline"><FileDown aria-hidden="true" className="size-4" />Unduh</a></dd>
          </div>
        ) : null}
      </dl>

      {source?.sheets[0]?.name === "Hasil ekstraksi AI" && isDraft ? (
        <p className="rounded-lg border border-brand-sky/40 bg-brand-sky-tint p-3 text-sm" role="note">
          <span className="font-medium">Data ini hasil ekstraksi AI.</span> Cocokkan setiap baris dengan dokumen aslinya (tautan “File asli” di atas)
          sebelum menyimpan. Kolom yang kurang diyakini AI ditandai “Perlu dicek”.
        </p>
      ) : null}

      {batch.status === "superseded" ? (
        <p className="rounded-lg border border-border bg-status-kurang-data-tint p-3 text-sm">
          Data dari unggahan ini sudah digantikan oleh unggahan yang lebih baru untuk try out dan sekolah yang sama.{" "}
          {batch.supersededBy ? <Link href={`/input/batch/${batch.supersededBy}`} className="text-brand-blue underline">Lihat unggahan terbaru</Link> : null}
        </p>
      ) : null}

      {isDraft ? (
        <MappingPanel
          // Remount after every server update so local dropdown state matches the saved mapping.
          key={`${config.sheetIndex}:${config.headerRowIndex}:${config.columns.join(",")}`}
          batchId={batch.id}
          sheets={(source?.sheets ?? []).map((sh, i) => ({ index: i, name: sh.name, rows: sh.rows.length }))}
          sheetIndex={config.sheetIndex}
          headerRowIndex={config.headerRowIndex}
          headerCandidates={headerCandidates}
          headers={config.headers}
          samples={samples}
          columns={config.columns}
          fields={fieldOptions}
          fromProfile={Boolean(config.fromProfile)}
        />
      ) : null}

      {fileErrors.length || fileWarnings.length ? (
        <section aria-label="Catatan untuk seluruh file" className="space-y-2">
          {fileErrors.map((i, k) => (
            <p key={`e${k}`} className="flex gap-2 rounded-lg border border-status-intervensi/30 bg-status-intervensi-tint p-3 text-sm text-status-intervensi">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {i.message}
            </p>
          ))}
          {fileWarnings.map((i, k) => (
            <p key={`w${k}`} className="flex gap-2 rounded-lg border border-status-berkembang/30 bg-status-berkembang-tint p-3 text-sm text-status-berkembang">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {i.message}
            </p>
          ))}
        </section>
      ) : null}

      <section aria-labelledby="pratinjau" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="pratinjau" className="text-lg font-semibold">{isDraft ? "Pratinjau data" : "Data dalam unggahan ini"}</h2>
          <p className="text-sm text-brand-gray-light" aria-live="polite">
            {formatNumber(s.total - s.skipped)} baris data · {formatNumber(s.ok)} siap · {formatNumber(s.warning)} perlu dicek ·{" "}
            {formatNumber(s.error)} bermasalah{s.skipped ? ` · ${formatNumber(s.skipped)} dilewati` : ""}
          </p>
        </div>
        <PreviewTable
          batchId={batch.id}
          editable={isDraft}
          columns={columnsByKind[config.kind]}
          rows={previewRows}
          editableFields={editableFields}
          defaultFilter={isDraft && (s.error > 0 || s.warning > 0) ? "problems" : "all"}
        />
      </section>

      <BatchActions
        batchId={batch.id}
        status={batch.status}
        isSuperAdmin={user.role === "super_admin"}
        savable={s.ok + s.warning}
        errors={s.error}
        warnings={s.warning}
        blocked={fileErrors.length > 0}
        replaces={config.kind === "tryout_results" ? "Data hasil TO yang sudah tersimpan untuk sekolah ini akan digantikan oleh unggahan ini." : null}
      />
    </div>
  );
}
