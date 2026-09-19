-- 1. Create Habits Table
CREATE TABLE IF NOT EXISTS "habits" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "frequency" text DEFAULT 'daily' NOT NULL,
  "frequency_target" integer DEFAULT 1 NOT NULL,
  "frequency_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "interval_days" integer DEFAULT 1 NOT NULL,
  "target_value" double precision DEFAULT 1 NOT NULL,
  "unit" text,
  "time_of_day" text DEFAULT 'anytime' NOT NULL,
  "reminder_time" text,
  "goal_id" text,
  "identity_statement" text,
  "status" text DEFAULT 'active' NOT NULL,
  "current_streak" integer DEFAULT 0 NOT NULL,
  "longest_streak" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "habits_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "habits_title_non_empty" CHECK (length(trim("title")) > 0),
  CONSTRAINT "habits_title_max_length" CHECK (length("title") <= 255),
  CONSTRAINT "habits_description_max_length" CHECK ("description" IS NULL OR length("description") <= 4000),
  CONSTRAINT "habits_identity_statement_max_length" CHECK ("identity_statement" IS NULL OR length("identity_statement") <= 500),
  CONSTRAINT "habits_frequency_check" CHECK ("frequency" IN ('daily', 'weekdays', 'weekly', 'specific_days', 'custom')),
  CONSTRAINT "habits_frequency_target_positive" CHECK ("frequency_target" >= 1),
  CONSTRAINT "habits_interval_days_positive" CHECK ("interval_days" >= 1),
  CONSTRAINT "habits_target_value_positive" CHECK ("target_value" > 0),
  CONSTRAINT "habits_time_of_day_check" CHECK ("time_of_day" IN ('morning', 'afternoon', 'evening', 'anytime')),
  CONSTRAINT "habits_status_check" CHECK ("status" IN ('active', 'paused', 'archived')),
  CONSTRAINT "habits_current_streak_non_negative" CHECK ("current_streak" >= 0),
  CONSTRAINT "habits_longest_streak_non_negative" CHECK ("longest_streak" >= 0)
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'habits_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'habits_user_goal_fk'
  ) THEN
    ALTER TABLE "habits" ADD CONSTRAINT "habits_user_goal_fk" FOREIGN KEY ("user_id", "goal_id") REFERENCES "public"."goals"("user_id", "id") ON DELETE set null ("goal_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "habits_user_id_idx" ON "habits" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habits_user_status_idx" ON "habits" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habits_user_goal_idx" ON "habits" USING btree ("user_id", "goal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habits_user_time_of_day_idx" ON "habits" USING btree ("user_id", "time_of_day");
--> statement-breakpoint

-- 2. Create Habit Entries Table
CREATE TABLE IF NOT EXISTS "habit_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "habit_id" text NOT NULL,
  "date" text NOT NULL,
  "value" double precision DEFAULT 1 NOT NULL,
  "target_value" double precision DEFAULT 1 NOT NULL,
  "notes" text,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "habit_entries_user_habit_date_unique" UNIQUE("user_id", "habit_id", "date"),
  CONSTRAINT "habit_entries_date_format_check" CHECK ("date" ~ '^\d{4}-\d{2}-\d{2}$'),
  CONSTRAINT "habit_entries_value_positive" CHECK ("value" >= 0),
  CONSTRAINT "habit_entries_notes_max_length" CHECK ("notes" IS NULL OR length("notes") <= 1000)
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'habit_entries_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "habit_entries" ADD CONSTRAINT "habit_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'habit_entries_user_habit_fk'
  ) THEN
    ALTER TABLE "habit_entries" ADD CONSTRAINT "habit_entries_user_habit_fk" FOREIGN KEY ("user_id", "habit_id") REFERENCES "public"."habits"("user_id", "id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "habit_entries_user_habit_idx" ON "habit_entries" USING btree ("user_id", "habit_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habit_entries_user_date_idx" ON "habit_entries" USING btree ("user_id", "date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "habit_entries_user_habit_date_idx" ON "habit_entries" USING btree ("user_id", "habit_id", "date");
--> statement-breakpoint

-- 3. Extend Tasks Table with Composite Habits Foreign Key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_user_habit_fk'
  ) THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_habit_fk" FOREIGN KEY ("user_id", "habit_id") REFERENCES "public"."habits"("user_id", "id") ON DELETE set null ("habit_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tasks_user_habit_idx" ON "tasks" USING btree ("user_id", "habit_id");
--> statement-breakpoint

-- 4. Permissions Grant for lifeos_app Role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'lifeos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "habits", "habit_entries" TO lifeos_app;
  END IF;
END $$;
