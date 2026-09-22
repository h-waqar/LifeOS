-- 1. Create finance_budgets table
CREATE TABLE IF NOT EXISTS "finance_budgets" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "category_id" text NOT NULL,
  "month" text NOT NULL,
  "target_amount" numeric(14, 2) NOT NULL,
  "currency" text DEFAULT 'PKR' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "finance_budgets_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "finance_budgets_user_category_month_unique" UNIQUE("user_id", "category_id", "month"),
  CONSTRAINT "finance_budgets_target_positive" CHECK ("target_amount" > 0),
  CONSTRAINT "finance_budgets_month_format" CHECK ("month" ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint

-- 2. Foreign Key Constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_budgets_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "finance_budgets" ADD CONSTRAINT "finance_budgets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_budgets_user_category_fk'
  ) THEN
    ALTER TABLE "finance_budgets" ADD CONSTRAINT "finance_budgets_user_category_fk" FOREIGN KEY ("user_id", "category_id") REFERENCES "public"."finance_categories"("user_id", "id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

-- 3. Indexes
CREATE INDEX IF NOT EXISTS "finance_budgets_user_month_idx" ON "finance_budgets" USING btree ("user_id", "month");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_budgets_user_category_idx" ON "finance_budgets" USING btree ("user_id", "category_id");
