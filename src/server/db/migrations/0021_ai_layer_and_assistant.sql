-- 1. Create user_ai_settings table
CREATE TABLE IF NOT EXISTS "user_ai_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "default_provider" text DEFAULT 'google' NOT NULL,
  "default_model" text DEFAULT 'gemini-2.5-flash' NOT NULL,
  "encrypted_gemini_key" text,
  "encrypted_anthropic_key" text,
  "encrypted_openai_key" text,
  "ollama_base_url" text,
  "temperature" numeric(3, 2) DEFAULT '0.70',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_ai_settings_user_id_unique" UNIQUE("user_id"),
  CONSTRAINT "user_ai_settings_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "user_ai_settings_provider_check" CHECK ("default_provider" IN ('google', 'anthropic', 'openai', 'ollama'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_ai_settings_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "user_ai_settings" ADD CONSTRAINT "user_ai_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_ai_settings_user_id_idx" ON "user_ai_settings" USING btree ("user_id");
--> statement-breakpoint

-- 2. Create ai_conversations table
CREATE TABLE IF NOT EXISTS "ai_conversations" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "title" text DEFAULT 'New Conversation' NOT NULL,
  "provider" text DEFAULT 'google' NOT NULL,
  "model" text DEFAULT 'gemini-2.5-flash' NOT NULL,
  "system_prompt_override" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_conversations_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "ai_conversations_provider_check" CHECK ("provider" IN ('google', 'anthropic', 'openai', 'ollama'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_conversations_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_conversations_user_id_created_at_idx" ON "ai_conversations" USING btree ("user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_conversations_user_id_idx" ON "ai_conversations" USING btree ("user_id");
--> statement-breakpoint

-- 3. Create ai_messages table
CREATE TABLE IF NOT EXISTS "ai_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL,
  "user_id" text NOT NULL,
  "role" text NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "tool_calls" jsonb,
  "tool_results" jsonb,
  "token_count" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_messages_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "ai_messages_role_check" CHECK ("role" IN ('system', 'user', 'assistant', 'tool'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_messages_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_messages_conversation_id_fk'
  ) THEN
    ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_messages_conversation_id_created_at_idx" ON "ai_messages" USING btree ("conversation_id", "created_at" ASC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_messages_user_id_idx" ON "ai_messages" USING btree ("user_id");
--> statement-breakpoint

-- 4. Create ai_actions table
CREATE TABLE IF NOT EXISTS "ai_actions" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL,
  "message_id" text,
  "user_id" text NOT NULL,
  "tool_name" text NOT NULL,
  "risk_level" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "parameters" jsonb NOT NULL,
  "preview_data" jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "executed_at" timestamp with time zone,
  "audit_log_id" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_actions_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "ai_actions_risk_level_check" CHECK ("risk_level" IN ('low', 'consequential', 'destructive')),
  CONSTRAINT "ai_actions_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'executed', 'failed', 'expired'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_actions_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_actions_conversation_id_fk'
  ) THEN
    ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_actions_message_id_fk'
  ) THEN
    ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ai_messages"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_actions_audit_log_id_fk'
  ) THEN
    ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_audit_log_id_fk" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_log"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_actions_user_status_expires_idx" ON "ai_actions" USING btree ("user_id", "status", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_actions_conversation_id_idx" ON "ai_actions" USING btree ("conversation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_actions_user_id_idx" ON "ai_actions" USING btree ("user_id");
