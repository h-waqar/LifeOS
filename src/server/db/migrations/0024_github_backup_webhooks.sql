-- 1. Create github_activities table
CREATE TABLE IF NOT EXISTS "github_activities" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "connection_id" text,
  "external_id" text NOT NULL,
  "activity_type" text NOT NULL,
  "repository" text NOT NULL,
  "actor" text NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "url" text,
  "timestamp" timestamp with time zone NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "github_activities_user_external_unique" UNIQUE("user_id", "external_id"),
  CONSTRAINT "github_activities_activity_type_check" CHECK ("activity_type" IN ('commit', 'pull_request', 'issue', 'review', 'release'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'github_activities_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "github_activities" ADD CONSTRAINT "github_activities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'github_activities_connection_id_fk'
  ) THEN
    ALTER TABLE "github_activities" ADD CONSTRAINT "github_activities_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "github_activities_user_id_idx" ON "github_activities" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_activities_user_timestamp_idx" ON "github_activities" USING btree ("user_id", "timestamp");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_activities_user_repo_idx" ON "github_activities" USING btree ("user_id", "repository");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_activities_activity_type_idx" ON "github_activities" USING btree ("activity_type");
--> statement-breakpoint

-- 2. Create backup_records table
CREATE TABLE IF NOT EXISTS "backup_records" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "connection_id" text,
  "storage_provider" text DEFAULT 'local' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "destination" text NOT NULL,
  "size_bytes" integer DEFAULT 0 NOT NULL,
  "checksum" text NOT NULL,
  "encrypted" boolean DEFAULT false NOT NULL,
  "entity_counts" jsonb DEFAULT '{}'::jsonb,
  "error_message" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "backup_records_storage_provider_check" CHECK ("storage_provider" IN ('local', 's3')),
  CONSTRAINT "backup_records_status_check" CHECK ("status" IN ('pending', 'completed', 'failed', 'verified'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'backup_records_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'backup_records_connection_id_fk'
  ) THEN
    ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "backup_records_user_id_idx" ON "backup_records" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backup_records_user_created_at_idx" ON "backup_records" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backup_records_status_idx" ON "backup_records" USING btree ("status");
--> statement-breakpoint

-- 3. Create webhook_deliveries table
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "provider" text NOT NULL,
  "event_type" text NOT NULL,
  "delivery_id" text,
  "status" text DEFAULT 'processed' NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "headers" jsonb DEFAULT '{}'::jsonb,
  "error_message" text,
  "processed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "webhook_deliveries_status_check" CHECK ("status" IN ('processed', 'ignored', 'failed'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "webhook_deliveries_user_id_idx" ON "webhook_deliveries" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_provider_idx" ON "webhook_deliveries" USING btree ("provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_created_at_idx" ON "webhook_deliveries" USING btree ("created_at");
