ALTER TYPE "public"."import_status" ADD VALUE 'superseded';--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "source_json" jsonb;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "snapshot_json" jsonb;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "tryout_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "superseded_by" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "warning_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_tryout_id_tryouts_id_fk" FOREIGN KEY ("tryout_id") REFERENCES "public"."tryouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_superseded_by_import_batches_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_tryout_idx" ON "import_batches" USING btree ("tryout_id","school_id");