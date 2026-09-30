-- 1. Create integration_connections table
CREATE TABLE IF NOT EXISTS "integration_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "provider" text NOT NULL,
  "status" text DEFAULT 'disconnected' NOT NULL,
  "encrypted_access_token" text,
  "encrypted_refresh_token" text,
  "token_expires_at" timestamp with time zone,
  "scope" text,
  "external_account_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integration_connections_user_provider_unique" UNIQUE("user_id", "provider"),
  CONSTRAINT "integration_connections_status_check" CHECK ("status" IN ('connected', 'disconnected', 'error', 'expired')),
  CONSTRAINT "integration_connections_provider_check" CHECK ("provider" IN ('google_calendar', 'github', 'backup'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'integration_connections_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "integration_connections_user_id_idx" ON "integration_connections" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connections_user_provider_idx" ON "integration_connections" USING btree ("user_id", "provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connections_status_idx" ON "integration_connections" USING btree ("status");
--> statement-breakpoint

-- 2. Create calendar_event_mappings table
CREATE TABLE IF NOT EXISTS "calendar_event_mappings" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "connection_id" text NOT NULL,
  "time_block_id" text NOT NULL,
  "external_calendar_id" text DEFAULT 'primary' NOT NULL,
  "external_event_id" text NOT NULL,
  "external_etag" text,
  "sync_direction" text DEFAULT 'bidirectional' NOT NULL,
  "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "calendar_event_mappings_user_external_unique" UNIQUE("user_id", "external_event_id"),
  CONSTRAINT "calendar_event_mappings_user_time_block_unique" UNIQUE("user_id", "time_block_id"),
  CONSTRAINT "calendar_event_mappings_sync_dir_check" CHECK ("sync_direction" IN ('inbound', 'outbound', 'bidirectional'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_event_mappings_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "calendar_event_mappings" ADD CONSTRAINT "calendar_event_mappings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_event_mappings_connection_id_fk'
  ) THEN
    ALTER TABLE "calendar_event_mappings" ADD CONSTRAINT "calendar_event_mappings_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_event_mappings_time_block_id_fk'
  ) THEN
    ALTER TABLE "calendar_event_mappings" ADD CONSTRAINT "calendar_event_mappings_time_block_id_fk" FOREIGN KEY ("time_block_id") REFERENCES "public"."time_blocks"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "calendar_event_mappings_user_id_idx" ON "calendar_event_mappings" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_event_mappings_connection_id_idx" ON "calendar_event_mappings" USING btree ("connection_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_event_mappings_time_block_id_idx" ON "calendar_event_mappings" USING btree ("time_block_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_event_mappings_external_event_id_idx" ON "calendar_event_mappings" USING btree ("user_id", "external_event_id");
--> statement-breakpoint

-- 3. Create sync_logs table
CREATE TABLE IF NOT EXISTS "sync_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "connection_id" text NOT NULL,
  "provider" text NOT NULL,
  "sync_type" text NOT NULL,
  "status" text NOT NULL,
  "items_processed" integer DEFAULT 0 NOT NULL,
  "items_created" integer DEFAULT 0 NOT NULL,
  "items_updated" integer DEFAULT 0 NOT NULL,
  "items_deleted" integer DEFAULT 0 NOT NULL,
  "items_failed" integer DEFAULT 0 NOT NULL,
  "error_message" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sync_logs_sync_type_check" CHECK ("sync_type" IN ('initial', 'incremental', 'outbound', 'inbound', 'manual')),
  CONSTRAINT "sync_logs_status_check" CHECK ("status" IN ('success', 'partial', 'failed'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sync_logs_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sync_logs_connection_id_fk'
  ) THEN
    ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "sync_logs_user_id_idx" ON "sync_logs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_logs_connection_id_idx" ON "sync_logs" USING btree ("connection_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_logs_user_provider_idx" ON "sync_logs" USING btree ("user_id", "provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_logs_started_at_idx" ON "sync_logs" USING btree ("started_at");
