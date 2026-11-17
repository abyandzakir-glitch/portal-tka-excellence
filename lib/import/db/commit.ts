/**
 * Commit and rollback of import batches (CLAUDE.md §9.3 step 8).
 *
 * Every commit stores a snapshot of the data it replaces in
 * `import_batches.snapshot_json`; rollback deletes the batch's rows and puts
 * the snapshot back. Snapshots are built and restored inside Postgres
 * (to_jsonb / jsonb_populate_recordset), so all columns — ids, timestamps,
 * the batch each old row belonged to — survive the round trip.
 *
 * Approved rules (DECISIONS.md, Fase 2):
 *   - TO results replace the previous upload for the same TO + school; the
 *     older batch becomes "superseded" and is reinstated on rollback.
 *   - Practice logs replace stored logs with the same student/week/subject/competency.
 *   - Only Super Admin may roll back (also enforced by a database trigger).
 */
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { RlsTx } from "@/lib/db/rls";
import {
  academicYears,
  importBatches,
  importRows,
  itemResponses,
  mappingProfiles,
  practiceLogs,
  tryoutItems,
  tryoutSchools,
  tryouts,
  tryoutScores,
} from "@/lib/db/schema";
import { headerSignature } from "../mapping";
import type { BlueprintItem } from "../tka/blueprint";
import type { PracticeRow } from "../tka/practice";
import type { ResultRow } from "../tka/results";
import { ImportError, type BatchConfig } from "./config";
import { loadBatch, stageBatch, type ImportBatchRow } from "./stage";

export interface CommitResult {
  batchId: string;
  saved: number;
  tryoutId: string | null;
}

async function chunked<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function savableRows<T>(tx: RlsTx, batchId: string): Promise<T[]> {
  const rows = await tx
    .select({ data: importRows.normalizedJson })
    .from(importRows)
    .where(and(eq(importRows.batchId, batchId), inArray(importRows.status, ["ok", "warning"])))
    .orderBy(asc(importRows.rowIndex));
  return rows.map((r) => r.data as T).filter(Boolean);
}

/**
 * Recomputes is_correct (letter answers vs. current key) and raw_score for a
 * try-out after its blueprint changed (new key, item voided/un-voided).
 */
