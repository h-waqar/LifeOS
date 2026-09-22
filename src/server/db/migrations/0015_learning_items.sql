-- 1. Create learning_items table
CREATE TABLE IF NOT EXISTS "learning_items" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "type" text DEFAULT 'book' NOT NULL,
  "status" text DEFAULT 'not_started' NOT NULL,
  "author" text,
  "url" text,
  "rating" integer,
  "progress" integer DEFAULT 0 NOT NULL,
  "current_units" integer DEFAULT 0,
  "total_units" integer,
  "unit_type" text,
  "summary" text,
  "key_takeaways" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "goal_id" text,
  "project_id" text,
  "is_archived" boolean DEFAULT false NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "learning_items_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "learning_items_title_non_empty" CHECK (length(trim("title")) > 0),
  CONSTRAINT "learning_items_title_max_length" CHECK (length("title") <= 255),
  CONSTRAINT "learning_items_type_check" CHECK ("type" IN ('book', 'course', 'article', 'podcast', 'skill', 'documentation', 'other')),
  CONSTRAINT "learning_items_status_check" CHECK ("status" IN ('not_started', 'in_progress', 'completed', 'archived')),
  CONSTRAINT "learning_items_rating_check" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5)),
  CONSTRAINT "learning_items_progress_check" CHECK ("progress" >= 0 AND "progress" <= 100),
  CONSTRAINT "learning_items_current_units_check" CHECK ("current_units" IS NULL OR "current_units" >= 0),
  CONSTRAINT "learning_items_total_units_check" CHECK ("total_units" IS NULL OR "total_units" >= 0)
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'learning_items_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'learning_items_user_goal_fk'
  ) THEN
    ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_user_goal_fk" FOREIGN KEY ("user_id", "goal_id") REFERENCES "public"."goals"("user_id", "id") ON DELETE set null ("goal_id") ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'learning_items_user_project_fk'
  ) THEN
    ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_user_project_fk" FOREIGN KEY ("user_id", "project_id") REFERENCES "public"."projects"("user_id", "id") ON DELETE set null ("project_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "learning_items_user_id_idx" ON "learning_items" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_items_user_status_idx" ON "learning_items" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_items_user_type_idx" ON "learning_items" USING btree ("user_id", "type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_items_user_is_archived_idx" ON "learning_items" USING btree ("user_id", "is_archived");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_items_user_goal_idx" ON "learning_items" USING btree ("user_id", "goal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_items_user_project_idx" ON "learning_items" USING btree ("user_id", "project_id");
--> statement-breakpoint

-- GIN Trigram Index on title
CREATE INDEX IF NOT EXISTS "learning_items_title_trgm_idx" ON "learning_items" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint

-- GIN Full-Text Search Functional Index
CREATE INDEX IF NOT EXISTS "learning_items_fts_idx" ON "learning_items" USING gin (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("author", '') || ' ' || coalesce("summary", '')));
--> statement-breakpoint

-- 2. Alter notes to add learning_id
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "learning_id" text;
--> statement-breakpoint

-- 3. Composite Foreign Key from notes to learning_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_user_learning_fk'
  ) THEN
    ALTER TABLE "notes" ADD CONSTRAINT "notes_user_learning_fk" FOREIGN KEY ("user_id", "learning_id") REFERENCES "public"."learning_items"("user_id", "id") ON DELETE set null ("learning_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notes_user_learning_idx" ON "notes" USING btree ("user_id", "learning_id");
--> statement-breakpoint

-- 4. Permissions Grant for lifeos_app Role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'lifeos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "learning_items" TO lifeos_app;
  END IF;
END $$;
