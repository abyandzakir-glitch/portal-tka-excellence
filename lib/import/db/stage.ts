/**
 * Staging (CLAUDE.md §9.3 step 7): validates a draft batch from its stored
 * file cells + mapping + manual edits and writes the preview rows to
 * `import_rows`. Re-run after every mapping change or edit, and once more
 * right before commit so the saved data reflects current master data.
 */
import { eq, sql } from "drizzle-orm";
import type { RlsTx } from "@/lib/db/rls";
import { academicYears, importBatches, importRows, schools, tryouts } from "@/lib/db/schema";
import { validateAchievements } from "../achievements/validate";
import { validateStudents, type ExistingStudent } from "../students/validate";
import { todayIso } from "@/lib/format/id";
import { buildRowInputs } from "../pipeline";
import { validateBlueprint } from "../tka/blueprint";
import { validatePractice } from "../tka/practice";
import { validateResults } from "../tka/results";
import { summarize, type RowInput, type ValidationResult } from "../types";
import { editsMap, ImportError, type BatchConfig, type BatchSource } from "./config";
import { cognitiveLevelsFor, loadAchievementKeys, loadCompetencies, loadPracticeKeys, loadRoster, loadSubjects, loadTryoutItems } from "./context";

export type ImportBatchRow = typeof importBatches.$inferSelect;

export async function loadBatch(tx: RlsTx, batchId: string): Promise<ImportBatchRow> {
  const [batch] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
  if (!batch) throw new ImportError("Data impor tidak ditemukan atau Anda tidak punya akses.");
  return batch;
}

async function schoolLevel(tx: RlsTx, schoolId: string): Promise<"sd" | "smp"> {
  const [s] = await tx.select({ level: schools.level }).from(schools).where(eq(schools.id, schoolId)).limit(1);
  if (!s) throw new ImportError("Sekolah tidak ditemukan.");
  return s.level;
}

async function loadTryout(tx: RlsTx, tryoutId: string) {
  const [t] = await tx.select().from(tryouts).where(eq(tryouts.id, tryoutId)).limit(1);
  if (!t) throw new ImportError("Try out tidak ditemukan atau Anda tidak punya akses.");
  return t;
}

type AnyResult = ValidationResult<unknown> & { mode?: "items" | "total"; answerMode?: "letter" | "binary" | null };

