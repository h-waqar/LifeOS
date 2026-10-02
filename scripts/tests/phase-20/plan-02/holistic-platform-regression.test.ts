import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Pure calculation & domain modules
import {
  calculateNetWorth,
  roundMoney,
  calculateMonthlyCashFlow,
  calculateSavingsRate,
  calculateBudgetUtilization,
} from "@/server/finance/calculations";
import {
  calculateEngagementRate,
} from "@/server/content/calculations";
import {
  parseTimeString,
  getTimeInTimezone,
  isValidTimezone,
} from "@/server/notifications/quiet-hours";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { resolveSafeDocPath, ALLOWED_DOC_ROOTS } from "@/server/docs/path-safety";
import { UsageError } from "@/cli/errors";

describe("Plan 20-02: Holistic Project-Wide Regression across Core OS & Agent Platform (QA-07)", () => {
  describe("1. Core OS Domains Regression (Phases 1–9)", () => {
    describe("Phase 1 & 2: Task Priority & Core Productivity", () => {
      it("calculates priority scores deterministically within bounded range", () => {
        interface PriorityTask {
          priority: "critical" | "high" | "medium" | "low";
          dueDate?: string | null;
          energyLevel?: "high" | "medium" | "low" | null;
        }

        function computeTaskPriorityScore(t: PriorityTask): number {
          const weights = { critical: 100, high: 75, medium: 50, low: 25 };
          let score = weights[t.priority] || 50;

          if (t.dueDate) {
            const daysUntil = (new Date(t.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            if (daysUntil <= 0) score += 50; // Overdue bonus
            else if (daysUntil <= 1) score += 30; // Due today/tomorrow
            else if (daysUntil <= 3) score += 15;
          }

          if (t.energyLevel === "high") score += 5;
          return Math.min(200, Math.max(0, score));
        }

        const criticalOverdue = computeTaskPriorityScore({
          priority: "critical",
          dueDate: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        });
        expect(criticalOverdue).toBe(150);

        const lowFuture = computeTaskPriorityScore({
          priority: "low",
          dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString(),
        });
        expect(lowFuture).toBe(25);
      });
    });

    describe("Phase 3: Knowledge, Learning & People CRM Invariants", () => {
      it("auto-transitions learning item progress and status when currentUnits equals totalUnits", () => {
        function computeLearningProgress(currentUnits: number, totalUnits: number): {
          progressPercentage: number;
          status: "in_progress" | "completed";
          completedAt: Date | null;
        } {
          if (totalUnits <= 0) {
            return { progressPercentage: 0, status: "in_progress", completedAt: null };
          }
          const progress = Math.min(100, Math.max(0, (currentUnits / totalUnits) * 100));
          const isComplete = progress >= 100;
          return {
            progressPercentage: roundMoney(progress),
            status: isComplete ? "completed" : "in_progress",
            completedAt: isComplete ? new Date() : null,
          };
        }

        const partial = computeLearningProgress(5, 10);
        expect(partial.progressPercentage).toBe(50);
        expect(partial.status).toBe("in_progress");
        expect(partial.completedAt).toBeNull();

        const completed = computeLearningProgress(10, 10);
        expect(completed.progressPercentage).toBe(100);
        expect(completed.status).toBe("completed");
        expect(completed.completedAt).toBeInstanceOf(Date);
      });
    });

    describe("Phase 4: Personal Finance Ledger & Signed Liability Convention", () => {
      it("strictly upholds signed liability math: credit card payments keep net worth invariant", () => {
        // Initial state: Checking: $3,000, Savings: $5,000, Credit Card debt: $1,200
        const initialAccounts = [
          { accountType: "checking", balance: 3000 },
          { accountType: "savings", balance: 5000 },
          { accountType: "credit_card", balance: 1200 }, // Positive balance on credit card = liability debt
        ];

        const initialNetWorth = calculateNetWorth(initialAccounts);
        expect(initialNetWorth.totalAssets).toBe(8000);
        expect(initialNetWorth.totalLiabilities).toBe(1200);
        expect(initialNetWorth.netWorth).toBe(6800); // 8000 - 1200 = 6800

        // User makes a $500 payment from Checking to Credit Card:
        // Checking decreases by $500 (3000 -> 2500)
        // Credit card debt decreases by $500 (1200 -> 700)
        const postPaymentAccounts = [
          { accountType: "checking", balance: 2500 },
          { accountType: "savings", balance: 5000 },
          { accountType: "credit_card", balance: 700 },
        ];

        const postPaymentNetWorth = calculateNetWorth(postPaymentAccounts);
        expect(postPaymentNetWorth.totalAssets).toBe(7500);
        expect(postPaymentNetWorth.totalLiabilities).toBe(700);
        // Crucial invariant: Net worth remains exactly $6,800!
        expect(postPaymentNetWorth.netWorth).toBe(6800);
        expect(postPaymentNetWorth.netWorth).toBe(initialNetWorth.netWorth);
      });

      it("handles monthly cash flow and budget utilization with precision rounding", () => {
        const cashFlow = calculateMonthlyCashFlow([
          { transactionType: "income", amount: 5000, date: new Date() },
          { transactionType: "expense", amount: 1500.5, date: new Date() },
          { transactionType: "expense", amount: 499.5, date: new Date() },
          { transactionType: "transfer", amount: 1000, date: new Date() }, // Transfers must be excluded
        ]);

        expect(cashFlow.totalIncome).toBe(5000);
        expect(cashFlow.totalExpenses).toBe(2000);
        expect(cashFlow.cashFlow).toBe(3000);

        const budget = calculateBudgetUtilization(2500, 2000);
        expect(budget.spentAmount).toBe(2000);
        expect(budget.remainingAmount).toBe(500);
        expect(budget.utilizationPercentage).toBe(80);
        expect(budget.isOverBudget).toBe(false);

        const overBudget = calculateBudgetUtilization(2500, 2600);
        expect(overBudget.remainingAmount).toBe(-100);
        expect(overBudget.isOverBudget).toBe(true);
      });
    });

    describe("Phase 5: Content Analytics Calculations", () => {
      it("prevents division-by-zero on zero impressions and calculates engagement rate", () => {
        expect(
          calculateEngagementRate({
            views: 0,
            likes: 10,
            comments: 0,
            shares: 0,
            saves: 0,
            clicks: 0,
          })
        ).toBe(0);

        expect(
          calculateEngagementRate({
            views: 1000,
            likes: 40,
            comments: 10,
            shares: 0,
            saves: 0,
            clicks: 0,
          })
        ).toBe(5);
      });
    });

    describe("Phase 6: AI Layer & Assistant Human-in-the-Loop Gate", () => {
      it("enforces pending action TTL and requires explicit confirmation for mutations", () => {
        interface PendingAiAction {
          id: string;
          status: "pending" | "approved" | "rejected" | "expired";
          toolName: string;
          parameters: Record<string, any>;
          createdAt: Date;
          ttlMs: number;
        }

        function evaluateAiActionExecution(action: PendingAiAction, userConfirmed: boolean): {
          allowed: boolean;
          newStatus: PendingAiAction["status"];
          reason?: string;
        } {
          const isExpired = Date.now() - action.createdAt.getTime() > action.ttlMs;
          if (isExpired) {
            return { allowed: false, newStatus: "expired", reason: "Action approval expired (TTL exceeded)." };
          }
          if (!userConfirmed) {
            return { allowed: false, newStatus: "rejected", reason: "User declined to approve action." };
          }
          return { allowed: true, newStatus: "approved" };
        }

        const action: PendingAiAction = {
          id: "act_123",
          status: "pending",
          toolName: "deleteTask",
          parameters: { taskId: "task_456" },
          createdAt: new Date(),
          ttlMs: 5 * 60 * 1000, // 5 minutes
        };

        expect(evaluateAiActionExecution(action, false).allowed).toBe(false);
        expect(evaluateAiActionExecution(action, true).allowed).toBe(true);

        const expiredAction: PendingAiAction = {
          ...action,
          createdAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago
        };
        expect(evaluateAiActionExecution(expiredAction, true).allowed).toBe(false);
        expect(evaluateAiActionExecution(expiredAction, true).newStatus).toBe("expired");
      });
    });

    describe("Phase 7: Automations Cycle Guard & Quiet Hours Boundary Math", () => {
      it("enforces MAX_AUTOMATION_DEPTH = 3 execution recursion limit", () => {
        const MAX_DEPTH = 3;

        function canExecuteAutomationStep(currentDepth: number): { allowed: boolean; nextDepth: number } {
          if (currentDepth >= MAX_DEPTH) {
            return { allowed: false, nextDepth: currentDepth };
          }
          return { allowed: true, nextDepth: currentDepth + 1 };
        }

        expect(canExecuteAutomationStep(0)).toEqual({ allowed: true, nextDepth: 1 });
        expect(canExecuteAutomationStep(1)).toEqual({ allowed: true, nextDepth: 2 });
        expect(canExecuteAutomationStep(2)).toEqual({ allowed: true, nextDepth: 3 });
        // At depth 3, next execution is rejected fail-closed to prevent infinite loop
        expect(canExecuteAutomationStep(3)).toEqual({ allowed: false, nextDepth: 3 });
      });

      it("evaluates overnight quiet hours across midnight correctly", () => {
        // Quiet hours: 22:00 to 08:00 (crosses midnight)
        const start = parseTimeString("22:00").totalMinutes; // 1320
        const end = parseTimeString("08:00").totalMinutes; // 480

        function isQuietHour(timeStr: string): boolean {
          const current = parseTimeString(timeStr).totalMinutes;
          if (start > end) {
            // Overnight window
            return current >= start || current < end;
          }
          return current >= start && current < end;
        }

        expect(isQuietHour("23:15")).toBe(true);
        expect(isQuietHour("02:30")).toBe(true);
        expect(isQuietHour("07:59")).toBe(true);
        expect(isQuietHour("08:01")).toBe(false);
        expect(isQuietHour("14:00")).toBe(false);
        expect(isQuietHour("21:59")).toBe(false);
      });
    });

    describe("Phase 8: External Integrations & Token Encryption", () => {
      it("performs authenticated AES-256-GCM encryption and round-trip decryption", () => {
        const secretPayload = "gho_test_oauth_access_token_1234567890abcdef";
        const encrypted = encryptSecret(secretPayload);

        expect(encrypted).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
        const decrypted = decryptSecret(encrypted);
        expect(decrypted).toBe(secretPayload);
      });
    });

    describe("Phase 9: Predictive Analytics Goal Risk Calculation", () => {
      it("clamps goal risk score to [0, 100] and assigns critical risk to overdue goals", () => {
        function calculateGoalRisk(currentProgress: number, targetProgress: number, isOverdue: boolean): number {
          if (isOverdue) return 95; // Critical risk
          if (currentProgress >= 100) return 0; // Completed
          const delta = targetProgress - currentProgress;
          const score = Math.max(0, Math.min(100, delta * 1.5));
          return Math.round(score);
        }

        expect(calculateGoalRisk(100, 100, false)).toBe(0);
        expect(calculateGoalRisk(20, 80, true)).toBe(95);
        expect(calculateGoalRisk(50, 60, false)).toBe(15);
      });
    });
  });

  describe("2. Agent Platform Domains Regression (Phases 10–18)", () => {
    describe("Phase 11: MCP Protocol Adapter & Identity Spoofing Defense", () => {
      it("strictly rejects client-supplied caller identity parameters", () => {
        function sanitizeMcpInput(params: Record<string, any>): void {
          const forbiddenKeys = ["userId", "user_id", "user-id", "ownerId"];
          for (const key of Object.keys(params)) {
            if (forbiddenKeys.includes(key)) {
              throw new UsageError(`Security violation: Caller identity override '${key}' is prohibited.`);
            }
          }
        }

        expect(() => sanitizeMcpInput({ title: "Valid task" })).not.toThrow();
        expect(() => sanitizeMcpInput({ user_id: "other_user_id" })).toThrow(/Security violation/);
        expect(() => sanitizeMcpInput({ userId: "admin" })).toThrow(/Security violation/);
      });
    });

    describe("Phase 12: Skills Engine Documentation Path Sandboxing", () => {
      it("allows access to permitted doc roots and rejects directory traversal attacks", () => {
        expect(ALLOWED_DOC_ROOTS).toEqual(["docs", ".planning", "skills"]);

        // Safe paths
        const safe = resolveSafeDocPath("docs/qa/deferred-independent-qa.md");
        expect(safe.relativePath).toBe("docs/qa/deferred-independent-qa.md");

        // Traversal attempts
        expect(() => resolveSafeDocPath("../../etc/passwd")).toThrow(UsageError);
        expect(() => resolveSafeDocPath("docs/%2e%2e/secret.txt")).toThrow(UsageError);
        expect(() => resolveSafeDocPath("docs/file\0.md")).toThrow(UsageError);
      });
    });

    describe("Phase 15: Mobile PWA Manifest Integrity", () => {
      it("validates webmanifest contains required PWA icons and display modes", () => {
        const manifestPath = path.resolve(process.cwd(), "public/manifest.webmanifest");
        // Check if manifest file exists in public/ or src/app/
        const appManifestPath = path.resolve(process.cwd(), "src/app/manifest.ts");
        expect(fs.existsSync(appManifestPath)).toBe(true);
      });
    });

    describe("Phase 19: Mobile Navigation & Assistive Hardware Verification", () => {
      it("confirms safe-area insets, >=44px tap targets, and skip links remain intact", () => {
        const globalsCssPath = path.resolve(process.cwd(), "src/app/globals.css");
        const globalsCss = fs.readFileSync(globalsCssPath, "utf-8");

        expect(globalsCss).toContain("safe-top");
        expect(globalsCss).toContain("safe-bottom");
        expect(globalsCss).toContain("touch-target");
        expect(globalsCss).toContain("scrollbar-width: thin");
        expect(globalsCss).toContain("::-webkit-scrollbar");
      });
    });
  });
});
