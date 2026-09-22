-- 1. Enable pg_trgm Extension for Trigram Fuzzy Search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

-- 2. GIN Trigram Indexes for Fast Fuzzy, Typo-Tolerant, and Partial Matching
CREATE INDEX IF NOT EXISTS "notes_title_trgm_idx" ON "notes" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_title_trgm_idx" ON "tasks" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_name_trgm_idx" ON "projects" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_title_trgm_idx" ON "goals" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_name_trgm_idx" ON "people" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_company_trgm_idx" ON "people" USING gin ("company" gin_trgm_ops);
--> statement-breakpoint

-- 3. GIN Full-Text Search Functional Indexes (English stemming and dictionary vector)
CREATE INDEX IF NOT EXISTS "notes_fts_idx" ON "notes" USING gin (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("content", '')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_fts_idx" ON "tasks" USING gin (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", '')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_fts_idx" ON "projects" USING gin (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("description", '')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goals_fts_idx" ON "goals" USING gin (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", '')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "people_fts_idx" ON "people" USING gin (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("company", '') || ' ' || coalesce("role", '') || ' ' || coalesce("notes", '')));