export async function rescoreTryout(tx: RlsTx, tryoutId: string) {
  await tx.execute(sql`
    update public.item_responses r
       set is_correct = (r.answer = i.answer_key)
      from public.tryout_items i
     where i.id = r.item_id and r.tryout_id = ${tryoutId}
       and i.answer_key is not null and r.answer ~ '^[A-E]$'`);
  await tx.execute(sql`
    update public.tryout_scores s
       set raw_score = x.score
      from (
        select r.student_id,
               round(100.0 * count(*) filter (where r.is_correct and not i.is_voided)
                     / nullif((select count(*) from public.tryout_items ti where ti.tryout_id = ${tryoutId} and not ti.is_voided), 0), 2) as score
          from public.item_responses r
          join public.tryout_items i on i.id = r.item_id
         where r.tryout_id = ${tryoutId}
         group by r.student_id
      ) x
     where s.tryout_id = ${tryoutId} and s.student_id = x.student_id
       and s.has_item_detail and s.status = 'present'`);
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

async function commitBlueprint(tx: RlsTx, batch: ImportBatchRow, config: BatchConfig): Promise<{ saved: number; tryoutId: string }> {
  const items = await savableRows<BlueprintItem>(tx, batch.id);
  const opts = config.options;

  if (opts.newTryout) {
    const t = opts.newTryout;
    const [year] = await tx
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(and(sql`${academicYears.startDate} <= ${t.date}`, sql`${academicYears.endDate} >= ${t.date}`))
      .limit(1);
    if (!year) throw new ImportError("Tanggal TO berada di luar tahun ajaran yang terdaftar. Tambahkan tahun ajarannya dulu di Master Data.");
    const [created] = await tx
      .insert(tryouts)
      .values({
        name: t.name,
        date: t.date,
        academicYearId: year.id,
        level: t.level,
        subjectId: t.subjectId,
        ownerSchoolId: t.ownerSchoolId,
        importBatchId: batch.id,
      })
      .returning({ id: tryouts.id });
    await tx.insert(tryoutSchools).values(t.schoolIds.map((schoolId) => ({ tryoutId: created!.id, schoolId })));
    await tx.insert(tryoutItems).values(items.map((it) => ({ tryoutId: created!.id, ...itemValues(it) })));
    await tx
      .update(importBatches)
      .set({ snapshotJson: { createdTryoutId: created!.id }, tryoutId: created!.id })
      .where(eq(importBatches.id, batch.id));
    return { saved: items.length, tryoutId: created!.id };
  }

  const tryoutId = opts.tryoutId;
  if (!tryoutId) throw new ImportError("Pilih try out terlebih dahulu.");
  // Snapshot the current blueprint before touching it.
  await tx.execute(sql`
    update public.import_batches
       set tryout_id = ${tryoutId},
           snapshot_json = jsonb_build_object('items',
             (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from public.tryout_items i where i.tryout_id = ${tryoutId}))
     where id = ${batch.id}`);
  const existing = await tx.select({ id: tryoutItems.id, number: tryoutItems.number }).from(tryoutItems).where(eq(tryoutItems.tryoutId, tryoutId));
  const byNumber = new Map(existing.map((e) => [e.number, e.id]));
  const inserted: string[] = [];
  for (const it of items) {
    const id = byNumber.get(it.number);
    if (id) {
      await tx.update(tryoutItems).set(itemValues(it)).where(eq(tryoutItems.id, id));
    } else {
      const [row] = await tx.insert(tryoutItems).values({ tryoutId, ...itemValues(it) }).returning({ id: tryoutItems.id });
      inserted.push(row!.id);
    }
  }
  await tx.execute(sql`
    update public.import_batches
       set snapshot_json = snapshot_json || jsonb_build_object('insertedItemIds', ${JSON.stringify(inserted)}::jsonb)
     where id = ${batch.id}`);
  await rescoreTryout(tx, tryoutId);
  return { saved: items.length, tryoutId };
}

function itemValues(it: BlueprintItem) {
  return {
    number: it.number,
    competencyId: it.competencyId,
    cognitiveLevel: it.cognitiveLevel,
    difficulty: it.difficulty,
    answerKey: it.answerKey,
    isVoided: it.isVoided,
  };
}

async function commitResults(tx: RlsTx, batch: ImportBatchRow, config: BatchConfig): Promise<{ saved: number; tryoutId: string }> {
  const tryoutId = config.options.tryoutId;
  const schoolId = batch.schoolId;
  if (!tryoutId || !schoolId) throw new ImportError("Pilih try out dan sekolah terlebih dahulu.");
  const rows = await savableRows<ResultRow>(tx, batch.id);

  // 1. Snapshot whatever is stored for this TO + school (from earlier uploads or seed).
  await tx.execute(sql`
    update public.import_batches
       set tryout_id = ${tryoutId},
           snapshot_json = jsonb_build_object(
             'scores', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.tryout_scores s
                         where s.tryout_id = ${tryoutId} and s.school_id = ${schoolId}),
             'responses', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.item_responses r
                         where r.tryout_id = ${tryoutId} and r.school_id = ${schoolId}))
     where id = ${batch.id}`);

  // 2. Replace.
  await tx.delete(itemResponses).where(and(eq(itemResponses.tryoutId, tryoutId), eq(itemResponses.schoolId, schoolId)));
  await tx.delete(tryoutScores).where(and(eq(tryoutScores.tryoutId, tryoutId), eq(tryoutScores.schoolId, schoolId)));
  await chunked(rows, 1000, (chunk) =>
    tx.insert(tryoutScores).values(
      chunk.map((r) => ({
        tryoutId,
        studentId: r.studentId,
        schoolId,
        rawScore: r.rawScore,
        scaledScore: r.scaledScore,
        status: r.status,
        hasItemDetail: r.hasItemDetail,
        importBatchId: batch.id,
      })),
    ),
  );
  const responses = rows.flatMap((r) =>
    r.hasItemDetail
      ? r.responses.map((x) => ({
          tryoutId,
          itemId: x.itemId,
          studentId: r.studentId,
          schoolId,
          answer: x.answer,
          isCorrect: x.isCorrect,
          importBatchId: batch.id,
        }))
      : [],
  );
  await chunked(responses, 2000, (chunk) => tx.insert(itemResponses).values(chunk));

  // 3. Earlier uploads for the same TO + school are now superseded.
  await tx
    .update(importBatches)
    .set({ status: "superseded", supersededBy: batch.id })
    .where(
      and(
        eq(importBatches.type, "tryout_results"),
        eq(importBatches.tryoutId, tryoutId),
        eq(importBatches.schoolId, schoolId),
        eq(importBatches.status, "committed"),
        ne(importBatches.id, batch.id),
      ),
    );
  return { saved: rows.length, tryoutId };
}

async function commitPractice(tx: RlsTx, batch: ImportBatchRow): Promise<{ saved: number }> {
  const schoolId = batch.schoolId;
  if (!schoolId) throw new ImportError("Pilih sekolah terlebih dahulu.");
  const rows = await savableRows<PracticeRow>(tx, batch.id);
  const keys = JSON.stringify(rows.map((r) => ({ s: r.studentId, w: r.weekStart, sub: r.subjectId, c: r.competencyId })));
  const match = sql`p.student_id = k.s and p.week_start = k.w and p.subject_id = k.sub and p.competency_id is not distinct from k.c`;

  await tx.execute(sql`
    update public.import_batches
       set snapshot_json = jsonb_build_object('practice',
             (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                from public.practice_logs p
                join jsonb_to_recordset(${keys}::jsonb) as k(s uuid, w date, sub uuid, c uuid) on ${match}
               where p.school_id = ${schoolId}))
     where id = ${batch.id}`);
  await tx.execute(sql`
    delete from public.practice_logs p
     using jsonb_to_recordset(${keys}::jsonb) as k(s uuid, w date, sub uuid, c uuid)
     where p.school_id = ${schoolId} and ${match}`);
  await chunked(rows, 2000, (chunk) =>
    tx.insert(practiceLogs).values(
      chunk.map((r) => ({
        studentId: r.studentId,
        schoolId,
        weekStart: r.weekStart,
        subjectId: r.subjectId,
        competencyId: r.competencyId,
        attempted: r.attempted,
        correct: r.correct,
        importBatchId: batch.id,
      })),
    ),
  );
  return { saved: rows.length };
}

/**
 * Validates once more against current master data, then writes the batch.
 * Runs entirely inside the caller's (RLS) transaction: all or nothing.
 */
export async function commitBatch(tx: RlsTx, batchId: string, userId: string): Promise<CommitResult> {
  const config = await stageBatch(tx, batchId);
  const batch = await loadBatch(tx, batchId);
  const blocking = config.fileIssues.find((i) => i.level === "error");
  if (blocking) throw new ImportError(blocking.message);
  if (config.summary.ok + config.summary.warning === 0) {
    throw new ImportError("Tidak ada baris yang bisa disimpan. Perbaiki baris yang bermasalah terlebih dahulu.");
  }

  let saved = 0;
  let tryoutId: string | null = null;
  switch (config.kind) {
    case "tryout_blueprint":
      ({ saved, tryoutId } = await commitBlueprint(tx, batch, config));
      break;
    case "tryout_results":
      ({ saved, tryoutId } = await commitResults(tx, batch, config));
      break;
    case "practice_logs":
      ({ saved } = await commitPractice(tx, batch));
      break;
  }

  await tx
    .update(importBatches)
    .set({ status: "committed", committedAt: new Date(), createdBy: batch.createdBy ?? userId })
    .where(eq(importBatches.id, batchId));

  // Remember the confirmed mapping for this school's next upload (§9.3 step 9).
  const mapping = { headers: config.headers, columns: config.columns };
  await tx
    .insert(mappingProfiles)
    .values({ schoolId: batch.schoolId, type: batch.type, headerSignature: headerSignature(config.headers), mappingJson: mapping })
    .onConflictDoUpdate({
      target: [mappingProfiles.schoolId, mappingProfiles.type, mappingProfiles.headerSignature],
      set: { mappingJson: mapping, updatedAt: new Date() },
    });

  return { batchId, saved, tryoutId };
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

export async function rollbackBatch(tx: RlsTx, batchId: string, userId: string): Promise<void> {
  const batch = await loadBatch(tx, batchId);
  if (batch.status === "superseded") {
    throw new ImportError("Batch ini sudah digantikan unggahan yang lebih baru. Batalkan unggahan terbaru terlebih dahulu.");
  }
  if (batch.status !== "committed") throw new ImportError("Hanya data yang sudah disimpan yang bisa dibatalkan.");
  const snapshot = (batch.snapshotJson ?? {}) as Record<string, unknown>;
  const snap = (key: string) => sql`(select snapshot_json -> ${key} from public.import_batches where id = ${batchId})`;

  switch (batch.type) {
    case "tryout_results": {
      await tx.delete(itemResponses).where(eq(itemResponses.importBatchId, batchId));
      await tx.delete(tryoutScores).where(eq(tryoutScores.importBatchId, batchId));
      await tx.execute(sql`insert into public.tryout_scores
        select * from jsonb_populate_recordset(null::public.tryout_scores, ${snap("scores")}) on conflict do nothing`);
      await tx.execute(sql`insert into public.item_responses
        select * from jsonb_populate_recordset(null::public.item_responses, ${snap("responses")}) on conflict do nothing`);
      await tx
        .update(importBatches)
        .set({ status: "committed", supersededBy: null })
        .where(and(eq(importBatches.supersededBy, batchId), eq(importBatches.status, "superseded")));
      break;
    }
    case "practice_logs": {
      await tx.delete(practiceLogs).where(eq(practiceLogs.importBatchId, batchId));
      await tx.execute(sql`insert into public.practice_logs
        select * from jsonb_populate_recordset(null::public.practice_logs, ${snap("practice")}) on conflict do nothing`);
      break;
    }
    case "tryout_blueprint": {
      const createdTryoutId = snapshot.createdTryoutId as string | undefined;
      if (createdTryoutId) {
        const [{ n }] = await tx.execute<{ n: number }>(
          sql`select count(*)::int as n from public.tryout_scores where tryout_id = ${createdTryoutId}`,
        );
        if (n > 0) {
          throw new ImportError("TO ini sudah punya hasil yang diunggah. Batalkan semua unggahan hasil TO-nya terlebih dahulu.");
        }
        await tx.delete(tryouts).where(eq(tryouts.id, createdTryoutId));
      } else if (batch.tryoutId) {
        const insertedIds = (snapshot.insertedItemIds as string[] | undefined) ?? [];
        if (insertedIds.length) await tx.delete(tryoutItems).where(inArray(tryoutItems.id, insertedIds));
        await tx.execute(sql`
          update public.tryout_items t
             set competency_id = s.competency_id, cognitive_level = s.cognitive_level, difficulty = s.difficulty,
                 answer_key = s.answer_key, is_voided = s.is_voided
            from jsonb_populate_recordset(null::public.tryout_items, ${snap("items")}) s
           where t.id = s.id`);
        await rescoreTryout(tx, batch.tryoutId);
      }
      break;
    }
    default:
      throw new ImportError("Jenis impor ini belum bisa dibatalkan.");
  }

  await tx
    .update(importBatches)
    .set({ status: "rolled_back", rolledBackAt: new Date(), rolledBackBy: userId })
    .where(eq(importBatches.id, batchId));
}

/** Deletes a draft that was never committed (its preview rows cascade). */
export async function discardDraft(tx: RlsTx, batchId: string): Promise<void> {
  const batch = await loadBatch(tx, batchId);
  if (batch.status !== "draft") throw new ImportError("Hanya draf yang belum disimpan yang bisa dihapus.");
  await tx.delete(importBatches).where(eq(importBatches.id, batchId));
}
