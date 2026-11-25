/**
 * One try-out per name (subject + academic year), shared by every school that
 * sits it. Duplicates created before this rule (each school uploading the same
 * blueprint as a "new TO") are merged by Super Admin into one network TO.
 */
import { and, eq, sql } from "drizzle-orm";
import type { RlsTx } from "@/lib/db/rls";
import { academicYears, tryoutItems, tryouts, tryoutSchools } from "@/lib/db/schema";
import { formatDate } from "@/lib/format/id";
import { ImportError } from "@/lib/import/db/config";
import { rescoreTryout } from "@/lib/import/db/commit";

/** Same normalisation as app.normalize_tryout_name in SQL. */
export function normalizeTryoutName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const uuidArray = (ids: readonly string[]) => sql`${`{${ids.join(",")}}`}::uuid[]`;

export async function academicYearFor(tx: RlsTx, date: string): Promise<string> {
  const [year] = await tx
    .select({ id: academicYears.id })
    .from(academicYears)
    .where(and(sql`${academicYears.startDate} <= ${date}`, sql`${academicYears.endDate} >= ${date}`))
    .limit(1);
  if (!year) throw new ImportError("Tanggal TO berada di luar tahun ajaran yang terdaftar. Tambahkan tahun ajarannya dulu di Master Data.");
  return year.id;
}

/** A school's sitting date must fall in the TO's academic year. */
export async function assertDateInTryoutYear(tx: RlsTx, tryoutId: string, date: string): Promise<void> {
  const ok = await tx.execute<{ ok: boolean }>(sql`
    select exists (select 1 from public.tryouts t join public.academic_years y on y.id = t.academic_year_id
                    where t.id = ${tryoutId} and ${date}::date between y.start_date and y.end_date) as ok`);
  if (!ok[0]?.ok) throw new ImportError(`Tanggal ${formatDate(date)} berada di luar tahun ajaran try out ini.`);
}

/**
 * Records the day a school sat a shared TO. Goes through a SECURITY DEFINER
 * function: a school admin cannot write participant rows of a network TO.
 */
export async function setSchoolSittingDate(tx: RlsTx, tryoutId: string, schoolId: string, date: string): Promise<void> {
  const res = await tx.execute<{ ok: boolean }>(sql`select app.set_tryout_school_date(${tryoutId}, ${schoolId}, ${date}::date) as ok`);
  if (!res[0]?.ok) throw new ImportError(`Tanggal pelaksanaan ${formatDate(date)} tidak bisa disimpan (di luar tahun ajaran try out, atau sekolah bukan peserta).`);
}

/**
 * Refuses a new TO whose name already exists for the subject and academic year,
 * including TOs of other schools the caller cannot see (SECURITY DEFINER lookup).
 */
export async function assertTryoutNameFree(tx: RlsTx, t: { name: string; subjectId: string; date: string }): Promise<void> {
  const yearId = await academicYearFor(tx, t.date);
  const found = await tx.execute<{ id: string; date: string; owner_school_id: string | null; is_participant: boolean }>(
    sql`select id, date::text as date, owner_school_id, is_participant from app.find_tryouts_by_name(${t.name}, ${t.subjectId}, ${yearId})`,
  );
  const hit = found[0];
  if (!hit) return;
  if (hit.is_participant) {
    throw new ImportError(
      `Try out "${t.name}" untuk mapel ini sudah ada (${formatDate(String(hit.date))}). Jangan membuat TO baru: untuk memasukkan nilai, pilih TO itu di Unggah Hasil TO; untuk mengubah kisi-kisinya, pilih "Perbarui kisi-kisi TO yang ada".`,
    );
  }
  throw new ImportError(
    `Try out "${t.name}" sudah dibuat oleh sekolah lain atau yayasan. Agar dipakai bersama, minta Super Admin menambahkan sekolah Anda sebagai peserta di Master Data → Try Out.`,
  );
}

export interface MergeResult {
  keptId: string;
  removed: number;
  movedScores: number;
}

/**
 * Merges try-outs into the earliest one, which becomes a network TO sat by the
 * union of their schools. Results, item answers, import history (including
 * rollback snapshots) and drafts move with them. Refused when the blueprints
 * differ or a student has results in more than one of them. Super Admin only
 * (RLS also blocks other roles from writing other schools' rows).
 */
