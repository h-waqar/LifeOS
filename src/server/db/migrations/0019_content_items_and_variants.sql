-- 1. Create content_items table
CREATE TABLE IF NOT EXISTS "content_items" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "content_type" text DEFAULT 'post' NOT NULL,
  "status" text DEFAULT 'idea' NOT NULL,
  "topic" text,
  "target_audience" text,
  "primary_platform" text,
  "target_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "summary" text,
  "media_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "scheduled_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  "project_id" text,
  "goal_id" text,
  "note_id" text,
  "is_archived" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "content_items_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "content_items_title_non_empty" CHECK (length(trim("title")) > 0),
  CONSTRAINT "content_items_title_max_length" CHECK (length("title") <= 255),
  CONSTRAINT "content_items_type_check" CHECK ("content_type" IN ('post', 'thread', 'article', 'short_video', 'carousel', 'newsletter', 'other')),
  CONSTRAINT "content_items_status_check" CHECK ("status" IN ('idea', 'draft', 'in_review', 'scheduled', 'published', 'archived'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_items_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "content_items" ADD CONSTRAINT "content_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_items_user_project_fk'
  ) THEN
    ALTER TABLE "content_items" ADD CONSTRAINT "content_items_user_project_fk" FOREIGN KEY ("user_id", "project_id") REFERENCES "public"."projects"("user_id", "id") ON DELETE set null ("project_id") ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_items_user_goal_fk'
  ) THEN
    ALTER TABLE "content_items" ADD CONSTRAINT "content_items_user_goal_fk" FOREIGN KEY ("user_id", "goal_id") REFERENCES "public"."goals"("user_id", "id") ON DELETE set null ("goal_id") ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_items_user_note_fk'
  ) THEN
    ALTER TABLE "content_items" ADD CONSTRAINT "content_items_user_note_fk" FOREIGN KEY ("user_id", "note_id") REFERENCES "public"."notes"("user_id", "id") ON DELETE set null ("note_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "content_items_user_id_idx" ON "content_items" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_items_user_status_idx" ON "content_items" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_items_user_type_idx" ON "content_items" USING btree ("user_id", "content_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_items_user_scheduled_idx" ON "content_items" USING btree ("user_id", "scheduled_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_items_user_is_archived_idx" ON "content_items" USING btree ("user_id", "is_archived");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_items_user_project_idx" ON "content_items" USING btree ("user_id", "project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_items_user_goal_idx" ON "content_items" USING btree ("user_id", "goal_id");
--> statement-breakpoint

-- GIN Trigram Index on title
CREATE INDEX IF NOT EXISTS "content_items_title_trgm_idx" ON "content_items" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint

-- GIN Full-Text Search Functional Index
CREATE INDEX IF NOT EXISTS "content_items_fts_idx" ON "content_items" USING gin (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("topic", '') || ' ' || coalesce("summary", '')));
--> statement-breakpoint

-- 2. Create content_variants table
CREATE TABLE IF NOT EXISTS "content_variants" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "content_item_id" text NOT NULL,
  "platform" text NOT NULL,
  "title" text,
  "body" text DEFAULT '' NOT NULL,
  "thread_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "char_count" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "custom_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "content_variants_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "content_variants_user_item_platform_unique" UNIQUE("user_id", "content_item_id", "platform"),
  CONSTRAINT "content_variants_platform_check" CHECK ("platform" IN ('twitter', 'linkedin', 'blog', 'instagram', 'youtube', 'newsletter', 'other')),
  CONSTRAINT "content_variants_status_check" CHECK ("status" IN ('draft', 'ready', 'published')),
  CONSTRAINT "content_variants_char_count_non_negative" CHECK ("char_count" >= 0)
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_variants_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_variants_user_item_fk'
  ) THEN
    ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_user_item_fk" FOREIGN KEY ("user_id", "content_item_id") REFERENCES "public"."content_items"("user_id", "id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "content_variants_user_id_idx" ON "content_variants" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_variants_user_item_idx" ON "content_variants" USING btree ("user_id", "content_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_variants_user_platform_idx" ON "content_variants" USING btree ("user_id", "platform");
--> statement-breakpoint

-- 3. Permissions Grant for lifeos_app Role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'lifeos_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "content_items", "content_variants" TO lifeos_app;
  END IF;
END $$;
