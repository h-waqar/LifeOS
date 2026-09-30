-- Migration: 0025_analytics_snapshots.sql
-- Create analytics_snapshots table for Phase 9 Personal Analytics

CREATE TABLE IF NOT EXISTS "analytics_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "period_type" text DEFAULT 'month' NOT NULL,
  "start_date" text NOT NULL,
  "end_date" text NOT NULL,
  "metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "analytics_snapshots_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "analytics_snapshots_user_period_range_unique" UNIQUE("user_id", "period_type", "start_date", "end_date"),
  CONSTRAINT "analytics_snapshots_period_type_check" CHECK ("period_type" IN ('7d', '30d', '90d', 'day', 'week', 'month', 'quarter', 'year', 'custom'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'analytics_snapshots_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "analytics_snapshots_user_id_idx" ON "analytics_snapshots" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_snapshots_user_period_idx" ON "analytics_snapshots" USING btree ("user_id", "period_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_snapshots_date_range_idx" ON "analytics_snapshots" USING btree ("user_id", "start_date", "end_date");
