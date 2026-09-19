-- 1. Create Goals Table
CREATE TABLE IF NOT EXISTS "goals" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "horizon" text DEFAULT 'medium_term' NOT NULL,
  "area" text DEFAULT 'general' NOT NULL,
  "status" text DEFAULT 'in_progress' NOT NULL,
  "priority" text DEFAULT 'medium' NOT NULL,
  "metric_type" text DEFAULT 'none' NOT NULL,
  "target_value" double precision,
  "current_value" double precision DEFAULT 0,
  "unit" text,
  "start_date" timestamp with time zone,
  "target_date" timestamp with time zone,
  "parent_goal_id" text,
  "progress" integer DEFAULT 0 NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "goals_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "goals_parent_not_self" CHECK ("parent_goal_id" IS NULL OR "parent_goal_id" != "id"),
  CONSTRAINT "goals_title_non_empty" CHECK (length(trim("title")) > 0),
  CONSTRAINT "goals_title_max_length" CHECK (length("title") <= 255),
  CONSTRAINT "goals_description_max_length" CHECK ("description" IS NULL OR length("description") <= 4000),
  CONSTRAINT "goals_horizon_check" CHECK ("horizon" IN ('long_term', 'medium_term', 'short_term')),
  CONSTRAINT "goals_area_check" CHECK ("area" IN ('health', 'career', 'finance', 'personal_development', 'relationships', 'general')),
  CONSTRAINT "goals_status_check" CHECK ("status" IN ('not_started', 'in_progress', 'completed', 'paused', 'archived')),
  CONSTRAINT "goals_priority_check" CHECK ("priority" IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT "goals_metric_type_check" CHECK ("metric_type" IN ('none', 'numeric', 'currency', 'boolean', 'percentage')),
  CONSTRAINT "goals_progress_bounds" CHECK ("progress" >= 0 AND "progress" <= 100),
  CONSTRAINT "goals_completed_at_invariant" CHECK ("status" != 'completed' OR "completed_at" IS NOT NULL)
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'goals_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'goals_user_parent_goal_fk'
  ) THEN
    ALTER TABLE "goals" ADD CONSTRAINT "goals_user_parent_goal_fk" FOREIGN KEY ("user_id", "parent_goal_id") REFERENCES "public"."goals"("user_id", "id") ON DELETE set null ("parent_goal_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "goals_user_id_idx" ON "goals" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_user_status_idx" ON "goals" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_user_horizon_idx" ON "goals" USING btree ("user_id", "horizon");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_user_area_idx" ON "goals" USING btree ("user_id", "area");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_user_parent_goal_idx" ON "goals" USING btree ("user_id", "parent_goal_id");
--> statement-breakpoint

-- Recursive CTE Trigger for Goals Hierarchy Cycle Prevention
CREATE OR REPLACE FUNCTION check_goal_hierarchy_cycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cycle_detected boolean := false;
BEGIN
  IF NEW.parent_goal_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_goal_id = NEW.id THEN
    RAISE EXCEPTION 'A goal cannot be its own parent'
      USING ERRCODE = 'check_violation';
  END IF;

  WITH RECURSIVE ancestor_chain AS (
    SELECT id, parent_goal_id, 1 as depth
    FROM public.goals
    WHERE id = NEW.parent_goal_id AND user_id = NEW.user_id
    UNION ALL
    SELECT g.id, g.parent_goal_id, ac.depth + 1
    FROM public.goals g
    JOIN ancestor_chain ac ON g.id = ac.parent_goal_id
    WHERE g.user_id = NEW.user_id AND ac.depth < 50 AND ac.parent_goal_id IS NOT NULL
  )
  SELECT true INTO cycle_detected
  FROM ancestor_chain
  WHERE id = NEW.id
  LIMIT 1;

  IF cycle_detected THEN
    RAISE EXCEPTION 'Goal hierarchy cycle detected: cannot set parent to a descendant'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_goals_prevent_cycle ON public.goals;
--> statement-breakpoint
CREATE TRIGGER trg_goals_prevent_cycle
BEFORE INSERT OR UPDATE OF parent_goal_id ON public.goals
FOR EACH ROW
EXECUTE FUNCTION check_goal_hierarchy_cycle();
--> statement-breakpoint

-- 2. Extensions to Projects Table
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "area" text DEFAULT 'general' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "start_date" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deadline" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "goal_id" text;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_area_check'
  ) THEN
    ALTER TABLE "projects" ADD CONSTRAINT "projects_area_check" CHECK ("area" IN ('health', 'career', 'finance', 'personal_development', 'relationships', 'general'));
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_user_goal_fk'
  ) THEN
    ALTER TABLE "projects" ADD CONSTRAINT "projects_user_goal_fk" FOREIGN KEY ("user_id", "goal_id") REFERENCES "public"."goals"("user_id", "id") ON DELETE set null ("goal_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "projects_user_goal_idx" ON "projects" USING btree ("user_id", "goal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_user_area_idx" ON "projects" USING btree ("user_id", "area");
--> statement-breakpoint

-- 3. Create Project Milestones Table
CREATE TABLE IF NOT EXISTS "project_milestones" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "project_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "target_date" timestamp with time zone,
  "status" text DEFAULT 'pending' NOT NULL,
  "completed_at" timestamp with time zone,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "project_milestones_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "project_milestones_title_non_empty" CHECK (length(trim("title")) > 0),
  CONSTRAINT "project_milestones_title_max_length" CHECK (length("title") <= 255),
  CONSTRAINT "project_milestones_description_max_length" CHECK ("description" IS NULL OR length("description") <= 2000),
  CONSTRAINT "project_milestones_status_check" CHECK ("status" IN ('pending', 'completed')),
  CONSTRAINT "project_milestones_completed_at_invariant" CHECK ("status" != 'completed' OR "completed_at" IS NOT NULL)
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_milestones_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_milestones_project_fk'
  ) THEN
    ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_fk" FOREIGN KEY ("user_id", "project_id") REFERENCES "public"."projects"("user_id", "id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_milestones_user_idx" ON "project_milestones" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_milestones_user_project_idx" ON "project_milestones" USING btree ("user_id", "project_id");
--> statement-breakpoint

-- 4. Extensions to Tasks Table
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "milestone_id" text;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_user_goal_fk'
  ) THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_goal_fk" FOREIGN KEY ("user_id", "goal_id") REFERENCES "public"."goals"("user_id", "id") ON DELETE set null ("goal_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_user_milestone_fk'
  ) THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_milestone_fk" FOREIGN KEY ("user_id", "milestone_id") REFERENCES "public"."project_milestones"("user_id", "id") ON DELETE set null ("milestone_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tasks_user_goal_idx" ON "tasks" USING btree ("user_id", "goal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_user_milestone_idx" ON "tasks" USING btree ("user_id", "milestone_id");
