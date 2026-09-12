CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "projects_name_non_empty" CHECK (length(trim("projects"."name")) > 0),
	CONSTRAINT "projects_name_max_length" CHECK (length("projects"."name") <= 255),
	CONSTRAINT "projects_description_max_length" CHECK ("projects"."description" IS NULL OR length("projects"."description") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text,
	"parent_task_id" text,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'inbox' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"due_date" timestamp with time zone,
	"estimated_duration" integer,
	"actual_duration" integer,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "tasks_parent_not_self" CHECK ("tasks"."parent_task_id" IS NULL OR "tasks"."parent_task_id" != "tasks"."id"),
	CONSTRAINT "tasks_title_non_empty" CHECK (length(trim("tasks"."title")) > 0),
	CONSTRAINT "tasks_title_max_length" CHECK (length("tasks"."title") <= 255),
	CONSTRAINT "tasks_description_max_length" CHECK ("tasks"."description" IS NULL OR length("tasks"."description") <= 4000),
	CONSTRAINT "tasks_estimated_duration_bounds" CHECK ("tasks"."estimated_duration" IS NULL OR ("tasks"."estimated_duration" >= 0 AND "tasks"."estimated_duration" <= 10080)),
	CONSTRAINT "tasks_actual_duration_bounds" CHECK ("tasks"."actual_duration" IS NULL OR ("tasks"."actual_duration" >= 0 AND "tasks"."actual_duration" <= 10080)),
	CONSTRAINT "tasks_completed_at_invariant" CHECK ("tasks"."status" != 'completed' OR "tasks"."completed_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_project_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."projects"("user_id","id") ON DELETE set null ("project_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_parent_task_fk" FOREIGN KEY ("user_id","parent_task_id") REFERENCES "public"."tasks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_user_status_idx" ON "projects" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "projects_user_priority_idx" ON "projects" USING btree ("user_id","priority");--> statement-breakpoint
CREATE INDEX "tasks_user_id_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_user_status_idx" ON "tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "tasks_user_project_idx" ON "tasks" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE INDEX "tasks_user_parent_task_idx" ON "tasks" USING btree ("user_id","parent_task_id");--> statement-breakpoint
CREATE INDEX "tasks_user_due_date_idx" ON "tasks" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX "tasks_user_priority_idx" ON "tasks" USING btree ("user_id","priority");--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'lifeos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "projects", "tasks" TO lifeos_app;
  END IF;
END $$;