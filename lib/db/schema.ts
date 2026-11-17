/**
 * Database schema (Drizzle ORM).
 *
 * Row Level Security policies, helper functions and audit triggers live in
 * hand-written SQL migrations under `drizzle/` (see 0001_rls_audit.sql),
 * because they are easier to review as plain SQL.
 *
 * Convention: every table holding school-scoped data carries a `school_id`
 * column (denormalised where needed) so RLS policies stay simple and fast.
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const schoolLevel = pgEnum("school_level", ["sd", "smp"]);
export const userRole = pgEnum("user_role", ["super_admin", "viewer", "school_admin", "teacher"]);
export const gender = pgEnum("gender", ["L", "P"]);
export const tryoutScoreStatus = pgEnum("tryout_score_status", ["present", "absent"]);
export const interventionStatus = pgEnum("intervention_status", ["planned", "in_progress", "done"]);

/** Values copied verbatim from the foundation's standard achievement template (CLAUDE.md §8.1). */
export const achievementCategory = pgEnum("achievement_category", [
  "AKADEMIK",
  "NON_AKADEMIK",
  "OLAHRAGA",
  "SENI_BUDAYA",
  "TEKNOLOGI",
  "LAINNYA",
]);
export const achievementLevel = pgEnum("achievement_level", [
  "KOTA_KABUPATEN",
  "PROVINSI",
  "NASIONAL",
  "INTERNASIONAL",
]);
export const achievementRank = pgEnum("achievement_rank", [
  "JUARA_1",
  "JUARA_2",
  "JUARA_3",
  "MEDALI_EMAS",
  "MEDALI_PERAK",
  "MEDALI_PERUNGGU",
  "HARAPAN",
  "FINALIS",
]);

export const importType = pgEnum("import_type", [
  "tryout_blueprint",
  "tryout_results",
  "practice_logs",
  "achievements",
]);
/** superseded = replaced by a newer upload for the same scope (e.g. same TO + school). */
export const importStatus = pgEnum("import_status", ["draft", "committed", "rolled_back", "failed", "superseded"]);
export const importRowStatus = pgEnum("import_row_status", ["ok", "warning", "error", "skipped"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------

export const schools = pgTable("schools", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolCode: text("school_code").notNull().unique(),
  name: text("name").notNull(),
  level: schoolLevel("level").notNull(),
  city: text("city").notNull(),
  brandColor: text("brand_color").notNull(),
  logoPath: text("logo_path").notNull(),
  ...timestamps,
});

export const academicYears = pgTable(
  "academic_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull().unique(), // e.g. "2026/2027"
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("academic_years_single_active").on(t.isActive).where(sql`${t.isActive}`),
    check("academic_years_range", sql`${t.endDate} > ${t.startDate}`),
  ],
);

export const classes = pgTable(
  "classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id").notNull().references(() => schools.id),
    academicYearId: uuid("academic_year_id").notNull().references(() => academicYears.id),
    name: text("name").notNull(), // e.g. "6A"
    grade: smallint("grade").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("classes_school_year_name").on(t.schoolId, t.academicYearId, t.name),
    index("classes_school_idx").on(t.schoolId),
  ],
);

export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id").notNull().references(() => schools.id),
    nis: text("nis").notNull(),
    nisn: text("nisn"),
    fullName: text("full_name").notNull(),
    gender: gender("gender"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("students_school_nis").on(t.schoolId, t.nis),
    uniqueIndex("students_nisn_unique").on(t.nisn).where(sql`${t.nisn} is not null`),
    index("students_school_idx").on(t.schoolId),
  ],
);

/** Class membership per academic year (keeps history when students move up). */
export const classEnrollments = pgTable(
  "class_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    classId: uuid("class_id").notNull().references(() => classes.id),
    academicYearId: uuid("academic_year_id").notNull().references(() => academicYears.id),
    schoolId: uuid("school_id").notNull().references(() => schools.id),
    ...timestamps,
  },
  (t) => [
    unique("class_enrollments_student_year").on(t.studentId, t.academicYearId),
    index("class_enrollments_class_idx").on(t.classId),
    index("class_enrollments_school_idx").on(t.schoolId),
  ],
);

export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(), // e.g. "MAT", "BIN"
    name: text("name").notNull(),
    level: schoolLevel("level").notNull(),
    sortOrder: smallint("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [unique("subjects_code_level").on(t.code, t.level)],
);

