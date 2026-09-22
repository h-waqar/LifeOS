-- 1. Create People Table
CREATE TABLE IF NOT EXISTS "people" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "relationship_type" text DEFAULT 'colleague' NOT NULL,
  "company" text,
  "role" text,
  "email" text,
  "phone" text,
  "contact_info" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text,
  "is_archived" boolean DEFAULT false NOT NULL,
  "last_interaction_date" timestamp with time zone,
  "next_follow_up_date" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "people_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "people_name_non_empty" CHECK (length(trim("name")) > 0),
  CONSTRAINT "people_name_max_length" CHECK (length("name") <= 255),
  CONSTRAINT "people_relationship_type_check" CHECK ("relationship_type" IN ('client', 'friend', 'family', 'colleague', 'prospect', 'mentor', 'professional', 'other'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'people_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "people" ADD CONSTRAINT "people_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "people_user_id_idx" ON "people" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_user_relationship_type_idx" ON "people" USING btree ("user_id", "relationship_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_user_is_archived_idx" ON "people" USING btree ("user_id", "is_archived");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_user_company_idx" ON "people" USING btree ("user_id", "company");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_user_next_follow_up_idx" ON "people" USING btree ("user_id", "next_follow_up_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_user_last_interaction_idx" ON "people" USING btree ("user_id", "last_interaction_date");
--> statement-breakpoint

-- 2. Create Interactions Table
CREATE TABLE IF NOT EXISTS "interactions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "person_id" text NOT NULL,
  "date" timestamp with time zone DEFAULT now() NOT NULL,
  "channel" text DEFAULT 'call' NOT NULL,
  "summary" text NOT NULL,
  "next_follow_up_date" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "interactions_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "interactions_summary_non_empty" CHECK (length(trim("summary")) > 0),
  CONSTRAINT "interactions_channel_check" CHECK ("channel" IN ('meeting', 'call', 'email', 'message', 'in_person', 'other'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interactions_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "interactions" ADD CONSTRAINT "interactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interactions_user_person_fk'
  ) THEN
    ALTER TABLE "interactions" ADD CONSTRAINT "interactions_user_person_fk" FOREIGN KEY ("user_id", "person_id") REFERENCES "public"."people"("user_id", "id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "interactions_user_person_idx" ON "interactions" USING btree ("user_id", "person_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interactions_user_date_idx" ON "interactions" USING btree ("user_id", "date");
--> statement-breakpoint

-- 3. Add person_id and Foreign Key to Notes
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "person_id" text;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_user_person_fk'
  ) THEN
    ALTER TABLE "notes" ADD CONSTRAINT "notes_user_person_fk" FOREIGN KEY ("user_id", "person_id") REFERENCES "public"."people"("user_id", "id") ON DELETE set null ("person_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notes_user_person_idx" ON "notes" USING btree ("user_id", "person_id");
--> statement-breakpoint

-- 4. Add Foreign Key and Index to Tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_user_person_fk'
  ) THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_person_fk" FOREIGN KEY ("user_id", "person_id") REFERENCES "public"."people"("user_id", "id") ON DELETE set null ("person_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tasks_user_person_idx" ON "tasks" USING btree ("user_id", "person_id");
