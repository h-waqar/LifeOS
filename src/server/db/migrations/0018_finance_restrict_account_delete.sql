-- Migration 0018: Enforce ON DELETE RESTRICT on finance_transactions account foreign keys
-- This ensures the database independently enforces the ledger-preservation invariant.

DO $$
BEGIN
  -- 1. Drop existing cascade foreign key for user_account_fk and recreate with RESTRICT
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_transactions_user_account_fk'
  ) THEN
    ALTER TABLE "finance_transactions" DROP CONSTRAINT "finance_transactions_user_account_fk";
  END IF;
  ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_user_account_fk"
    FOREIGN KEY ("user_id", "account_id") REFERENCES "public"."finance_accounts"("user_id", "id")
    ON DELETE RESTRICT ON UPDATE no action;

  -- 2. Drop existing cascade foreign key for user_to_account_fk and recreate with RESTRICT
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_transactions_user_to_account_fk'
  ) THEN
    ALTER TABLE "finance_transactions" DROP CONSTRAINT "finance_transactions_user_to_account_fk";
  END IF;
  ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_user_to_account_fk"
    FOREIGN KEY ("user_id", "to_account_id") REFERENCES "public"."finance_accounts"("user_id", "id")
    ON DELETE RESTRICT ON UPDATE no action;
END $$;