export async function mergeTryouts(tx: RlsTx, ids: readonly string[]): Promise<MergeResult> {
  const unique = [...new Set(ids)];
  if (unique.length < 2) throw new ImportError("Pilih minimal dua try out untuk digabung.");
  const rows = await tx
    .select({ id: tryouts.id, name: tryouts.name, date: tryouts.date, subjectId: tryouts.subjectId, yearId: tryouts.academicYearId, createdAt: tryouts.createdAt })
    .from(tryouts)
    .where(sql`${tryouts.id} = any(${uuidArray(unique)})`);
  if (rows.length !== unique.length) throw new ImportError("Sebagian try out tidak ditemukan. Muat ulang halaman lalu coba lagi.");
  if (new Set(rows.map((r) => `${r.subjectId}|${r.yearId}`)).size > 1) {
    throw new ImportError("Hanya try out dengan mapel dan tahun ajaran yang sama yang bisa digabung.");
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.getTime() - b.createdAt.getTime());
  const keep = rows[0]!;
  const others = rows.slice(1).map((r) => r.id);

  // 1. Blueprints must match item by item, or the moved answers would be scored differently.
  const items = await tx
    .select({ tryoutId: tryoutItems.tryoutId, number: tryoutItems.number, key: tryoutItems.answerKey, comp: tryoutItems.competencyId, voided: tryoutItems.isVoided })
    .from(tryoutItems)
    .where(sql`${tryoutItems.tryoutId} = any(${uuidArray(unique)})`);
  const sig = (id: string) =>
    new Map(items.filter((i) => i.tryoutId === id).map((i) => [i.number, `${i.key ?? ""}|${i.comp ?? ""}|${i.voided}`]));
  const base = sig(keep.id);
  const differing = new Set<number>();
  for (const id of others) {
    const s = sig(id);
    for (const n of new Set([...base.keys(), ...s.keys()])) if (base.get(n) !== s.get(n)) differing.add(n);
  }
  if (differing.size) {
    const list = [...differing].sort((a, b) => a - b);
    throw new ImportError(
      `Kisi-kisi try out ini berbeda di soal no. ${list.slice(0, 10).join(", ")}${list.length > 10 ? ", …" : ""} (nomor, kunci, kompetensi, atau anulir). Samakan dulu lewat "Perbarui kisi-kisi TO yang ada", lalu gabungkan.`,
    );
  }

  // 2. A student may have a result in only one of them.
  const clash = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from (
      select student_id from public.tryout_scores where tryout_id = any(${uuidArray(unique)})
       group by student_id having count(*) > 1) x`);
  if (Number(clash[0]?.n ?? 0) > 0) {
    throw new ImportError(`${clash[0]!.n} siswa punya hasil di lebih dari satu try out ini. Batalkan salah satu unggahannya dulu, lalu gabungkan.`);
  }

  const keepId = keep.id;
  const otherIds = uuidArray(others);

  // 3. Import history: results snapshots point at the kept TO and its items (rollback keeps working).
  await tx.execute(sql`
    update public.import_batches b
       set snapshot_json = jsonb_build_object(
             'scores', (select coalesce(jsonb_agg(e || jsonb_build_object('tryout_id', ${keepId}::text)), '[]'::jsonb)
                          from jsonb_array_elements(coalesce(b.snapshot_json -> 'scores', '[]'::jsonb)) e),
             'responses', (select coalesce(jsonb_agg(e || jsonb_build_object('tryout_id', ${keepId}::text, 'item_id', coalesce(k.id::text, e ->> 'item_id'))), '[]'::jsonb)
                          from jsonb_array_elements(coalesce(b.snapshot_json -> 'responses', '[]'::jsonb)) e
                          left join public.tryout_items d on d.id = (e ->> 'item_id')::uuid
                          left join public.tryout_items k on k.tryout_id = ${keepId} and k.number = d.number))
     where b.type = 'tryout_results' and b.tryout_id = any(${otherIds}) and b.snapshot_json is not null`);
  // Blueprints of the removed TOs can no longer be rolled back on their own.
  await tx.execute(sql`
    update public.import_batches set snapshot_json = jsonb_build_object('mergedInto', ${keepId}::text)
     where type = 'tryout_blueprint' and tryout_id = any(${otherIds}) and status = 'committed'`);
  await tx.execute(sql`update public.import_batches set tryout_id = ${keepId} where tryout_id = any(${otherIds})`);
  // Drafts still pointing at a removed TO.
  await tx.execute(sql`
    update public.import_batches
       set mapping_json = jsonb_set(mapping_json, '{options,tryoutId}', to_jsonb(${keepId}::text))
     where status = 'draft' and mapping_json -> 'options' ->> 'tryoutId' = any(${sql`${`{${others.join(",")}}`}::text[]`})`);

  // 4. Answers to the kept TO's item with the same number; scores and schools follow.
  await tx.execute(sql`
    update public.item_responses r
       set tryout_id = ${keepId}, item_id = k.id
      from public.tryout_items d
      join public.tryout_items k on k.tryout_id = ${keepId} and k.number = d.number
     where r.item_id = d.id and d.tryout_id = any(${otherIds})`);
  const moved = await tx.execute<{ n: number }>(sql`
    with m as (update public.tryout_scores set tryout_id = ${keepId} where tryout_id = any(${otherIds}) returning 1)
    select count(*)::int as n from m`);
  // 5. The kept TO becomes the network TO (a school-owned TO may only list its owner), dated at the earliest sitting.
  //    Each school keeps the day it sat its own copy.
  await tx.update(tryouts).set({ ownerSchoolId: null, date: keep.date }).where(eq(tryouts.id, keepId));
  await tx.execute(sql`
    insert into public.tryout_schools (tryout_id, school_id, date)
    select distinct on (school_id) ${keepId}::uuid, school_id, date from public.tryout_schools
     where tryout_id = any(${otherIds})
     order by school_id, date
    on conflict do nothing`);
  await tx.execute(sql`delete from public.tryouts where id = any(${otherIds})`);
  await rescoreTryout(tx, keepId);

  return { keptId: keepId, removed: others.length, movedScores: Number(moved[0]?.n ?? 0) };
}

/**
 * Sets which schools sit a TO (same level only). A school that already has
 * results for it cannot be removed. A TO sat by more than one school, or by a
 * school other than its owner, becomes a network TO.
 */
export async function setTryoutSchools(
  tx: RlsTx,
  tryoutId: string,
  schoolIds: readonly string[],
  /** school id -> sitting date; schools left out keep theirs (new ones get the TO date). */
  dates: Readonly<Record<string, string>> = {},
): Promise<void> {
  const [t] = await tx
    .select({ id: tryouts.id, level: tryouts.level, owner: tryouts.ownerSchoolId, date: tryouts.date })
    .from(tryouts)
    .where(eq(tryouts.id, tryoutId))
    .limit(1);
  if (!t) throw new ImportError("Try out tidak ditemukan.");
  for (const d of new Set(Object.values(dates))) await assertDateInTryoutYear(tx, tryoutId, d);
  const valid = await tx.execute<{ id: string }>(sql`select id from public.schools where level = ${t.level} and id = any(${uuidArray(schoolIds)})`);
  const wanted = new Set(valid.map((v) => v.id));
  if (!wanted.size) throw new ImportError("Pilih minimal satu sekolah peserta.");
  const withResults = await tx.execute<{ name: string }>(sql`
    select distinct s.name from public.tryout_scores sc join public.schools s on s.id = sc.school_id
     where sc.tryout_id = ${tryoutId} and not (sc.school_id = any(${uuidArray([...wanted])}))`);
  if (withResults.length) {
    throw new ImportError(`${withResults.map((r) => r.name).join(", ")} sudah punya hasil untuk TO ini, jadi tidak bisa dihapus dari peserta.`);
  }
  // A school-owned TO may only list its owner: shared with others, it becomes a network TO first.
  if (t.owner && (wanted.size > 1 || !wanted.has(t.owner))) {
    await tx.update(tryouts).set({ ownerSchoolId: null }).where(eq(tryouts.id, tryoutId));
  }
  await tx.execute(sql`delete from public.tryout_schools where tryout_id = ${tryoutId} and not (school_id = any(${uuidArray([...wanted])}))`);
  await tx
    .insert(tryoutSchools)
    .values([...wanted].map((schoolId) => ({ tryoutId, schoolId, date: dates[schoolId] ?? t.date })))
    .onConflictDoNothing();
  for (const schoolId of wanted) {
    const d = dates[schoolId];
    if (d) await tx.update(tryoutSchools).set({ date: d }).where(and(eq(tryoutSchools.tryoutId, tryoutId), eq(tryoutSchools.schoolId, schoolId)));
  }
}
