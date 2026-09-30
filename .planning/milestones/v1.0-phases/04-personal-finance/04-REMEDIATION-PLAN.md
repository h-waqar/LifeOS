# Phase 4 Personal Finance: Zero-Trust Remediation Plan

## 1. Executive Summary & Audit Context

- **Phase:** 4 — Personal Finance
- **Plan Identification:** 04-REMEDIATION
- **Verdict:** Remediation of 10 confirmed audit defects from the zero-trust merge-gate failure.
- **Objective:** Eliminate all P0, P1, P2, and P3 defects, enforce sound financial accounting invariants across transactions, accounts, and reports, ensure transactional concurrency safety, eliminate false-positive test patterns, harden database constraints, and leave the repository in a clean, committed, passing state.

---

## 2. Defect Traceability & Remediation Matrix

| Defect ID | Severity | Description | Target Requirement | Affected Files | Target Resolution | Verification Test |
|---|---|---|---|---|---|---|
| **P0-1** | Critical | Credit Card Net Worth Inversion | FIN-01, FIN-04 | `src/server/finance/calculations.ts`<br>`src/server/finance/transaction-service.ts`<br>`src/components/finance/account-card.tsx` | Implement coherent signed debt convention: CC balance represents liability debt. Expenses on CC increase debt (`+`), refunds/income decrease debt (`-`), payments (transfers to CC) reduce debt (`-`), cash advances (transfers from CC) increase debt (`+`). `calculateNetWorth` treats positive CC balance as liability and negative CC balance (surplus credit) as asset. | `account-balance.test.ts`<br>`finance-reports.integration.test.ts` |
| **P0-2** | Critical | Concurrent Transaction Mutation Corruption | FIN-01, FIN-02 | `src/server/finance/transaction-service.ts` | Enforce atomic transaction mutation: use `SELECT ... FOR UPDATE` row locking on transactions and deterministic `id ASC` locking on affected accounts in `deleteTransaction`, `updateTransaction`, and `createTransaction`. Ensure a transaction's balance effect can be reversed at most once. | `finance-ledger.integration.test.ts` (concurrent delete and update tests) |
| **P1-1** | Blocking | Account DTO/UI Balance Mismatch | FIN-01 | `src/types/index.ts`<br>`src/components/finance/account-card.tsx`<br>`src/components/finance/transaction-modal.tsx` | Standardize on canonical property `balance: string;` across types, frontend components, and tests. Eliminate all occurrences of `currentBalance`. | `account-balance.test.ts`<br>`tsc --noEmit` |
| **P1-2** | Blocking | Finance Goal Boundary Violation | FIN-03 | `src/server/finance/transaction-service.ts`<br>`src/server/finance/goal-linkage-service.ts` | Enforce server-side invariant in `createTransaction` and `updateTransaction`: linked goal must belong to current user AND have `goal.area === "finance"`. Reject non-finance goals with `InvariantViolationError` without mutating account balances. | `goal-linkage.integration.test.ts` |
| **P1-3** | Blocking | Uncommitted Phase 4 Implementation | REPO-INTEGRITY | Repository root | Verify all fixes, tests, typechecking, and production build, then commit cleanly with atomic, traceable commits following repo conventions. | `git status`<br>`git log` |
| **P2-1** | Significant | Category Type Mismatch | FIN-02 | `src/server/finance/transaction-service.ts` | Enforce that if `categoryId` is supplied, `category.categoryType === transaction.transactionType`. Reject mismatched categories in both create and update paths with `InvariantViolationError`. | `transaction-validation.test.ts`<br>`finance-ledger.integration.test.ts` |
| **P2-2** | Significant | Archived Accounts Must Be Immutable For Ledger Mutations | FIN-01, FIN-02 | `src/server/finance/transaction-service.ts` | Reject transactions and transfers where `sourceAccount.isArchived === true` or `destinationAccount.isArchived === true`. Protect both create and update operations. | `finance-ledger.integration.test.ts` |
| **P2-3** | Significant | Replace False-Positive `account-balance.test.ts` | TEST-INTEGRITY | `scripts/tests/phase-04/plan-01/account-balance.test.ts` | Remove local dummy functions (`calculateNetWorth`, `applyLedgerTransaction`, `reverseLedgerTransaction`). Import and execute production functions from `src/server/finance/calculations.ts` and verify real financial invariants. | `account-balance.test.ts` |
| **P3-1** | Minor | Database Account Delete Semantics | FIN-01 | `src/server/db/schema/finance.ts`<br>`src/server/db/migrations/0018_finance_restrict_account_delete.sql` | Change `finance_transactions` foreign keys referencing `finance_accounts` from `ON DELETE CASCADE` to `ON DELETE RESTRICT`. Add migration `0018` to alter existing constraints in PostgreSQL. | `finance-schema-isolation.integration.test.ts` |
| **P3-2** | Minor | `isReconciled` DTO/Schema Mismatch | SCHEMA-CONTRACT | `src/types/index.ts`<br>`src/app/finance/page.tsx` | Remove non-existent `isReconciled` property from `FinanceTransaction` interface in `src/types/index.ts` and remove from UI placeholder state. | `tsc --noEmit` |

---

## 3. Work Breakdown & Implementation Steps

