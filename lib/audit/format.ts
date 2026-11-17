/**
 * Turns raw audit rows (written by the triggers in drizzle/0001_rls_audit.sql)
 * into readable Indonesian summaries and before/after tables for /audit.
 */

export const ENTITY_LABEL: Record<string, string> = {
  schools: "Sekolah",
  academic_years: "Tahun ajaran",
  classes: "Kelas",
  students: "Siswa",
  class_enrollments: "Penempatan kelas",
  subjects: "Mata pelajaran",
  competencies: "Kompetensi",
  profiles: "Pengguna",
  import_batches: "Batch impor",
  mapping_profiles: "Profil pemetaan",
  tryouts: "Try out",
  tryout_schools: "Peserta try out",
  tryout_items: "Butir soal",
  tryout_scores: "Nilai try out",
  item_responses: "Jawaban per butir",
  practice_logs: "Log latihan",
  interventions: "Intervensi",
  achievements: "Prestasi",
  achievement_participants: "Peserta prestasi",
  settings: "Pengaturan",
};

export const ACTION_LABEL: Record<string, string> = {
  insert: "Tambah",
  update: "Ubah",
  delete: "Hapus",
  bulk_insert: "Tambah massal",
  bulk_update: "Ubah massal",
  bulk_delete: "Hapus massal",
};

const FIELD_LABEL: Record<string, string> = {
  full_name: "Nama",
  name: "Nama",
  nis: "NIS",
  nisn: "NISN",
  gender: "L/P",
  is_active: "Aktif",
  role: "Peran",
  school_id: "Sekolah",
  email: "Email",
  status: "Status",
  value_json: "Nilai",
  key: "Kunci",
  competition_name: "Nama lomba",
  achieved_on: "Tanggal",
  category: "Kategori",
  level: "Tingkat",
  rank: "Peringkat",
  organizer: "Penyelenggara",
  notes: "Catatan",
  evidence_url: "Link bukti",
  label: "Label",
  start_date: "Mulai",
  end_date: "Selesai",
  grade: "Tingkat kelas",
  code: "Kode",
  action: "Tindakan",
  row_count: "Jumlah baris",
  original_filename: "Nama file",
  committed_at: "Disimpan pada",
  rolled_back_at: "Dibatalkan pada",
  rolled_back_by: "Dibatalkan oleh",
  created_by: "Dibuat oleh",
  updated_by: "Diubah oleh",
  owner_user_id: "Penanggung jawab",
  warning_count: "Jumlah peringatan",
  error_count: "Jumlah bermasalah",
  student_id: "Siswa",
  class_id: "Kelas",
  academic_year_id: "Tahun ajaran",
  subject_id: "Mapel",
  competency_id: "Kompetensi",
  parent_id: "Induk",
  type: "Jenis",
};

/** Enum values shown in Indonesian (batch status, roles). */
const VALUE_LABEL: Record<string, string> = {
  draft: "Draf",
  committed: "Tersimpan",
  rolled_back: "Dibatalkan",
  superseded: "Digantikan",
  failed: "Gagal",
  super_admin: "Super Admin",
  viewer: "Manajemen",
  school_admin: "Admin Sekolah",
  teacher: "Guru",
  planned: "Direncanakan",
  in_progress: "Berjalan",
  done: "Selesai",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Optional lookups so ids read as names (users, schools). */
export type NameLookup = ReadonlyMap<string, string>;

/** Columns that are large or internal: never rendered (they can hold uploaded file contents). */
const HIDDEN = new Set(["source_json", "snapshot_json", "mapping_json", "raw_json", "normalized_json", "issues_json", "created_at", "updated_at"]);

const MAX_VALUE = 160;

export function fieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? key.replace(/_/g, " ");
}

const jakarta = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function formatValue(v: unknown, names?: NameLookup): string {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "boolean") return v ? "Ya" : "Tidak";
  if (typeof v === "string") {
    if (UUID.test(v)) return names?.get(v) ?? `${v.slice(0, 8)}…`;
    if (TIMESTAMP.test(v) && !Number.isNaN(Date.parse(v))) return jakarta.format(new Date(v));
    if (v in VALUE_LABEL) return VALUE_LABEL[v]!;
  }
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE - 1)}…` : s;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);

export interface DiffRow {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

/** Field-by-field table. Insert: after only; delete: before only; update: changed fields. */
export function diffRows(diff: unknown, names?: NameLookup): DiffRow[] {
  const d = obj(diff);
  if (!d) return [];
  const oldV = obj(d.old);
  const newV = obj(d.new);
  if (!oldV && !newV) {
    // Bulk entries: show their counters.
    return Object.entries(d)
      .filter(([k]) => !HIDDEN.has(k))
      .map(([k, v]) => ({ field: k, label: fieldLabel(k), before: null, after: formatValue(v, names) }));
  }
  const keys = [...new Set([...Object.keys(oldV ?? {}), ...Object.keys(newV ?? {})])].filter((k) => !HIDDEN.has(k) && k !== "id");
  return keys.map((k) => ({
    field: k,
    label: fieldLabel(k),
    before: oldV ? formatValue(oldV[k], names) : null,
    after: newV ? formatValue(newV[k], names) : null,
  }));
}

/** One-line summary for the table row. */
export function summarize(action: string, diff: unknown, names?: NameLookup): string {
  const d = obj(diff);
  if (!d) return "";
  if (action.startsWith("bulk_")) {
    const n = Number(d.row_count ?? 0);
    const batches = Array.isArray(d.import_batch_ids) ? d.import_batch_ids.length : 0;
    return `${n.toLocaleString("id-ID")} baris${batches ? ` dari ${batches} batch impor` : ""}`;
  }
  const rec = obj(d.new) ?? obj(d.old);
  if (action === "update") {
    const changed = diffRows(diff, names);
    if (changed.length === 0) return "Perubahan data internal";
    return changed
      .slice(0, 3)
      .map((r) => `${r.label}: ${r.before} → ${r.after}`)
      .join("; ")
      .concat(changed.length > 3 ? `; +${changed.length - 3} lainnya` : "");
  }
  // insert/delete: the most identifying field available.
  for (const k of ["full_name", "competition_name", "name", "label", "original_filename", "key", "nis", "code", "action"]) {
    const v = rec?.[k];
    if (typeof v === "string" && v) return formatValue(v, names);
  }
  return "";
}
