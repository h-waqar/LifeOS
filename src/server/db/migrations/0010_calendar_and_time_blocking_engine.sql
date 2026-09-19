-- 1. Create Time Blocks Table
CREATE TABLE IF NOT EXISTS "time_blocks" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "start_time" timestamp with time zone NOT NULL,
  "end_time" timestamp with time zone NOT NULL,
  "duration_minutes" integer NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "commitment_level" text DEFAULT 'soft' NOT NULL,
  "actual_minutes" integer,
  "completed_at" timestamp with time zone,
  "color" text,
  "task_id" text,
  "project_id" text,
  "goal_id" text,
  "habit_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "time_blocks_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "time_blocks_title_non_empty" CHECK (length(trim("title")) > 0),
  CONSTRAINT "time_blocks_title_max_length" CHECK (length("title") <= 255),
  CONSTRAINT "time_blocks_description_max_length" CHECK ("description" IS NULL OR length("description") <= 4000),
  CONSTRAINT "time_blocks_time_order" CHECK ("end_time" > "start_time"),
  CONSTRAINT "time_blocks_duration_bounds" CHECK ("duration_minutes" > 0 AND "duration_minutes" <= 1440),
  CONSTRAINT "time_blocks_actual_minutes_bounds" CHECK ("actual_minutes" IS NULL OR ("actual_minutes" >= 0 AND "actual_minutes" <= 1440)),
  CONSTRAINT "time_blocks_status_check" CHECK ("status" IN ('scheduled', 'completed', 'cancelled')),
  CONSTRAINT "time_blocks_commitment_check" CHECK ("commitment_level" IN ('soft', 'hard')),
  CONSTRAINT "time_blocks_completed_at_invariant" CHECK ("status" != 'completed' OR "completed_at" IS NOT NULL)
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'time_blocks_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'time_blocks_user_task_fk'
  ) THEN
    ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_user_task_fk" FOREIGN KEY ("user_id", "task_id") REFERENCES "public"."tasks"("user_id", "id") ON DELETE set null ("task_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'time_blocks_user_project_fk'
  ) THEN
    ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_user_project_fk" FOREIGN KEY ("user_id", "project_id") REFERENCES "public"."projects"("user_id", "id") ON DELETE set null ("project_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'time_blocks_user_goal_fk'
  ) THEN
    ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_user_goal_fk" FOREIGN KEY ("user_id", "goal_id") REFERENCES "public"."goals"("user_id", "id") ON DELETE set null ("goal_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'time_blocks_user_habit_fk'
  ) THEN
    ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_user_habit_fk" FOREIGN KEY ("user_id", "habit_id") REFERENCES "public"."habits"("user_id", "id") ON DELETE set null ("habit_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "time_blocks_user_id_idx" ON "time_blocks" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_blocks_user_range_idx" ON "time_blocks" USING btree ("user_id", "start_time", "end_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_blocks_user_task_idx" ON "time_blocks" USING btree ("user_id", "task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_blocks_user_habit_idx" ON "time_blocks" USING btree ("user_id", "habit_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_blocks_user_project_idx" ON "time_blocks" USING btree ("user_id", "project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_blocks_user_goal_idx" ON "time_blocks" USING btree ("user_id", "goal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_blocks_user_status_idx" ON "time_blocks" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_blocks_user_commitment_idx" ON "time_blocks" USING btree ("user_id", "commitment_level");
--> statement-breakpoint

-- 2. Permissions Grant for lifeos_app Role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'lifeos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "time_blocks" TO lifeos_app;
  END IF;
END $$;
