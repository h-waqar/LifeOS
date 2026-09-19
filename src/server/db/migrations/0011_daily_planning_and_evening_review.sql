-- 1. Create Daily Plans Table
CREATE TABLE IF NOT EXISTS "daily_plans" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "date" text NOT NULL,
  "status" text DEFAULT 'in_progress' NOT NULL,
  "priority_task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "habit_intention_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "morning_notes" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "daily_plans_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "daily_plans_user_date_unique" UNIQUE("user_id", "date"),
  CONSTRAINT "daily_plans_date_format" CHECK ("date" ~ '^\d{4}-\d{2}-\d{2}$'),
  CONSTRAINT "daily_plans_status_check" CHECK ("status" IN ('in_progress', 'completed')),
  CONSTRAINT "daily_plans_completed_at_invariant" CHECK ("status" != 'completed' OR "completed_at" IS NOT NULL),
  CONSTRAINT "daily_plans_notes_length" CHECK ("morning_notes" IS NULL OR length("morning_notes") <= 4000)
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_plans_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "daily_plans_user_id_idx" ON "daily_plans" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_plans_user_date_idx" ON "daily_plans" USING btree ("user_id", "date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_plans_user_status_idx" ON "daily_plans" USING btree ("user_id", "status");
--> statement-breakpoint

-- 2. Create Evening Reviews Table
CREATE TABLE IF NOT EXISTS "evening_reviews" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "daily_plan_id" text,
  "date" text NOT NULL,
  "productivity_score" integer DEFAULT 0 NOT NULL,
  "positive_reflections" text,
  "challenges_reflections" text,
  "notes" text,
  "completed_task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "incomplete_task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rolled_over_task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "completed_habit_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "evening_reviews_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "evening_reviews_user_date_unique" UNIQUE("user_id", "date"),
  CONSTRAINT "evening_reviews_date_format" CHECK ("date" ~ '^\d{4}-\d{2}-\d{2}$'),
  CONSTRAINT "evening_reviews_score_bounds" CHECK ("productivity_score" >= 0 AND "productivity_score" <= 100),
  CONSTRAINT "evening_reviews_pos_length" CHECK ("positive_reflections" IS NULL OR length("positive_reflections") <= 4000),
  CONSTRAINT "evening_reviews_chal_length" CHECK ("challenges_reflections" IS NULL OR length("challenges_reflections") <= 4000),
  CONSTRAINT "evening_reviews_notes_length" CHECK ("notes" IS NULL OR length("notes") <= 4000)
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'evening_reviews_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "evening_reviews" ADD CONSTRAINT "evening_reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'evening_reviews_user_daily_plan_fk'
  ) THEN
    ALTER TABLE "evening_reviews" ADD CONSTRAINT "evening_reviews_user_daily_plan_fk" FOREIGN KEY ("user_id", "daily_plan_id") REFERENCES "public"."daily_plans"("user_id", "id") ON DELETE set null ("daily_plan_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "evening_reviews_user_id_idx" ON "evening_reviews" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evening_reviews_user_date_idx" ON "evening_reviews" USING btree ("user_id", "date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evening_reviews_user_daily_plan_idx" ON "evening_reviews" USING btree ("user_id", "daily_plan_id");
--> statement-breakpoint

-- 3. Permissions Grant for lifeos_app Role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'lifeos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "daily_plans" TO lifeos_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "evening_reviews" TO lifeos_app;
  END IF;
END $$;
