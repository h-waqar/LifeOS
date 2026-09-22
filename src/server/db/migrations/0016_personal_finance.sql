-- 1. Create finance_accounts table
CREATE TABLE IF NOT EXISTS "finance_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "account_type" text NOT NULL,
  "currency" text DEFAULT 'PKR' NOT NULL,
  "initial_balance" numeric(14, 2) DEFAULT '0.00' NOT NULL,
  "balance" numeric(14, 2) DEFAULT '0.00' NOT NULL,
  "color" text,
  "icon" text,
  "is_archived" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "finance_accounts_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "finance_accounts_name_non_empty" CHECK (length(trim("name")) > 0),
  CONSTRAINT "finance_accounts_type_check" CHECK ("account_type" IN ('checking', 'savings', 'investment', 'credit_card', 'cash'))
);
--> statement-breakpoint

-- 2. Create finance_categories table
CREATE TABLE IF NOT EXISTS "finance_categories" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "category_type" text NOT NULL,
  "icon" text,
  "color" text,
  "is_archived" boolean DEFAULT false NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "finance_categories_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "finance_categories_user_name_type_unique" UNIQUE("user_id", "name", "category_type"),
  CONSTRAINT "finance_categories_name_non_empty" CHECK (length(trim("name")) > 0),
  CONSTRAINT "finance_categories_type_check" CHECK ("category_type" IN ('expense', 'income'))
);
--> statement-breakpoint

-- 3. Create finance_transactions table
CREATE TABLE IF NOT EXISTS "finance_transactions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "account_id" text NOT NULL,
  "to_account_id" text,
  "transaction_type" text NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "currency" text DEFAULT 'PKR' NOT NULL,
  "date" timestamp with time zone NOT NULL,
  "category_id" text,
  "payee" text,
  "description" text,
  "goal_id" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "finance_transactions_user_id_id_unique" UNIQUE("user_id", "id"),
  CONSTRAINT "finance_transactions_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "finance_transactions_type_check" CHECK ("transaction_type" IN ('income', 'expense', 'transfer')),
  CONSTRAINT "finance_transactions_transfer_invariants" CHECK (
    ("transaction_type" != 'transfer' AND "to_account_id" IS NULL) OR
    ("transaction_type" = 'transfer' AND "to_account_id" IS NOT NULL AND "to_account_id" != "account_id")
  )
);
--> statement-breakpoint

-- 4. Foreign Key Constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_accounts_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_categories_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_transactions_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_transactions_user_account_fk'
  ) THEN
    ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_user_account_fk" FOREIGN KEY ("user_id", "account_id") REFERENCES "public"."finance_accounts"("user_id", "id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_transactions_user_to_account_fk'
  ) THEN
    ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_user_to_account_fk" FOREIGN KEY ("user_id", "to_account_id") REFERENCES "public"."finance_accounts"("user_id", "id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_transactions_user_category_fk'
  ) THEN
    ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_user_category_fk" FOREIGN KEY ("user_id", "category_id") REFERENCES "public"."finance_categories"("user_id", "id") ON DELETE set null ("category_id") ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_transactions_user_goal_fk'
  ) THEN
    ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_user_goal_fk" FOREIGN KEY ("user_id", "goal_id") REFERENCES "public"."goals"("user_id", "id") ON DELETE set null ("goal_id") ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

-- 5. Indexes
CREATE INDEX IF NOT EXISTS "finance_accounts_user_idx" ON "finance_accounts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_accounts_user_archived_idx" ON "finance_accounts" USING btree ("user_id", "is_archived");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_categories_user_idx" ON "finance_categories" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_categories_user_type_idx" ON "finance_categories" USING btree ("user_id", "category_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_user_date_idx" ON "finance_transactions" USING btree ("user_id", "date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_user_account_idx" ON "finance_transactions" USING btree ("user_id", "account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_user_type_idx" ON "finance_transactions" USING btree ("user_id", "transaction_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_transactions_user_category_idx" ON "finance_transactions" USING btree ("user_id", "category_id");
