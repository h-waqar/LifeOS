-- Migration: 0027_agent_safety_and_audit.sql
-- Phase 13: Zero-Trust Agent Safety, Permissions & Attribution Audit (SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-05)

-- 1. Create agent_tokens table
CREATE TABLE IF NOT EXISTS "agent_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "token_hash" text NOT NULL,
  "token_prefix" text NOT NULL,
  "provider" text DEFAULT 'generic' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "expires_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_tokens_token_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "agent_tokens_status_check" CHECK ("status" IN ('active', 'revoked', 'expired'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_tokens_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "agent_tokens_user_id_idx" ON "agent_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_tokens_user_status_idx" ON "agent_tokens" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_tokens_token_hash_idx" ON "agent_tokens" USING btree ("token_hash");
--> statement-breakpoint

-- 2. Create agent_permissions table
CREATE TABLE IF NOT EXISTS "agent_permissions" (
  "id" text PRIMARY KEY NOT NULL,
  "agent_token_id" text NOT NULL,
  "user_id" text NOT NULL,
  "capability" text NOT NULL,
  "resource" text DEFAULT '*' NOT NULL,
  "action" text DEFAULT '*' NOT NULL,
  "allowed" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_permissions_token_cap_res_act_unique" UNIQUE("agent_token_id", "capability", "resource", "action"),
  CONSTRAINT "agent_permissions_capability_check" CHECK ("capability" IN ('READ', 'WRITE', 'EXECUTE', 'DESTRUCTIVE', 'SENSITIVE'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_permissions_agent_token_id_agent_tokens_id_fk'
  ) THEN
    ALTER TABLE "agent_permissions" ADD CONSTRAINT "agent_permissions_agent_token_id_agent_tokens_id_fk" FOREIGN KEY ("agent_token_id") REFERENCES "public"."agent_tokens"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_permissions_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "agent_permissions" ADD CONSTRAINT "agent_permissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "agent_permissions_agent_token_idx" ON "agent_permissions" USING btree ("agent_token_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_permissions_user_token_idx" ON "agent_permissions" USING btree ("user_id", "agent_token_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_permissions_capability_idx" ON "agent_permissions" USING btree ("agent_token_id", "capability");
--> statement-breakpoint

-- 3. Create agent_challenges table
CREATE TABLE IF NOT EXISTS "agent_challenges" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "agent_token_id" text NOT NULL,
  "operation" text NOT NULL,
  "capability" text NOT NULL,
  "resource" text NOT NULL,
  "resource_id" text,
  "arguments" jsonb NOT NULL,
  "arguments_hash" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "approved_at" timestamp with time zone,
  "consumed_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "rejection_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_challenges_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONSUMED')),
  CONSTRAINT "agent_challenges_capability_check" CHECK ("capability" IN ('DESTRUCTIVE', 'SENSITIVE'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_challenges_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "agent_challenges" ADD CONSTRAINT "agent_challenges_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_challenges_agent_token_id_agent_tokens_id_fk'
  ) THEN
    ALTER TABLE "agent_challenges" ADD CONSTRAINT "agent_challenges_agent_token_id_agent_tokens_id_fk" FOREIGN KEY ("agent_token_id") REFERENCES "public"."agent_tokens"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "agent_challenges_user_status_expires_idx" ON "agent_challenges" USING btree ("user_id", "status", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_challenges_agent_status_idx" ON "agent_challenges" USING btree ("agent_token_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_challenges_expires_at_idx" ON "agent_challenges" USING btree ("expires_at", "status");
--> statement-breakpoint

-- 4. Create agent_audit_log table
CREATE TABLE IF NOT EXISTS "agent_audit_log" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "agent_token_id" text,
  "agent_name" text,
  "provider" text,
  "session_id" text,
  "tool_name" text NOT NULL,
  "capability" text NOT NULL,
  "operation" text NOT NULL,
  "resource" text,
  "arguments" jsonb,
  "arguments_hash" text,
  "challenge_id" text,
  "challenge_status" text,
  "status" text NOT NULL,
  "before_state" jsonb,
  "after_state" jsonb,
  "state_diff" jsonb,
  "duration_ms" integer,
  "error_message" text,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_audit_log_status_check" CHECK ("status" IN ('REQUESTED', 'DENIED', 'CHALLENGE_CREATED', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED', 'FAILED')),
  CONSTRAINT "agent_audit_log_capability_check" CHECK ("capability" IN ('READ', 'WRITE', 'EXECUTE', 'DESTRUCTIVE', 'SENSITIVE'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_audit_log_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "agent_audit_log" ADD CONSTRAINT "agent_audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_audit_log_agent_token_id_agent_tokens_id_fk'
  ) THEN
    ALTER TABLE "agent_audit_log" ADD CONSTRAINT "agent_audit_log_agent_token_id_agent_tokens_id_fk" FOREIGN KEY ("agent_token_id") REFERENCES "public"."agent_tokens"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_audit_log_challenge_id_agent_challenges_id_fk'
  ) THEN
    ALTER TABLE "agent_audit_log" ADD CONSTRAINT "agent_audit_log_challenge_id_agent_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."agent_challenges"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "agent_audit_log_user_created_idx" ON "agent_audit_log" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_audit_log_token_created_idx" ON "agent_audit_log" USING btree ("agent_token_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_audit_log_tool_status_idx" ON "agent_audit_log" USING btree ("tool_name", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_audit_log_challenge_idx" ON "agent_audit_log" USING btree ("challenge_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_audit_log_created_at_idx" ON "agent_audit_log" USING btree ("created_at");
