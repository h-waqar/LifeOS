-- 1. Create Notes Table
CREATE TABLE IF NOT EXISTS "notes" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "note_type" text DEFAULT 'quick' NOT NULL,
  "area" text DEFAULT 'general' NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_pinned" boolean DEFAULT false NOT NULL,
  "is_archived" boolean DEFAULT false NOT NULL,
  "project_id" text,
  "goal_id" text,
  "task_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notes_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "notes_user_id_slug_unique" UNIQUE("user_id", "slug"),
  CONSTRAINT "notes_note_type_check" CHECK ("note_type" IN ('quick', 'meeting', 'research', 'idea', 'journal', 'documentation', 'reference', 'learning')),
  CONSTRAINT "notes_area_check" CHECK ("area" IN ('health', 'career', 'finance', 'personal_development', 'relationships', 'general'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_user_project_fk'
  ) THEN
    ALTER TABLE "notes" ADD CONSTRAINT "notes_user_project_fk" FOREIGN KEY ("user_id", "project_id") REFERENCES "public"."projects"("user_id", "id") ON DELETE set null ("project_id") ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_user_goal_fk'
  ) THEN
    ALTER TABLE "notes" ADD CONSTRAINT "notes_user_goal_fk" FOREIGN KEY ("user_id", "goal_id") REFERENCES "public"."goals"("user_id", "id") ON DELETE set null ("goal_id") ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_user_task_fk'
  ) THEN
    ALTER TABLE "notes" ADD CONSTRAINT "notes_user_task_fk" FOREIGN KEY ("user_id", "task_id") REFERENCES "public"."tasks"("user_id", "id") ON DELETE set null ("task_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notes_user_id_idx" ON "notes" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_user_area_idx" ON "notes" USING btree ("user_id", "area");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_user_note_type_idx" ON "notes" USING btree ("user_id", "note_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_user_updated_at_idx" ON "notes" USING btree ("user_id", "updated_at");
--> statement-breakpoint

-- 2. Create Note Links Table
CREATE TABLE IF NOT EXISTS "note_links" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "source_note_id" text NOT NULL,
  "target_note_id" text,
  "target_title" text NOT NULL,
  "display_text" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "note_links_unique" UNIQUE("user_id", "source_note_id", "target_title")
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'note_links_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "note_links" ADD CONSTRAINT "note_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'note_links_source_note_fk'
  ) THEN
    ALTER TABLE "note_links" ADD CONSTRAINT "note_links_source_note_fk" FOREIGN KEY ("user_id", "source_note_id") REFERENCES "public"."notes"("user_id", "id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'note_links_target_note_fk'
  ) THEN
    ALTER TABLE "note_links" ADD CONSTRAINT "note_links_target_note_fk" FOREIGN KEY ("user_id", "target_note_id") REFERENCES "public"."notes"("user_id", "id") ON DELETE set null ("target_note_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "note_links_source_idx" ON "note_links" USING btree ("user_id", "source_note_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_links_target_idx" ON "note_links" USING btree ("user_id", "target_note_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_links_target_title_idx" ON "note_links" USING btree ("user_id", "target_title");