/** Competency tree: subject -> element (depth 1) -> sub-element (depth 2). */
export const competencies = pgTable(
  "competencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id").notNull().references(() => subjects.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => competencies.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    depth: smallint("depth").notNull(),
    sortOrder: smallint("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique("competencies_subject_code").on(t.subjectId, t.code),
    index("competencies_parent_idx").on(t.parentId),
    check("competencies_depth", sql`${t.depth} between 1 and 3`),
  ],
);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    role: userRole("role").notNull(),
    schoolId: uuid("school_id").references(() => schools.id),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    check(
      "profiles_school_scope",
      sql`(${t.role} in ('school_admin', 'teacher')) = (${t.schoolId} is not null)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Imports (declared early because many tables reference batches)
// ---------------------------------------------------------------------------

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id").references(() => schools.id), // null = network-wide (yayasan)
    type: importType("type").notNull(),
    filePath: text("file_path"),
    originalFilename: text("original_filename"),
    /** Layout + column mapping + upload options (sheet, header row, TO, default week…). */
    mappingJson: jsonb("mapping_json"),
    /** Parsed cells of every sheet, so the mapping can be changed without re-uploading. */
    sourceJson: jsonb("source_json"),
    /** Data this batch replaced when committed; restored on rollback. */
    snapshotJson: jsonb("snapshot_json"),
    /** Try-out the batch belongs to (blueprint & results imports). */
    tryoutId: uuid("tryout_id").references((): AnyPgColumn => tryouts.id, { onDelete: "set null" }),
    /** Newer batch that replaced this one (status = superseded). */
    supersededBy: uuid("superseded_by").references((): AnyPgColumn => importBatches.id, { onDelete: "set null" }),
    status: importStatus("status").notNull().default("draft"),
    rowCount: integer("row_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => profiles.id),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
    rolledBackBy: uuid("rolled_back_by").references(() => profiles.id),
    ...timestamps,
  },
  (t) => [
    index("import_batches_school_idx").on(t.schoolId, t.createdAt),
    index("import_batches_tryout_idx").on(t.tryoutId, t.schoolId),
  ],
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id").references(() => schools.id),
    rowIndex: integer("row_index").notNull(),
    rawJson: jsonb("raw_json").notNull(),
    normalizedJson: jsonb("normalized_json"),
    issuesJson: jsonb("issues_json"),
    status: importRowStatus("status").notNull().default("ok"),
  },
  (t) => [unique("import_rows_batch_row").on(t.batchId, t.rowIndex)],
);

export const mappingProfiles = pgTable(
  "mapping_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id").references(() => schools.id),
    type: importType("type").notNull(),
    headerSignature: text("header_signature").notNull(),
    mappingJson: jsonb("mapping_json").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("mapping_profiles_key").on(t.schoolId, t.type, t.headerSignature).nullsNotDistinct(),
  ],
);

// ---------------------------------------------------------------------------
// TKA
// ---------------------------------------------------------------------------

export const tryouts = pgTable(
  "tryouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    date: date("date").notNull(),
    academicYearId: uuid("academic_year_id").notNull().references(() => academicYears.id),
    level: schoolLevel("level").notNull(),
    subjectId: uuid("subject_id").notNull().references(() => subjects.id),
    /** null = network-wide TO managed by the foundation; otherwise owned by one school. */
    ownerSchoolId: uuid("owner_school_id").references(() => schools.id),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id),
    ...timestamps,
  },
  (t) => [index("tryouts_year_date_idx").on(t.academicYearId, t.date)],
);

/** Which schools sit a given TO. */
export const tryoutSchools = pgTable(
  "tryout_schools",
  {
    tryoutId: uuid("tryout_id")
      .notNull()
      .references(() => tryouts.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id").notNull().references(() => schools.id),
  },
  (t) => [primaryKey({ columns: [t.tryoutId, t.schoolId] }), index("tryout_schools_school_idx").on(t.schoolId)],
);

export const tryoutItems = pgTable(
  "tryout_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tryoutId: uuid("tryout_id")
      .notNull()
      .references(() => tryouts.id, { onDelete: "cascade" }),
    number: smallint("number").notNull(),
    competencyId: uuid("competency_id").references(() => competencies.id),
    cognitiveLevel: text("cognitive_level"),
    difficulty: text("difficulty"),
    answerKey: text("answer_key"),
    isVoided: boolean("is_voided").notNull().default(false),
    ...timestamps,
  },
  (t) => [unique("tryout_items_number").on(t.tryoutId, t.number), index("tryout_items_competency_idx").on(t.competencyId)],
);

export const tryoutScores = pgTable(
  "tryout_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tryoutId: uuid("tryout_id")
      .notNull()
      .references(() => tryouts.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id").notNull().references(() => schools.id),
    /** Percentage of non-voided items answered correctly x 100 (0-100). */
    rawScore: numeric("raw_score", { precision: 5, scale: 2, mode: "number" }),
    /** Score supplied by the TO organiser, if any. Takes precedence over raw_score for targets. */
    scaledScore: numeric("scaled_score", { precision: 6, scale: 2, mode: "number" }),
    status: tryoutScoreStatus("status").notNull().default("present"),
    /** false = total score only (fallback), excluded from competency analysis. */
    hasItemDetail: boolean("has_item_detail").notNull().default(false),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id),
    ...timestamps,
  },
  (t) => [
    unique("tryout_scores_student").on(t.tryoutId, t.studentId),
    index("tryout_scores_school_idx").on(t.schoolId, t.tryoutId),
    index("tryout_scores_student_idx").on(t.studentId),
    index("tryout_scores_batch_idx").on(t.importBatchId),
  ],
);

export const itemResponses = pgTable(
  "item_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tryoutId: uuid("tryout_id")
      .notNull()
      .references(() => tryouts.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => tryoutItems.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id").notNull().references(() => schools.id),
    answer: text("answer"),
    /** null = unanswered. */
    isCorrect: boolean("is_correct"),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id),
  },
  (t) => [
    unique("item_responses_item_student").on(t.itemId, t.studentId),
    index("item_responses_tryout_school_idx").on(t.tryoutId, t.schoolId),
    index("item_responses_student_idx").on(t.studentId),
    index("item_responses_batch_idx").on(t.importBatchId),
  ],
);

export const practiceLogs = pgTable(
  "practice_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id").notNull().references(() => schools.id),
    /** Monday of the ISO week (Asia/Jakarta). */
    weekStart: date("week_start").notNull(),
    subjectId: uuid("subject_id").notNull().references(() => subjects.id),
    /** Optional: logs without a competency count for volume/accuracy only. */
    competencyId: uuid("competency_id").references(() => competencies.id),
    attempted: integer("attempted").notNull(),
    correct: integer("correct").notNull(),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id),
    ...timestamps,
  },
  (t) => [
    unique("practice_logs_key").on(t.studentId, t.weekStart, t.subjectId, t.competencyId).nullsNotDistinct(),
    index("practice_logs_school_week_idx").on(t.schoolId, t.weekStart),
    index("practice_logs_batch_idx").on(t.importBatchId),
    check("practice_logs_counts", sql`${t.attempted} >= 0 and ${t.correct} >= 0 and ${t.correct} <= ${t.attempted}`),
    check("practice_logs_monday", sql`extract(isodow from ${t.weekStart}) = 1`),
  ],
);

export const interventions = pgTable(
  "interventions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id").notNull().references(() => schools.id),
    competencyId: uuid("competency_id").references(() => competencies.id),
    ownerUserId: uuid("owner_user_id").references(() => profiles.id),
    action: text("action").notNull(),
    status: interventionStatus("status").notNull().default("planned"),
    notes: text("notes"),
    outcome: text("outcome"),
    startedAt: date("started_at"),
    endedAt: date("ended_at"),
    ...timestamps,
  },
  (t) => [index("interventions_student_idx").on(t.studentId), index("interventions_school_idx").on(t.schoolId)],
);

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export const achievements = pgTable(
  "achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id").notNull().references(() => schools.id),
    achievedOn: date("achieved_on").notNull(),
    competitionName: text("competition_name").notNull(),
    organizer: text("organizer"),
    /** Nullable: left empty when the source value has no exact match (see notes). */
    category: achievementCategory("category"),
    level: achievementLevel("level"),
    rank: achievementRank("rank"),
    evidenceUrl: text("evidence_url"),
    notes: text("notes"),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id),
    createdBy: uuid("created_by").references(() => profiles.id),
    ...timestamps,
  },
  (t) => [
    index("achievements_school_date_idx").on(t.schoolId, t.achievedOn),
    index("achievements_date_idx").on(t.achievedOn),
    index("achievements_batch_idx").on(t.importBatchId),
  ],
);

/** One row per participant. Individual vs team is derived from the row count. */
export const achievementParticipants = pgTable(
  "achievement_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    achievementId: uuid("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id").notNull().references(() => schools.id),
    /** null when the name could not be matched to the student master (e.g. alumni). */
    studentId: uuid("student_id").references(() => students.id, { onDelete: "set null" }),
    rawName: text("raw_name").notNull(),
  },
  (t) => [
    index("achievement_participants_achievement_idx").on(t.achievementId),
    index("achievement_participants_student_idx").on(t.studentId),
  ],
);

// ---------------------------------------------------------------------------
// Settings & audit
// ---------------------------------------------------------------------------

/**
 * Configurable thresholds, weights and targets.
 * Scope: global (school_id & subject_id null), per school, and/or per subject.
 */
export const settings = pgTable(
  "settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    schoolId: uuid("school_id").references(() => schools.id),
    subjectId: uuid("subject_id").references(() => subjects.id),
    valueJson: jsonb("value_json").notNull(),
    updatedBy: uuid("updated_by").references(() => profiles.id),
    ...timestamps,
  },
  (t) => [unique("settings_scope_key").on(t.key, t.schoolId, t.subjectId).nullsNotDistinct()],
);

/** Written only by database triggers (security definer). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    schoolId: uuid("school_id"),
    diffJson: jsonb("diff_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_entity_idx").on(t.entity, t.entityId)],
);
