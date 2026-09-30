-- Migration: 0026_pgvector_knowledge_embeddings.sql
-- Enable pgvector extension and create knowledge_embeddings table for Phase 9 Semantic Search (INTEL-03)

CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "knowledge_embeddings" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "chunk_index" integer DEFAULT 0 NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(768) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "knowledge_embeddings_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "knowledge_embeddings_entity_chunk_unique" UNIQUE("user_id", "entity_type", "entity_id", "chunk_index"),
  CONSTRAINT "knowledge_embeddings_entity_type_check" CHECK ("entity_type" IN ('note', 'learning_item', 'content_item'))
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_embeddings_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "knowledge_embeddings_user_id_idx" ON "knowledge_embeddings" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_embeddings_user_entity_idx" ON "knowledge_embeddings" USING btree ("user_id", "entity_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_embeddings_user_entity_id_idx" ON "knowledge_embeddings" USING btree ("user_id", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_embeddings_vector_idx" ON "knowledge_embeddings" USING hnsw ("embedding" vector_cosine_ops);
