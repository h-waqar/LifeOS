ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "single_user_lock" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_single_user_lock_unique'
  ) THEN
    ALTER TABLE "user" ADD CONSTRAINT "user_single_user_lock_unique" UNIQUE ("single_user_lock");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_single_user_lock_check'
  ) THEN
    ALTER TABLE "user" ADD CONSTRAINT "user_single_user_lock_check" CHECK ("single_user_lock" = true);
  END IF;
END $$;
