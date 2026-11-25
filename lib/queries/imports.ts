import "server-only";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { RlsTx } from "@/lib/db/rls";
import {
  importBatches,
  importRows,
  profiles,
  schools,
  subjects,
  tryoutItems,
  tryouts,
  tryoutSchools,
  tryoutScores,
} from "@/lib/db/schema";

/** Read queries for the weekly input pages. Always called inside queryAsUser (RLS). */

export function listSchools(tx: RlsTx) {
  return tx
    .select({ id: schools.id, code: schools.schoolCode, name: schools.name, level: schools.level })
    .from(schools)
    .orderBy(asc(schools.level), asc(schools.schoolCode));
}

export function listSubjects(tx: RlsTx) {
  return tx
    .select({ id: subjects.id, code: subjects.code, name: subjects.name, level: subjects.level })
    .from(subjects)
    .orderBy(asc(subjects.level), asc(subjects.sortOrder));
}

export interface TryoutOption {
  id: string;
  name: string;
  date: string;
  level: "sd" | "smp";
  subjectName: string;
  ownerSchoolId: string | null;
  schoolIds: string[];
  /** school id -> the day that school sits the TO. */
  schoolDates: Record<string, string>;
  itemCount: number;
}

/** Try-outs visible to the user, with participating schools and item counts. */
export async function listTryouts(tx: RlsTx): Promise<TryoutOption[]> {
  const itemCounts = tx
    .select({ tryoutId: tryoutItems.tryoutId, n: count().as("n") })
    .from(tryoutItems)
    .groupBy(tryoutItems.tryoutId)
    .as("item_counts");
  const rows = await tx
    .select({
      id: tryouts.id,
      name: tryouts.name,
      date: tryouts.date,
      level: tryouts.level,
      subjectName: subjects.name,
      ownerSchoolId: tryouts.ownerSchoolId,
      itemCount: sql<number>`coalesce(${itemCounts.n}, 0)`.mapWith(Number),
    })
    .from(tryouts)
    .innerJoin(subjects, eq(subjects.id, tryouts.subjectId))
    .leftJoin(itemCounts, eq(itemCounts.tryoutId, tryouts.id))
    .orderBy(desc(tryouts.date), asc(tryouts.name));
  const ids = rows.map((r) => r.id);
  const links = ids.length
    ? await tx.select().from(tryoutSchools).where(inArray(tryoutSchools.tryoutId, ids))
    : [];
  return rows.map((r) => {
    const own = links.filter((l) => l.tryoutId === r.id);
    return { ...r, schoolIds: own.map((l) => l.schoolId), schoolDates: Object.fromEntries(own.map((l) => [l.schoolId, l.date])) };
  });
}

const uploader = alias(profiles, "uploader");

export type BatchKind = (typeof importBatches.type.enumValues)[number];
/** Weekly TKA uploads shown on Input Pekanan; achievements live under the Prestasi dashboard. */
export const TKA_BATCH_KINDS: BatchKind[] = ["tryout_blueprint", "tryout_results", "practice_logs"];
export const ALL_BATCH_KINDS: BatchKind[] = [...TKA_BATCH_KINDS, "achievements"];

export type RecentBatch = Awaited<ReturnType<typeof listRecentBatches>>[number];

export function listRecentBatches(tx: RlsTx, opts: { kinds?: BatchKind[]; limit?: number } = {}) {
  return tx
    .select({
      id: importBatches.id,
      type: importBatches.type,
      status: importBatches.status,
      filename: importBatches.originalFilename,
      rowCount: importBatches.rowCount,
      errorCount: importBatches.errorCount,
      createdAt: importBatches.createdAt,
      schoolCode: schools.schoolCode,
      schoolName: schools.name,
      tryoutName: tryouts.name,
      tryoutLevel: tryouts.level,
      subjectName: subjects.name,
      uploaderName: uploader.fullName,
    })
    .from(importBatches)
    .leftJoin(schools, eq(schools.id, importBatches.schoolId))
    .leftJoin(tryouts, eq(tryouts.id, importBatches.tryoutId))
    .leftJoin(subjects, eq(subjects.id, tryouts.subjectId))
    .leftJoin(uploader, eq(uploader.id, importBatches.createdBy))
    .where(inArray(importBatches.type, opts.kinds ?? ALL_BATCH_KINDS))
    .orderBy(desc(importBatches.createdAt))
    .limit(opts.limit ?? 30);
}

export async function getBatch(tx: RlsTx, id: string) {
  const [row] = await tx
    .select({
      batch: importBatches,
      schoolCode: schools.schoolCode,
      schoolName: schools.name,
      tryoutName: tryouts.name,
      uploaderName: uploader.fullName,
    })
    .from(importBatches)
    .leftJoin(schools, eq(schools.id, importBatches.schoolId))
    .leftJoin(tryouts, eq(tryouts.id, importBatches.tryoutId))
    .leftJoin(uploader, eq(uploader.id, importBatches.createdBy))
    .where(eq(importBatches.id, id))
    .limit(1);
  return row ?? null;
}

export function listBatchRows(tx: RlsTx, batchId: string) {
  return tx
    .select({
      rowIndex: importRows.rowIndex,
      status: importRows.status,
      rawJson: importRows.rawJson,
      normalizedJson: importRows.normalizedJson,
      issuesJson: importRows.issuesJson,
    })
    .from(importRows)
    .where(eq(importRows.batchId, batchId))
    .orderBy(asc(importRows.rowIndex));
}

/** Number of stored scores per school for a try-out (shown before an upload replaces them). */
export async function countTryoutScores(tx: RlsTx, tryoutId: string, schoolId: string) {
  const [r] = await tx
    .select({ n: count() })
    .from(tryoutScores)
    .where(and(eq(tryoutScores.tryoutId, tryoutId), eq(tryoutScores.schoolId, schoolId)));
  return r?.n ?? 0;
}
