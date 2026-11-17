CREATE TYPE "public"."achievement_category" AS ENUM('AKADEMIK', 'NON_AKADEMIK', 'OLAHRAGA', 'SENI_BUDAYA', 'TEKNOLOGI', 'LAINNYA');--> statement-breakpoint
CREATE TYPE "public"."achievement_level" AS ENUM('KOTA_KABUPATEN', 'PROVINSI', 'NASIONAL', 'INTERNASIONAL');--> statement-breakpoint
CREATE TYPE "public"."achievement_rank" AS ENUM('JUARA_1', 'JUARA_2', 'JUARA_3', 'MEDALI_EMAS', 'MEDALI_PERAK', 'MEDALI_PERUNGGU', 'HARAPAN', 'FINALIS');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('L', 'P');--> statement-breakpoint
CREATE TYPE "public"."import_row_status" AS ENUM('ok', 'warning', 'error', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('draft', 'committed', 'rolled_back', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_type" AS ENUM('tryout_blueprint', 'tryout_results', 'practice_logs', 'achievements');--> statement-breakpoint
CREATE TYPE "public"."intervention_status" AS ENUM('planned', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."school_level" AS ENUM('sd', 'smp');--> statement-breakpoint
CREATE TYPE "public"."tryout_score_status" AS ENUM('present', 'absent');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'viewer', 'school_admin', 'teacher');--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_years_label_unique" UNIQUE("label"),
	CONSTRAINT "academic_years_range" CHECK ("academic_years"."end_date" > "academic_years"."start_date")
);
--> statement-breakpoint
CREATE TABLE "achievement_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"achievement_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid,
	"raw_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"achieved_on" date NOT NULL,
	"competition_name" text NOT NULL,
	"organizer" text,
	"category" "achievement_category",
	"level" "achievement_level",
	"rank" "achievement_rank",
	"evidence_url" text,
	"notes" text,
	"import_batch_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"school_id" uuid,
	"diff_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_enrollments_student_year" UNIQUE("student_id","academic_year_id")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"grade" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_school_year_name" UNIQUE("school_id","academic_year_id","name")
);
--> statement-breakpoint
CREATE TABLE "competencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"parent_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"depth" smallint NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competencies_subject_code" UNIQUE("subject_id","code"),
	CONSTRAINT "competencies_depth" CHECK ("competencies"."depth" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid,
	"type" "import_type" NOT NULL,
	"file_path" text,
	"original_filename" text,
	"mapping_json" jsonb,
	"status" "import_status" DEFAULT 'draft' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"committed_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone,
	"rolled_back_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"school_id" uuid,
	"row_index" integer NOT NULL,
	"raw_json" jsonb NOT NULL,
	"normalized_json" jsonb,
	"issues_json" jsonb,
	"status" "import_row_status" DEFAULT 'ok' NOT NULL,
	CONSTRAINT "import_rows_batch_row" UNIQUE("batch_id","row_index")
);
--> statement-breakpoint
CREATE TABLE "interventions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"competency_id" uuid,
	"owner_user_id" uuid,
	"action" text NOT NULL,
	"status" "intervention_status" DEFAULT 'planned' NOT NULL,
	"notes" text,
	"outcome" text,
	"started_at" date,
	"ended_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tryout_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"answer" text,
	"is_correct" boolean,
	"import_batch_id" uuid,
	CONSTRAINT "item_responses_item_student" UNIQUE("item_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "mapping_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid,
	"type" "import_type" NOT NULL,
	"header_signature" text NOT NULL,
	"mapping_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mapping_profiles_key" UNIQUE NULLS NOT DISTINCT("school_id","type","header_signature")
);
--> statement-breakpoint
CREATE TABLE "practice_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"subject_id" uuid NOT NULL,
	"competency_id" uuid,
	"attempted" integer NOT NULL,
	"correct" integer NOT NULL,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_logs_key" UNIQUE NULLS NOT DISTINCT("student_id","week_start","subject_id","competency_id"),
	CONSTRAINT "practice_logs_counts" CHECK ("practice_logs"."attempted" >= 0 and "practice_logs"."correct" >= 0 and "practice_logs"."correct" <= "practice_logs"."attempted"),
	CONSTRAINT "practice_logs_monday" CHECK (extract(isodow from "practice_logs"."week_start") = 1)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"school_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_school_scope" CHECK (("profiles"."role" in ('school_admin', 'teacher')) = ("profiles"."school_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_code" text NOT NULL,
	"name" text NOT NULL,
	"level" "school_level" NOT NULL,
	"city" text NOT NULL,
	"brand_color" text NOT NULL,
	"logo_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schools_school_code_unique" UNIQUE("school_code")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"school_id" uuid,
	"subject_id" uuid,
	"value_json" jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_scope_key" UNIQUE NULLS NOT DISTINCT("key","school_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"nis" text NOT NULL,
	"nisn" text,
	"full_name" text NOT NULL,
	"gender" "gender",
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_school_nis" UNIQUE("school_id","nis")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"level" "school_level" NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_code_level" UNIQUE("code","level")
);
--> statement-breakpoint
CREATE TABLE "tryout_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tryout_id" uuid NOT NULL,
	"number" smallint NOT NULL,
	"competency_id" uuid,
	"cognitive_level" text,
	"difficulty" text,
	"answer_key" text,
	"is_voided" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tryout_items_number" UNIQUE("tryout_id","number")
);
--> statement-breakpoint
CREATE TABLE "tryout_schools" (
	"tryout_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	CONSTRAINT "tryout_schools_tryout_id_school_id_pk" PRIMARY KEY("tryout_id","school_id")
);
--> statement-breakpoint
CREATE TABLE "tryout_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tryout_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"raw_score" numeric(5, 2),
	"scaled_score" numeric(6, 2),
	"status" "tryout_score_status" DEFAULT 'present' NOT NULL,
	"has_item_detail" boolean DEFAULT false NOT NULL,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tryout_scores_student" UNIQUE("tryout_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "tryouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"date" date NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"level" "school_level" NOT NULL,
	"subject_id" uuid NOT NULL,
	"owner_school_id" uuid,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "achievement_participants" ADD CONSTRAINT "achievement_participants_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_participants" ADD CONSTRAINT "achievement_participants_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_participants" ADD CONSTRAINT "achievement_participants_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_parent_id_competencies_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_rolled_back_by_profiles_id_fk" FOREIGN KEY ("rolled_back_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_owner_user_id_profiles_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_responses" ADD CONSTRAINT "item_responses_tryout_id_tryouts_id_fk" FOREIGN KEY ("tryout_id") REFERENCES "public"."tryouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_responses" ADD CONSTRAINT "item_responses_item_id_tryout_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."tryout_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_responses" ADD CONSTRAINT "item_responses_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_responses" ADD CONSTRAINT "item_responses_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_responses" ADD CONSTRAINT "item_responses_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_profiles" ADD CONSTRAINT "mapping_profiles_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_logs" ADD CONSTRAINT "practice_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_logs" ADD CONSTRAINT "practice_logs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_logs" ADD CONSTRAINT "practice_logs_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_logs" ADD CONSTRAINT "practice_logs_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_logs" ADD CONSTRAINT "practice_logs_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_items" ADD CONSTRAINT "tryout_items_tryout_id_tryouts_id_fk" FOREIGN KEY ("tryout_id") REFERENCES "public"."tryouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_items" ADD CONSTRAINT "tryout_items_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_schools" ADD CONSTRAINT "tryout_schools_tryout_id_tryouts_id_fk" FOREIGN KEY ("tryout_id") REFERENCES "public"."tryouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_schools" ADD CONSTRAINT "tryout_schools_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_scores" ADD CONSTRAINT "tryout_scores_tryout_id_tryouts_id_fk" FOREIGN KEY ("tryout_id") REFERENCES "public"."tryouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_scores" ADD CONSTRAINT "tryout_scores_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_scores" ADD CONSTRAINT "tryout_scores_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryout_scores" ADD CONSTRAINT "tryout_scores_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryouts" ADD CONSTRAINT "tryouts_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryouts" ADD CONSTRAINT "tryouts_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryouts" ADD CONSTRAINT "tryouts_owner_school_id_schools_id_fk" FOREIGN KEY ("owner_school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryouts" ADD CONSTRAINT "tryouts_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_years_single_active" ON "academic_years" USING btree ("is_active") WHERE "academic_years"."is_active";--> statement-breakpoint
CREATE INDEX "achievement_participants_achievement_idx" ON "achievement_participants" USING btree ("achievement_id");--> statement-breakpoint
CREATE INDEX "achievement_participants_student_idx" ON "achievement_participants" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "achievements_school_date_idx" ON "achievements" USING btree ("school_id","achieved_on");--> statement-breakpoint
CREATE INDEX "achievements_date_idx" ON "achievements" USING btree ("achieved_on");--> statement-breakpoint
CREATE INDEX "achievements_batch_idx" ON "achievements" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "class_enrollments_class_idx" ON "class_enrollments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "class_enrollments_school_idx" ON "class_enrollments" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "classes_school_idx" ON "classes" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "competencies_parent_idx" ON "competencies" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "import_batches_school_idx" ON "import_batches" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE INDEX "interventions_student_idx" ON "interventions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "interventions_school_idx" ON "interventions" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "item_responses_tryout_school_idx" ON "item_responses" USING btree ("tryout_id","school_id");--> statement-breakpoint
CREATE INDEX "item_responses_student_idx" ON "item_responses" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "item_responses_batch_idx" ON "item_responses" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "practice_logs_school_week_idx" ON "practice_logs" USING btree ("school_id","week_start");--> statement-breakpoint
CREATE INDEX "practice_logs_batch_idx" ON "practice_logs" USING btree ("import_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_nisn_unique" ON "students" USING btree ("nisn") WHERE "students"."nisn" is not null;--> statement-breakpoint
CREATE INDEX "students_school_idx" ON "students" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "tryout_items_competency_idx" ON "tryout_items" USING btree ("competency_id");--> statement-breakpoint
CREATE INDEX "tryout_schools_school_idx" ON "tryout_schools" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "tryout_scores_school_idx" ON "tryout_scores" USING btree ("school_id","tryout_id");--> statement-breakpoint
CREATE INDEX "tryout_scores_student_idx" ON "tryout_scores" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "tryout_scores_batch_idx" ON "tryout_scores" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "tryouts_year_date_idx" ON "tryouts" USING btree ("academic_year_id","date");