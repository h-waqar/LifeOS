-- 1. Alter user_preferences table to add quiet hours and timezone configuration
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "quiet_hours_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "quiet_hours_start" text DEFAULT '22:00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "quiet_hours_end" text DEFAULT '08:00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'UTC' NOT NULL;
--> statement-breakpoint

-- 2. Create notifications table
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "title" varchar(255) NOT NULL,
  "message" text NOT NULL,
  "type" text DEFAULT 'info' NOT NULL,
  "entity_type" text,
  "entity_id" text,
  "link_url" text,
  "is_read" boolean DEFAULT false NOT NULL,
  "read_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notifications_type_check" CHECK ("type" IN ('info', 'warning', 'success', 'error', 'reminder')),
  CONSTRAINT "notifications_entity_type_check" CHECK ("entity_type" IS NULL OR "entity_type" IN ('task', 'project', 'goal', 'habit', 'finance', 'content', 'system'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notifications_user_read_created_idx" ON "notifications" USING btree ("user_id", "is_read", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "notifications" USING btree ("user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications" USING btree ("user_id");
--> statement-breakpoint

-- 3. Create automations table
CREATE TABLE IF NOT EXISTS "automations" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "trigger_type" text NOT NULL,
  "trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "action_type" text NOT NULL,
  "action_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "execution_count" integer DEFAULT 0 NOT NULL,
  "last_run_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "automations_trigger_type_check" CHECK ("trigger_type" IN ('event', 'schedule', 'threshold')),
  CONSTRAINT "automations_action_type_check" CHECK ("action_type" IN ('create_notification', 'create_task', 'update_task', 'update_project', 'log_audit', 'trigger_ai_suggestions'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'automations_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "automations" ADD CONSTRAINT "automations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "automations_user_active_idx" ON "automations" USING btree ("user_id", "is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automations_user_trigger_idx" ON "automations" USING btree ("user_id", "trigger_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automations_user_id_idx" ON "automations" USING btree ("user_id");
--> statement-breakpoint

-- 4. Create automation_runs table
CREATE TABLE IF NOT EXISTS "automation_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "automation_id" text NOT NULL,
  "trigger_event" text NOT NULL,
  "status" text NOT NULL,
  "execution_duration_ms" integer DEFAULT 0 NOT NULL,
  "context_snapshot" jsonb DEFAULT '{}'::jsonb,
  "action_output" jsonb DEFAULT '{}'::jsonb,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "automation_runs_status_check" CHECK ("status" IN ('success', 'failed', 'skipped'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'automation_runs_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'automation_runs_automation_id_fk'
  ) THEN
    ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "automation_runs_user_auto_created_idx" ON "automation_runs" USING btree ("user_id", "automation_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_runs_user_status_idx" ON "automation_runs" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_runs_user_id_idx" ON "automation_runs" USING btree ("user_id");
--> statement-breakpoint

-- 5. Create scheduler_locks table
CREATE TABLE IF NOT EXISTS "scheduler_locks" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "job_name" varchar(128) NOT NULL,
  "idempotency_key" varchar(255) NOT NULL,
  "status" text DEFAULT 'locked' NOT NULL,
  "locked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "scheduler_locks_key_unique" UNIQUE ("user_id", "idempotency_key"),
  CONSTRAINT "scheduler_locks_status_check" CHECK ("status" IN ('locked', 'completed', 'failed'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scheduler_locks_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "scheduler_locks" ADD CONSTRAINT "scheduler_locks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "scheduler_locks_user_job_idx" ON "scheduler_locks" USING btree ("user_id", "job_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduler_locks_user_id_idx" ON "scheduler_locks" USING btree ("user_id");
