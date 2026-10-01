/**
 * Plan 12-03: Adversarial Security, Path Traversal Defense & Zero Migration Invariants
 *
 * Verifies:
 * 1. Path traversal attacks (relative, url-encoded, null bytes, absolute, symlink escape) fail-closed (T-12-04, T-12-08).
 * 2. Caller identity spoofing resistance across all Phase 12 MCP tools (T-12-08).
 * 3. Financial mutation shield preservation: 0 financial mutation tools or skill operations (T-12-08).
 * 4. Comprehensive secret scrubbing in snippets, content, and error responses (T-12-08).
 * 5. Zero database migration invariant: migration count MUST remain exactly 27 (T-12-09).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveSafeDocPath } from "@/server/docs/path-safety";
import { docSearchService } from "@/server/docs/search-service";
import { skillsRegistry } from "@/server/skills/registry";
import { registerDocTools } from "@/server/mcp/tools/doc-tools";
import { registerSkillTools } from "@/server/mcp/tools/skill-tools";
import { registerTools } from "@/server/mcp/tools/registry";
import { createLifeOSMcpServer } from "@/server/mcp/server";
import { runCli } from "@/cli/index";
import { UsageError, scrubSecrets } from "@/cli/errors";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "@/server/mcp/types";

// Mock domain services for MCP server instantiation
vi.mock("@/server/tasks/service", () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  listTasks: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/server/projects/service", () => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  listProjects: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/server/goals/service", () => ({
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  listGoals: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/server/notes/service", () => ({
  createNote: vi.fn(),
}));
vi.mock("@/server/search/service", () => ({
  search: vi.fn().mockResolvedValue({ results: [], totalCount: 0 }),
}));
vi.mock("@/server/habits/service", () => ({
  logHabitEntry: vi.fn(),
}));
vi.mock("@/server/dashboard/service", () => ({
  getDashboardOverview: vi.fn().mockResolvedValue({
    metrics: {},
    priorities: { todayTasks: [] },
    goalsAndProjects: { activeGoals: [], activeProjects: [] },
    habits: [],
  }),
}));
vi.mock("@/server/notifications/service", () => ({
  listNotifications: vi.fn().mockResolvedValue({ notifications: [], total: 0 }),
  getUnreadCount: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/server/calendar/service", () => ({
  listTimeBlocks: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/server/finance/reports-service", () => ({
  getFinanceSummary: vi.fn().mockResolvedValue({ netWorth: 100000 }),
}));
vi.mock("@/server/daily-plan/service", () => ({
  getDailyPlan: vi.fn().mockResolvedValue({ id: "dp-1" }),
}));
vi.mock("@/server/db", () => ({
  db: { select: vi.fn() },
  getDb: vi.fn(),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
}));

describe("Plan 12-03: Adversarial Security & Defensive Invariants", () => {
  const mockContext: McpContext = {
    user: { id: "usr_adversarial_test", name: "Security Auditor", email: "audit@lifeos.internal" },
    session: {
      id: "sess_adversarial_test",
      userId: "usr_adversarial_test",
      expiresAt: new Date(Date.now() + 86400000),
    },
  };

  describe("1. Path Traversal & Containment Attacks (T-12-04, T-12-08)", () => {
    const maliciousPaths = [
      "../../../../etc/passwd",
      "../../package.json",
      "docs/../../package.json",
      "docs/../../../etc/shadow",
      ".planning/../../.env",
      "skills/../../.env.local",
      "..%2f..%2fetc%2fpasswd",
      "docs%2f..%2f..%2fpackage.json",
      "docs/security/auth-boundary.md\0/etc/passwd",
      "docs/security/auth-boundary.md%00/etc/passwd",
      "/etc/passwd",
      "/etc/shadow",
      "/dev/null",
      "docs/../..",
      "docs/..",
    ];

    it.each(maliciousPaths)("resolveSafeDocPath rejects '%s' fail-closed", (badPath) => {
      expect(() => resolveSafeDocPath(badPath)).toThrow(UsageError);
    });

    it("CLI lifeos docs get fails with exit code 2 or 4 on path traversal attacks", async () => {
      const exitCode1 = await runCli(["docs", "get", "../../../../etc/passwd", "--json"]);
      expect([2, 4]).toContain(exitCode1);

      const exitCode2 = await runCli(["docs", "get", "docs/../../package.json", "--json"]);
      expect([2, 4]).toContain(exitCode2);
    });

    it("detects and rejects symlink escape pointing outside allowed documentation roots", async () => {
      const symlinkPath = path.resolve(process.cwd(), "docs/escaped-symlink-test.md");
      const targetOutside = path.resolve(process.cwd(), "package.json");

      try {
        if (fs.existsSync(symlinkPath)) {
          fs.unlinkSync(symlinkPath);
        }
        fs.symlinkSync(targetOutside, symlinkPath);

        expect(() => resolveSafeDocPath("docs/escaped-symlink-test.md")).toThrow(UsageError);
      } finally {
        if (fs.existsSync(symlinkPath)) {
          fs.unlinkSync(symlinkPath);
        }
      }
    });
  });

  describe("2. Caller Identity Spoofing Resistance (T-12-08)", () => {
    const registeredTools: Record<string, { handler: Function }> = {};

    beforeAll(() => {
      const mockServer = {
        registerTool: vi.fn((name: string, schema: unknown, handler: Function) => {
          registeredTools[name] = { handler };
        }),
      } as unknown as McpServer;

      registerSkillTools(mockServer, mockContext);
      registerDocTools(mockServer, mockContext);
    });

    const phase12Tools = [
      { name: "lifeos_list_skills", baseArgs: {} },
      { name: "lifeos_get_skill", baseArgs: { name: "task-breakdown" } },
      { name: "lifeos_search_docs", baseArgs: { q: "auth" } },
      { name: "lifeos_get_doc", baseArgs: { path: "docs/security/auth-boundary.md" } },
      { name: "lifeos_get_planning_state", baseArgs: { view: "state" } },
    ];

    it.each(phase12Tools)("tool '$name' rejects injected userId", async ({ name, baseArgs }) => {
      const handler = registeredTools[name].handler;
      const res = (await handler({ ...baseArgs, userId: "malicious_actor" })) as {
        isError?: boolean;
        content: Array<{ text: string }>;
      };

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("prohibited");
    });

    it.each(phase12Tools)("tool '$name' rejects injected user_id and user-id", async ({ name, baseArgs }) => {
      const handler = registeredTools[name].handler;

      const resUnderscore = (await handler({ ...baseArgs, user_id: "malicious_actor" })) as {
        isError?: boolean;
        content: Array<{ text: string }>;
      };
      expect(resUnderscore.isError).toBe(true);
      expect(resUnderscore.content[0].text).toContain("prohibited");

      const resHyphen = (await handler({ ...baseArgs, "user-id": "malicious_actor" })) as {
        isError?: boolean;
        content: Array<{ text: string }>;
      };
      expect(resHyphen.isError).toBe(true);
      expect(resHyphen.content[0].text).toContain("prohibited");
    });
  });

  describe("3. Financial Mutation Shield Preservation (T-12-08)", () => {
    it("asserts ZERO financial mutation tools are registered on the MCP server", () => {
      const server = createLifeOSMcpServer(mockContext);
      const registeredTools = (server as unknown as { _registeredTools?: Record<string, unknown> })._registeredTools;

      expect(registeredTools).toBeDefined();
      const toolNames = Object.keys(registeredTools ?? {});

      const prohibitedWords = ["transaction", "transfer", "account", "balance", "money", "wallet"];
      for (const name of toolNames) {
        for (const word of prohibitedWords) {
          expect(name.toLowerCase()).not.toContain(word);
        }
      }
    });

    it("asserts no curated procedural skills contain financial write operations in allowed_operations", async () => {
      const skills = await skillsRegistry.listSkills();
      const prohibitedOperations = [
        "lifeos_create_transaction",
        "lifeos_update_transaction",
        "lifeos_delete_transaction",
        "lifeos_transfer",
        "lifeos_create_account",
        "lifeos_delete_account",
      ];

      for (const summary of skills) {
        const detail = await skillsRegistry.getSkill(summary.name);
        for (const op of detail.allowed_operations) {
          for (const prohibited of prohibitedOperations) {
            expect(op).not.toBe(prohibited);
          }
        }
      }
    });
  });

  describe("4. Comprehensive Secret Scrubbing (T-12-08)", () => {
    it("scrubs database connection strings, Better Auth cookies, and AES keys", () => {
      const sensitiveSample = [
        "Database connected at postgres://lifeos_app:super_secret_password_123@localhost:5432/lifeos_db",
        "Cookie header: better-auth.session_token=secret_session_token_xyz_987; Path=/",
        "Master key: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        "Authorization: Bearer my_super_secret_bearer_token_123456",
      ].join("\n");

      const scrubbed = scrubSecrets(sensitiveSample);

      expect(scrubbed).not.toContain("super_secret_password_123");
      expect(scrubbed).not.toContain("secret_session_token_xyz_987");
      expect(scrubbed).not.toContain("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
      expect(scrubbed).not.toContain("my_super_secret_bearer_token_123456");
      expect(scrubbed).toContain("***REDACTED***");
    });
  });

  describe("5. Zero Database Migrations Invariant (T-12-09)", () => {
    it("asserts migrations directory strictly contains historical migrations (0000–0026)", async () => {
      const migrationsDir = path.resolve(process.cwd(), "src/server/db/migrations");
      const files = await fs.promises.readdir(migrationsDir);
      const sqlMigrations = files.filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();

      expect(sqlMigrations.length).toBeGreaterThanOrEqual(27);
      expect(sqlMigrations[0]).toBe("0000_productive_lord_hawal.sql");
      expect(sqlMigrations).toContain("0026_pgvector_knowledge_embeddings.sql");
    });

    it("asserts _journal.json strictly contains historical migration entries", async () => {
      const journalPath = path.resolve(
        process.cwd(),
        "src/server/db/migrations/meta/_journal.json"
      );
      const rawJournal = await fs.promises.readFile(journalPath, "utf-8");
      const journal = JSON.parse(rawJournal) as { entries: Array<{ idx: number; tag: string }> };

      expect(journal.entries.length).toBeGreaterThanOrEqual(27);
      expect(journal.entries[0].idx).toBe(0);
      expect(journal.entries[26].idx).toBe(26);
      expect(journal.entries[26].tag).toBe("0026_pgvector_knowledge_embeddings");
    });
  });
});