### Task 1: Schema & DTO Contract Alignment (P1-1, P3-1, P3-2)
1. In `src/types/index.ts`:
   - Change `FinanceAccount.currentBalance` to `FinanceAccount.balance: string`.
   - Remove `FinanceTransaction.isReconciled: boolean`.
2. In `src/components/finance/account-card.tsx` & `transaction-modal.tsx`:
   - Update `account.currentBalance` to `account.balance`.
3. In `src/app/finance/page.tsx`:
   - Remove `isReconciled: false`.
4. In `src/server/db/schema/finance.ts`:
   - Update `finance_transactions_user_account_fk` to `.onDelete("restrict")`.
   - Update `finance_transactions_user_to_account_fk` to `.onDelete("restrict")`.
5. Create migration `0018_finance_restrict_account_delete.sql` and update migration journal. Run `npm run db:migrate`.

### Task 2: Core Calculation & Financial Sign Convention (P0-1)
1. In `src/server/finance/calculations.ts`:
   - Ensure `calculateNetWorth` implements:
     - For asset accounts: `balance >= 0 ? totalAssets += balance : totalLiabilities += Math.abs(balance)`.
     - For liability accounts (`credit_card`): `balance >= 0 ? totalLiabilities += balance : totalAssets += Math.abs(balance)`.
     - `netWorth = roundMoney(totalAssets - totalLiabilities)`.
2. In `src/server/finance/transaction-service.ts`:
   - Implement account-type-aware balance adjustments in `applyBalanceEffect` and `reverseBalanceEffect`:
     - Asset account: expense `-= amount`, income `+= amount`, transfer source `-= amount`, transfer dest `+= amount`.
     - Credit Card: expense `+= amount` (increases debt), income `-= amount` (decreases debt), transfer source `+= amount` (cash advance), transfer dest `-= amount` (debt payoff).
     - Reversals apply the exact inverse.
3. In `src/components/finance/account-card.tsx`:
   - Render credit card liability display consistently with positive debt balance.

### Task 3: Concurrency Safety & Mutex Locking (P0-2)
1. In `src/server/finance/transaction-service.ts`:
   - In `deleteTransaction`:
     - Execute `SELECT ... FOR UPDATE` or atomic `DELETE ... RETURNING *` on `financeTransactions` so that concurrent deletes cannot both observe and process the transaction.
     - If row was deleted or not found, immediately throw `NotFoundError` before reversing balance.
     - Lock affected accounts deterministically using `ORDER BY id ASC` with `FOR UPDATE`.
   - In `updateTransaction`:
     - Lock the transaction row with `SELECT ... FOR UPDATE`.
     - Deterministically lock affected accounts with `ORDER BY id ASC FOR UPDATE`.
   - In `createTransaction`:
     - Deterministically lock affected accounts with `ORDER BY id ASC FOR UPDATE`.

### Task 4: Domain Invariant Enforcement (P1-2, P2-1, P2-2)
1. In `src/server/finance/transaction-service.ts`:
   - Goal area check: `if (goal.area !== "finance") throw new InvariantViolationError(...)`. Apply to `createTransaction` and `updateTransaction`.
   - Category type check: `if (category.categoryType !== finalTransactionType) throw new InvariantViolationError(...)`. Apply to `createTransaction` and `updateTransaction`.
   - Archived account check: `if (sourceAccount.isArchived || destAccount?.isArchived) throw new InvariantViolationError(...)`. Apply to `createTransaction` and `updateTransaction`.
2. In `src/server/finance/goal-linkage-service.ts`:
   - Verify `goal.area === "finance"` in `syncFinancialGoalProgress`.

### Task 5: Testing & Verification Overhaul (P0-1, P0-2, P1-2, P2-1, P2-2, P2-3, P3-1)
1. Replace `scripts/tests/phase-04/plan-01/account-balance.test.ts`:
   - Remove fake local functions.
   - Import real functions from `@/server/finance/calculations`.
   - Add test matrix for credit cards: initial CC balance, expense, payment, refund, cash advance, net worth tracking.
2. Update `scripts/tests/phase-04/plan-01/finance-ledger.integration.test.ts`:
   - Add concurrent deletion test (`Promise.all`) verifying exactly one succeeds and exactly-once reversal.
   - Add category type mismatch tests (income on expense category and vice versa).
   - Add archived account rejection tests (expense, income, transfer from/to archived, update to archived).
3. Update `scripts/tests/phase-04/plan-02/goal-linkage.integration.test.ts`:
   - Add tests for finance goal (accepted), non-finance goals (health, career, relationships rejected), other user's goal (rejected).
4. Update `scripts/tests/phase-04/plan-02/finance-reports.integration.test.ts`:
   - Add credit card transactions and verify net worth and reports calculations.
5. Update `scripts/tests/phase-04/plan-01/finance-schema-isolation.integration.test.ts`:
   - Add test verifying PostgreSQL foreign key `RESTRICT` constraint prevents deleting accounts that have transactions.

### Task 6: Zero-Trust Verification & Git Commit (P1-3)
1. Run full verification suite:
   - `npm test`
   - `npm run test:integration`
   - `npx tsc --noEmit`
   - `npm run build`
2. Zero-trust code audit: check `rg currentBalance`, `rg isReconciled`, verify constraints, verify locking.
3. Clean git commit following repo conventions.