async function validate(tx: RlsTx, batch: ImportBatchRow, config: BatchConfig, inputs: RowInput[]): Promise<AnyResult> {
  switch (config.kind) {
    case "tryout_blueprint": {
      const opts = config.options;
      const subjectId = opts.newTryout?.subjectId ?? (opts.tryoutId ? (await loadTryout(tx, opts.tryoutId)).subjectId : null);
      const level = opts.newTryout?.level ?? (opts.tryoutId ? (await loadTryout(tx, opts.tryoutId)).level : null);
      if (!subjectId || !level) throw new ImportError("Pilih try out atau isi data TO baru terlebih dahulu.");
      const subjectList = await loadSubjects(tx, level);
      const subject = subjectList.find((s) => s.id === subjectId);
      if (!subject) throw new ImportError("Mapel TO tidak ditemukan.");
      const comps = await loadCompetencies(tx, [subject.id]);
      return validateBlueprint(inputs, {
        subject,
        subjects: subjectList,
        competencies: comps.get(subject.id) ?? [],
        cognitiveLevels: cognitiveLevelsFor(level, subject.code),
      });
    }
    case "tryout_results": {
      if (!batch.schoolId) throw new ImportError("Pilih sekolah untuk hasil TO ini.");
      if (!config.options.tryoutId) throw new ImportError("Pilih try out terlebih dahulu.");
      await loadTryout(tx, config.options.tryoutId);
      const [items, roster] = await Promise.all([loadTryoutItems(tx, config.options.tryoutId), loadRoster(tx, batch.schoolId)]);
      return validateResults(inputs, config.columns, { items, roster });
    }
    case "practice_logs": {
      if (!batch.schoolId) throw new ImportError("Pilih sekolah untuk log latihan ini.");
      const level = await schoolLevel(tx, batch.schoolId);
      const subjectList = await loadSubjects(tx, level);
      const [roster, comps, existingKeys] = await Promise.all([
        loadRoster(tx, batch.schoolId),
        loadCompetencies(tx, subjectList.map((s) => s.id)),
        loadPracticeKeys(tx, batch.schoolId),
      ]);
      return validatePractice(inputs, config.columns, {
        roster,
        subjects: subjectList,
        competenciesBySubject: comps,
        defaultWeek: config.options.defaultWeek ?? null,
        today: todayIso(),
        existingKeys,
      });
    }
    case "students": {
      const schoolRows = await tx.select({ id: schools.id, code: schools.schoolCode, name: schools.name }).from(schools);
      const scope = batch.schoolId ? [batch.schoolId] : schoolRows.map((s) => s.id);
      const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
      if (!year) throw new ImportError("Belum ada tahun ajaran aktif. Super Admin perlu menambahkannya di Master Data → Tahun Ajaran.");
      const existing = await tx.execute<ExistingStudent & Record<string, unknown>>(sql`
        select st.id, st.school_id as "schoolId", st.nis, st.nisn, st.full_name as "fullName", st.gender, st.is_active as "isActive", c.name as "className"
          from public.students st
          left join public.class_enrollments e on e.student_id = st.id and e.academic_year_id = ${year.id}
          left join public.classes c on c.id = e.class_id
         where st.school_id in (${sql.join(scope.map((id) => sql`${id}`), sql`, `)})`);
      const owners = await tx.execute<{ nisn: string; school_id: string; nis: string }>(sql`select nisn, school_id, nis from public.students where nisn is not null`);
      const classRows = await tx.execute<{ school_id: string; name: string; grade: number }>(sql`select school_id, name, grade from public.classes where academic_year_id = ${year.id}`);
      return validateStudents(inputs, {
        schools: schoolRows,
        batchSchoolId: batch.schoolId,
        existing: existing as unknown as ExistingStudent[],
        nisnOwners: new Map(owners.map((o) => [o.nisn, { schoolId: o.school_id, nis: o.nis }])),
        existingClasses: classRows.map((c) => ({ schoolId: c.school_id, name: c.name, grade: Number(c.grade) })),
      });
    }
    case "achievements": {
      const schoolRows = await tx.select({ id: schools.id, code: schools.schoolCode, name: schools.name }).from(schools);
      // Network-wide file (Super Admin, no school chosen): rows name their school.
      const scope = batch.schoolId ? [batch.schoolId] : schoolRows.map((s) => s.id);
      const [rosters, existingKeys, year] = await Promise.all([
        Promise.all(scope.map(async (id) => [id, await loadRoster(tx, id)] as const)).then((e) => new Map(e)),
        loadAchievementKeys(tx, scope),
        tx.select({ start: academicYears.startDate }).from(academicYears).where(eq(academicYears.isActive, true)).limit(1),
      ]);
      const today = todayIso();
      return validateAchievements(inputs, {
        schools: schoolRows,
        batchSchoolId: batch.schoolId,
        rosters,
        academicYear: { startYear: Number((year[0]?.start ?? today).slice(0, 4)) },
        today,
        existingKeys,
      });
    }
  }
}

/** Re-validates a draft batch and rewrites its preview rows. Returns the updated config. */
export async function stageBatch(tx: RlsTx, batchId: string, patch?: Partial<BatchConfig>): Promise<BatchConfig> {
  const batch = await loadBatch(tx, batchId);
  if (batch.status !== "draft") throw new ImportError("Data ini sudah disimpan sehingga tidak bisa diubah lagi.");
  const config = { ...(batch.mappingJson as BatchConfig), ...patch };
  const source = batch.sourceJson as BatchSource | null;
  const sheet = source?.sheets[config.sheetIndex];
  if (!sheet) throw new ImportError("Sheet yang dipilih tidak ada di file.");

  const inputs = buildRowInputs(sheet.rows, config.headerRowIndex, config.columns, editsMap(config));
  const result = await validate(tx, batch, config, inputs);
  const summary = summarize(result.rows);

  await tx.delete(importRows).where(eq(importRows.batchId, batchId));
  const inputByRow = new Map(inputs.map((i) => [i.rowNumber, i.values]));
  const values = result.rows.map((r) => ({
    batchId,
    schoolId: batch.schoolId,
    rowIndex: r.rowNumber,
    rawJson: inputByRow.get(r.rowNumber) ?? {},
    normalizedJson: r.data ?? null,
    issuesJson: r.issues,
    status: r.status,
  }));
  for (let i = 0; i < values.length; i += 500) await tx.insert(importRows).values(values.slice(i, i + 500));

  const next: BatchConfig = {
    ...config,
    fileIssues: result.fileIssues,
    summary,
    resultsMode: result.mode,
    answerMode: result.answerMode,
  };
  await tx
    .update(importBatches)
    .set({ mappingJson: next, rowCount: summary.total - summary.skipped, errorCount: summary.error, warningCount: summary.warning })
    .where(eq(importBatches.id, batchId));
  return next;
}
