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
 *   - TO results replace stored results only for the students in the file
 *     (a second class's file adds to the first), after explicit confirmation.
 *     An older batch whose rows are all replaced becomes "superseded" and is
 *     reinstated on rollback.
 *   - Practice logs replace stored logs with the same student/week/subject/competency.
 *   - Only Super Admin may roll back (also enforced by a database trigger).
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { RlsTx } from "@/lib/db/rls";
import {
  academicYears,
  achievementParticipants,
  achievements,
  classEnrollments,
  classes,
  students,
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
import type { AchievementRow } from "../achievements/validate";
import { classKey, type StudentRow } from "../students/validate";
import { headerSignature } from "../mapping";
import type { BlueprintItem } from "../tka/blueprint";
import type { PracticeRow } from "../tka/practice";
import type { ResultRow } from "../tka/results";
import { academicYearFor, assertTryoutNameFree } from "@/lib/tka/tryouts";
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
    // Checked again here: another school may have created the same TO since this draft was made.
    await assertTryoutNameFree(tx, t);
    const yearId = await academicYearFor(tx, t.date);
    const [created] = await tx
      .insert(tryouts)
      .values({
        name: t.name,
        date: t.date,
        academicYearId: yearId,
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

async function commitResults(
  tx: RlsTx,
  batch: ImportBatchRow,
  config: BatchConfig,
  confirmReplace: boolean,
): Promise<{ saved: number; tryoutId: string }> {
  const tryoutId = config.options.tryoutId;
  const schoolId = batch.schoolId;
  if (!tryoutId || !schoolId) throw new ImportError("Pilih try out dan sekolah terlebih dahulu.");
  if ((config.replaceCount ?? 0) > 0 && !confirmReplace) {
    throw new ImportError(
      `${config.replaceCount} siswa di file ini sudah punya hasil untuk TO ini. Centang konfirmasi penggantian sebelum menyimpan.`,
    );
  }
  const rows = await savableRows<ResultRow>(tx, batch.id);
  // Only the students in this file are replaced: a second class's file adds to the first.
  const studentIds = sql`${`{${rows.map((r) => r.studentId).join(",")}}`}::uuid[]`;

  // 1. Snapshot what is stored for these students (from earlier uploads or seed).
  await tx.execute(sql`
    update public.import_batches
       set tryout_id = ${tryoutId},
           snapshot_json = jsonb_build_object(
             'scores', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.tryout_scores s
                         where s.tryout_id = ${tryoutId} and s.school_id = ${schoolId} and s.student_id = any(${studentIds})),
             'responses', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.item_responses r
                         where r.tryout_id = ${tryoutId} and r.school_id = ${schoolId} and r.student_id = any(${studentIds})))
     where id = ${batch.id}`);

  // 2. Replace those students only.
  await tx.execute(sql`delete from public.item_responses
    where tryout_id = ${tryoutId} and school_id = ${schoolId} and student_id = any(${studentIds})`);
  await tx.execute(sql`delete from public.tryout_scores
    where tryout_id = ${tryoutId} and school_id = ${schoolId} and student_id = any(${studentIds})`);
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

  // 3. Earlier uploads for the same TO + school whose rows are now all replaced are superseded.
  //    Uploads that still hold other students (e.g. another class) stay "committed".
  await tx.execute(sql`
    update public.import_batches b
       set status = 'superseded', superseded_by = ${batch.id}
     where b.type = 'tryout_results' and b.tryout_id = ${tryoutId} and b.school_id = ${schoolId}
       and b.status = 'committed' and b.id <> ${batch.id}
       and not exists (select 1 from public.tryout_scores s where s.import_batch_id = b.id)`);
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
 * Achievements never replace stored rows (already-stored ones are skipped at
 * staging), so nothing needs a snapshot: rollback simply deletes the batch's
 * achievements (participants cascade).
 */
async function commitAchievements(tx: RlsTx, batch: ImportBatchRow, userId: string): Promise<{ saved: number }> {
  const rows = await savableRows<AchievementRow>(tx, batch.id);
  for (const chunk of Array.from({ length: Math.ceil(rows.length / 500) }, (_, i) => rows.slice(i * 500, i * 500 + 500))) {
    const inserted = await tx
      .insert(achievements)
      .values(
        chunk.map((r) => ({
          schoolId: r.schoolId,
          achievedOn: r.achievedOn,
          competitionName: r.competitionName,
          organizer: r.organizer,
          category: r.category,
          level: r.level,
          rank: r.rank,
          evidenceUrl: r.evidenceUrl,
          notes: r.notes,
          importBatchId: batch.id,
          createdBy: userId,
        })),
      )
      .returning({ id: achievements.id });
    const participants = chunk.flatMap((r, i) =>
      r.participants.map((p) => ({ achievementId: inserted[i]!.id, schoolId: r.schoolId, studentId: p.studentId, rawName: p.rawName })),
    );
    if (participants.length) await tx.insert(achievementParticipants).values(participants);
  }
  return { saved: rows.length };
}

/**
 * Student master import: creates missing classes in the active year, inserts
 * new students, updates existing ones (by NIS) and sets their class. The
 * snapshot keeps the previous student rows and enrolments for rollback.
 */
async function commitStudents(tx: RlsTx, batch: ImportBatchRow): Promise<{ saved: number }> {
  const rows = await savableRows<StudentRow>(tx, batch.id);
  const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
  if (!year) throw new ImportError("Belum ada tahun ajaran aktif.");
  const existingIds = rows.filter((r) => r.existingId).map((r) => r.existingId!);

  // Snapshot before touching anything.
  await tx.execute(sql`
    update public.import_batches set snapshot_json = jsonb_build_object(
      'yearId', ${year.id}::text,
      'students', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.students s where s.id = any(${`{${existingIds.join(",")}}`}::uuid[])),
      'enrollments', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from public.class_enrollments e
                       where e.student_id = any(${`{${existingIds.join(",")}}`}::uuid[]) and e.academic_year_id = ${year.id}))
     where id = ${batch.id}`);

  // Classes that do not exist yet in the active year.
  const classIds = new Map<string, string>();
  const existingClasses = await tx.select({ id: classes.id, schoolId: classes.schoolId, name: classes.name }).from(classes).where(eq(classes.academicYearId, year.id));
  for (const c of existingClasses) classIds.set(classKey(c.schoolId, c.name), c.id);
  const createdClassIds: string[] = [];
  for (const r of rows) {
    if (!r.className) continue;
    const key = classKey(r.schoolId, r.className);
    if (classIds.has(key)) continue;
    const [c] = await tx.insert(classes).values({ schoolId: r.schoolId, academicYearId: year.id, name: r.className, grade: r.grade ?? 1 }).returning({ id: classes.id });
    classIds.set(key, c!.id);
    createdClassIds.push(c!.id);
  }

  const insertedIds: string[] = [];
  const studentIdByRow = new Map<StudentRow, string>();
  for (const r of rows) {
    if (r.existingId) {
      await tx
        .update(students)
        .set({ fullName: r.fullName, nisn: r.nisn, gender: r.gender, isActive: true })
        .where(eq(students.id, r.existingId));
      studentIdByRow.set(r, r.existingId);
    } else {
      const [s] = await tx.insert(students).values({ schoolId: r.schoolId, nis: r.nis, nisn: r.nisn, fullName: r.fullName, gender: r.gender }).returning({ id: students.id });
      insertedIds.push(s!.id);
      studentIdByRow.set(r, s!.id);
    }
  }

  const withClass = rows.filter((r) => r.className);
  if (withClass.length) {
    const ids = withClass.map((r) => studentIdByRow.get(r)!);
    await tx.delete(classEnrollments).where(and(inArray(classEnrollments.studentId, ids), eq(classEnrollments.academicYearId, year.id)));
    await tx.insert(classEnrollments).values(
      withClass.map((r) => ({
        studentId: studentIdByRow.get(r)!,
        classId: classIds.get(classKey(r.schoolId, r.className!))!,
        academicYearId: year.id,
        schoolId: r.schoolId,
      })),
    );
  }

  await tx.execute(sql`
    update public.import_batches
       set snapshot_json = snapshot_json || jsonb_build_object('insertedStudentIds', ${JSON.stringify(insertedIds)}::jsonb,
                                                               'createdClassIds', ${JSON.stringify(createdClassIds)}::jsonb)
     where id = ${batch.id}`);
  return { saved: rows.length };
}

/**
 * Validates once more against current master data, then writes the batch.
 * Runs entirely inside the caller's (RLS) transaction: all or nothing.
 */
export async function commitBatch(
  tx: RlsTx,
  batchId: string,
  userId: string,
  opts: { confirmReplace?: boolean } = {},
): Promise<CommitResult> {
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
      ({ saved, tryoutId } = await commitResults(tx, batch, config, opts.confirmReplace === true));
      break;
    case "practice_logs":
      ({ saved } = await commitPractice(tx, batch));
      break;
    case "achievements":
      ({ saved } = await commitAchievements(tx, batch, userId));
      break;
    case "students":
      ({ saved } = await commitStudents(tx, batch));
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
      // Rows of this upload that a later upload replaced live in that upload's snapshot:
      // undo the later one first, so data is restored in order.
      const [{ n: replacedLater }] = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n
          from public.import_batches b, jsonb_array_elements(coalesce(b.snapshot_json -> 'scores', '[]'::jsonb)) e
         where b.type = 'tryout_results' and b.tryout_id = ${batch.tryoutId} and b.status = 'committed'
           and b.id <> ${batchId} and e ->> 'import_batch_id' = ${batchId}`);
      if (Number(replacedLater) > 0) {
        throw new ImportError(
          "Sebagian siswa di unggahan ini sudah diganti oleh unggahan yang lebih baru. Batalkan unggahan terbaru terlebih dahulu.",
        );
      }
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
      if (snapshot.mergedInto) {
        throw new ImportError("TO dari kisi-kisi ini sudah digabung ke TO jaringan, jadi unggahan ini tidak bisa dibatalkan sendiri. Ubah kisi-kisinya lewat \"Perbarui kisi-kisi TO yang ada\".");
      }
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
    case "achievements": {
      await tx.delete(achievements).where(eq(achievements.importBatchId, batchId));
      break;
    }
    case "students": {
      const inserted = (snapshot.insertedStudentIds as string[] | undefined) ?? [];
      const yearId = snapshot.yearId as string;
      if (inserted.length) {
        // Deleting a student cascades to scores, logs, achievements and notes: refuse when any exist.
        const [{ n }] = await tx.execute<{ n: number }>(sql`
          select (select count(*) from public.tryout_scores where student_id = any(${`{${inserted.join(",")}}`}::uuid[]))
               + (select count(*) from public.practice_logs where student_id = any(${`{${inserted.join(",")}}`}::uuid[]))
               + (select count(*) from public.achievement_participants where student_id = any(${`{${inserted.join(",")}}`}::uuid[]))
               + (select count(*) from public.interventions where student_id = any(${`{${inserted.join(",")}}`}::uuid[])) as n`);
        if (Number(n) > 0) {
          throw new ImportError("Sebagian siswa dari impor ini sudah punya nilai, latihan, prestasi, atau catatan intervensi, sehingga impor tidak bisa dibatalkan. Koreksi datanya satu per satu di Master Data → Siswa.");
        }
        await tx.delete(students).where(inArray(students.id, inserted));
      }
      await tx.execute(sql`
        update public.students t
           set full_name = s.full_name, nisn = s.nisn, gender = s.gender, is_active = s.is_active
          from jsonb_populate_recordset(null::public.students, ${snap("students")}) s
         where t.id = s.id`);
      await tx.execute(sql`
        delete from public.class_enrollments e
         using jsonb_populate_recordset(null::public.students, ${snap("students")}) s
         where e.student_id = s.id and e.academic_year_id = ${yearId}`);
      await tx.execute(sql`insert into public.class_enrollments
        select * from jsonb_populate_recordset(null::public.class_enrollments, ${snap("enrollments")}) on conflict do nothing`);
      const createdClasses = (snapshot.createdClassIds as string[] | undefined) ?? [];
      if (createdClasses.length) {
        await tx.execute(sql`
          delete from public.classes c where c.id = any(${`{${createdClasses.join(",")}}`}::uuid[])
             and not exists (select 1 from public.class_enrollments e where e.class_id = c.id)`);
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
