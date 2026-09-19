ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "scheduled_date" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "energy_level" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "recurrence_rule" jsonb;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "goal_id" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "habit_id" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "note_id" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "person_id" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_energy_level_check'
  ) THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_energy_level_check" CHECK ("energy_level" IS NULL OR "energy_level" IN ('low', 'medium', 'high'));
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_user_scheduled_date_idx" ON "tasks" USING btree ("user_id", "scheduled_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_user_energy_level_idx" ON "tasks" USING btree ("user_id", "energy_level");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_dependencies" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"depends_on_task_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependencies_unique" UNIQUE("user_id","task_id","depends_on_task_id"),
	CONSTRAINT "task_dependencies_no_self" CHECK ("task_id" != "depends_on_task_id")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_dependencies_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_dependencies_task_fk'
  ) THEN
    ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_fk" FOREIGN KEY ("user_id","task_id") REFERENCES "public"."tasks"("user_id","id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_dependencies_depends_on_task_fk'
  ) THEN
    ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_fk" FOREIGN KEY ("user_id","depends_on_task_id") REFERENCES "public"."tasks"("user_id","id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_dependencies_user_task_idx" ON "task_dependencies" USING btree ("user_id","task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_dependencies_user_depends_idx" ON "task_dependencies" USING btree ("user_id","depends_on_task_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION task_dependencies_prevent_cycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cycle_detected boolean := false;
BEGIN
  -- 1. Check self-dependency
  IF NEW.task_id = NEW.depends_on_task_id THEN
    RAISE EXCEPTION 'A task cannot depend on itself'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. Check if depends_on_task_id already depends on task_id (directly or transitively)
  WITH RECURSIVE dependency_chain AS (
    SELECT depends_on_task_id, 1 as depth
    FROM public.task_dependencies
    WHERE task_id = NEW.depends_on_task_id AND user_id = NEW.user_id
    UNION ALL
    SELECT td.depends_on_task_id, dc.depth + 1
    FROM public.task_dependencies td
    JOIN dependency_chain dc ON td.task_id = dc.depends_on_task_id
    WHERE td.user_id = NEW.user_id AND dc.depth < 50
  )
  SELECT true INTO cycle_detected
  FROM dependency_chain
  WHERE depends_on_task_id = NEW.task_id
  LIMIT 1;

  IF cycle_detected THEN
    RAISE EXCEPTION 'Dependency cycle detected: adding this dependency would create a circular deadlock'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_task_dependencies_prevent_cycle ON "task_dependencies";
--> statement-breakpoint
CREATE TRIGGER trg_task_dependencies_prevent_cycle
BEFORE INSERT OR UPDATE OF task_id, depends_on_task_id, user_id ON "task_dependencies"
FOR EACH ROW
EXECUTE FUNCTION task_dependencies_prevent_cycle();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'lifeos_app') THEN
    GRANT EXECUTE ON FUNCTION task_dependencies_prevent_cycle() TO lifeos_app;
    GRANT ALL ON TABLE "task_dependencies" TO lifeos_app;
  END IF;
END $$;
