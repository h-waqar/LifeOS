-- 1. Create content_publications table
CREATE TABLE IF NOT EXISTS "content_publications" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "content_item_id" text NOT NULL,
  "variant_id" text,
  "platform" text NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "scheduled_for" timestamp with time zone NOT NULL,
  "published_at" timestamp with time zone,
  "post_url" text,
  "external_post_id" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "content_publications_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "content_publications_platform_check" CHECK ("platform" IN ('twitter', 'linkedin', 'blog', 'instagram', 'youtube', 'newsletter', 'other')),
  CONSTRAINT "content_publications_status_check" CHECK ("status" IN ('scheduled', 'published', 'failed', 'cancelled'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_publications_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "content_publications" ADD CONSTRAINT "content_publications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_publications_user_item_fk'
  ) THEN
    ALTER TABLE "content_publications" ADD CONSTRAINT "content_publications_user_item_fk" FOREIGN KEY ("user_id", "content_item_id") REFERENCES "public"."content_items"("user_id", "id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_publications_user_variant_fk'
  ) THEN
    ALTER TABLE "content_publications" ADD CONSTRAINT "content_publications_user_variant_fk" FOREIGN KEY ("user_id", "variant_id") REFERENCES "public"."content_variants"("user_id", "id") ON DELETE set null ("variant_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "content_publications_user_id_idx" ON "content_publications" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_publications_user_item_idx" ON "content_publications" USING btree ("user_id", "content_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_publications_user_scheduled_idx" ON "content_publications" USING btree ("user_id", "scheduled_for");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_publications_user_status_idx" ON "content_publications" USING btree ("user_id", "status");
--> statement-breakpoint

-- 2. Create content_metrics table
CREATE TABLE IF NOT EXISTS "content_metrics" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "publication_id" text NOT NULL,
  "content_item_id" text NOT NULL,
  "views" integer DEFAULT 0 NOT NULL,
  "likes" integer DEFAULT 0 NOT NULL,
  "comments" integer DEFAULT 0 NOT NULL,
  "shares" integer DEFAULT 0 NOT NULL,
  "saves" integer DEFAULT 0 NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "engagement_rate" numeric(5, 2) DEFAULT '0.00' NOT NULL,
  "notes" text,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "content_metrics_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "content_metrics_views_non_negative" CHECK ("views" >= 0),
  CONSTRAINT "content_metrics_likes_non_negative" CHECK ("likes" >= 0),
  CONSTRAINT "content_metrics_comments_non_negative" CHECK ("comments" >= 0),
  CONSTRAINT "content_metrics_shares_non_negative" CHECK ("shares" >= 0),
  CONSTRAINT "content_metrics_saves_non_negative" CHECK ("saves" >= 0),
  CONSTRAINT "content_metrics_clicks_non_negative" CHECK ("clicks" >= 0),
  CONSTRAINT "content_metrics_engagement_rate_non_negative" CHECK ("engagement_rate" >= 0)
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_metrics_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "content_metrics" ADD CONSTRAINT "content_metrics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_metrics_user_publication_fk'
  ) THEN
    ALTER TABLE "content_metrics" ADD CONSTRAINT "content_metrics_user_publication_fk" FOREIGN KEY ("user_id", "publication_id") REFERENCES "public"."content_publications"("user_id", "id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_metrics_user_item_fk'
  ) THEN
    ALTER TABLE "content_metrics" ADD CONSTRAINT "content_metrics_user_item_fk" FOREIGN KEY ("user_id", "content_item_id") REFERENCES "public"."content_items"("user_id", "id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "content_metrics_user_id_idx" ON "content_metrics" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_metrics_user_publication_idx" ON "content_metrics" USING btree ("user_id", "publication_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_metrics_user_item_idx" ON "content_metrics" USING btree ("user_id", "content_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_metrics_user_recorded_idx" ON "content_metrics" USING btree ("user_id", "recorded_at");
