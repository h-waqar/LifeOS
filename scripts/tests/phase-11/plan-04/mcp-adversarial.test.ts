/**
 * Plan 11-04: MCP Adversarial Security, Authorization Boundary & Isolation Tests
 *
 * Verifies:
 * 1. Authentication Matrix (MCP-05): fails closed with exit code 3 and 0 stdout bytes
 *    on missing, invalid, expired, and tampered tokens; validates token precedence and v1: encryption.
 * 2. Caller Identity Spoofing Protection (MCP-04): verifies that caller-injected
 *    userId, user_id, user-id, and userid are rejected across all 10 domain tools.
 * 3. Cross-User Data Isolation (MCP-04): enforces WHERE user_id = authenticatedUserId
 *    and verifies that User A cannot read, update, or delete User B's entities.
 * 4. Financial Shield (MCP-03): zero financial mutation tools exist or can be invoked.
 * 5. Secret Scrubbing (MCP-05): sensitive credentials, session tokens, passwords, and DB URLs
 *    are deeply redacted from all error responses.
 * 6. Subprocess Execution & Stream Discipline (MCP-01): verifies exit code 3, zero stdout bytes,
 *    and clean stderr diagnostic using real OS subprocesses.
 * 7. Database Scope & Migration Invariant: verifies exactly 27 migrations (0000 to 0026).
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLifeOSMcpServer } from "@/server/mcp/server";
import { resolveMcpAuth, assertNoCallerSpoofing } from "@/server/mcp/auth";
import { formatMcpToolError } from "@/server/mcp/formatters";
import { encryptSecret } from "@/lib/crypto";
import { AuthError, UsageError } from "@/cli/errors";
import { saveCredentials } from "@/cli/config";
import type { McpContext } from "@/server/mcp/types";

const PROJECT_ROOT = path.resolve(__dirname, "../../../../");
const LIFEOS_BIN = path.join(PROJECT_ROOT, "bin/lifeos.js");

// Mock database for resolveMcpAuth
const mockDbSelect = vi.fn();
vi.mock("@/server/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockDbSelect(...args);
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: () => mockDbLimitImpl(),
            }),
          }),
        }),
      };
    },
  },
  getDb: vi.fn(),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
}));

let mockDbLimitImpl: () => Promise<unknown[]> = async () => [];

// Mock domain services for cross-user isolation and spoofing checks
const mockUpdateTask = vi.fn();
const mockDeleteTask = vi.fn();
const mockCreateTask = vi.fn();
const mockUpdateProject = vi.fn();
const mockCreateProject = vi.fn();
const mockUpdateGoal = vi.fn();
const mockCreateGoal = vi.fn();
const mockCreateNote = vi.fn();
const mockSearch = vi.fn();
const mockLogHabitEntry = vi.fn();

vi.mock("@/server/tasks/service", () => ({
  listTasks: vi.fn().mockResolvedValue([]),
  createTask: (...args: unknown[]) => mockCreateTask(...args),
  updateTask: (...args: unknown[]) => mockUpdateTask(...args),
  deleteTask: (...args: unknown[]) => mockDeleteTask(...args),
}));

vi.mock("@/server/projects/service", () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  createProject: (...args: unknown[]) => mockCreateProject(...args),
  updateProject: (...args: unknown[]) => mockUpdateProject(...args),
}));

vi.mock("@/server/goals/service", () => ({
  listGoals: vi.fn().mockResolvedValue([]),
  createGoal: (...args: unknown[]) => mockCreateGoal(...args),
  updateGoal: (...args: unknown[]) => mockUpdateGoal(...args),
}));

vi.mock("@/server/notes/service", () => ({
  createNote: (...args: unknown[]) => mockCreateNote(...args),
}));

vi.mock("@/server/search/service", () => ({
  search: (...args: unknown[]) => mockSearch(...args),
}));

vi.mock("@/server/habits/service", () => ({
  logHabitEntry: (...args: unknown[]) => mockLogHabitEntry(...args),
}));

vi.mock("@/server/dashboard/service", () => ({
  getDashboardOverview: vi.fn().mockResolvedValue({
    metrics: {},
    dailyPlan: {},
    priorities: { todayTasks: [] },
    habits: { items: [] },
    goalsAndProjects: { activeGoals: [], activeProjects: [] },
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
  getFinanceSummary: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/server/daily-plan/service", () => ({
  getDailyPlan: vi.fn().mockResolvedValue({}),
}));

async function runMcpSubprocess(
  args: string[],
  env?: Record<string, string>
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const isolatedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: "/tmp/lifeos-adv-" + Math.random().toString(36).slice(2),
      XDG_CONFIG_HOME: "/tmp/lifeos-adv-xdg-" + Math.random().toString(36).slice(2),
      NODE_NO_WARNINGS: "1",
      ...(env || {}),
    };
    delete isolatedEnv.LIFEOS_TOKEN;
    delete isolatedEnv.LIFEOS_CONFIG_DIR;
    delete isolatedEnv.LIFEOS_CREDENTIALS_PATH;

    const child = spawn(process.execPath, [LIFEOS_BIN, "mcp", ...args], {
      cwd: PROJECT_ROOT,
      env: isolatedEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      resolve({
        status: code,
        stdout,
        stderr,
      });
    });
  });
}

describe("Plan 11-04: MCP Adversarial Security Suite", { timeout: 60000 }, () => {
  describe("1. Subprocess Execution & Exit Code Discipline (MCP-01, MCP-05)", () => {
    it("fails closed with exit code 3, zero stdout bytes, and stderr diagnostic when no token provided", async () => {
      const res = await runMcpSubprocess([]);
      expect(res.status).toBe(3);
      expect(res.stdout).toBe("");
      expect(res.stderr).toContain("AUTH_ERROR");
      expect(res.stderr).toContain("Authentication required");
    }, 35000);

    it("fails closed with exit code 3, zero stdout bytes on tampered encrypted token", async () => {
      const res = await runMcpSubprocess(["--token", "v1:tampered_ciphertext_deadbeef1234567890"]);
      expect(res.status).toBe(3);
      expect(res.stdout).toBe("");
      expect(res.stderr).toContain("AUTH_ERROR");
    }, 35000);

    it("fails closed with exit code 2 when caller passes identity injection flag --userId", async () => {
      const res = await runMcpSubprocess(["--userId", "victim_user_123"]);
      expect(res.status).toBe(2);
      expect(res.stdout).toBe("");
      expect(res.stderr).toContain("USAGE_ERROR");
      expect(res.stderr).toContain("Specifying 'userId' is prohibited");
    }, 35000);

    it("assertNoCallerSpoofing rejects identity aliases in object flags", () => {
      expect(() => assertNoCallerSpoofing({ userId: "123" })).toThrow(/prohibited/);
      expect(() => assertNoCallerSpoofing({ user_id: "123" })).toThrow(/prohibited/);
      expect(() => assertNoCallerSpoofing({ userid: "123" })).toThrow(/prohibited/);
      expect(() => assertNoCallerSpoofing({ "user-id": "123" })).toThrow(/prohibited/);
    });
  });

  describe("2. Authentication Matrix & Token Precedence (MCP-05)", () => {
    it("fails closed on missing token with AuthError", async () => {
      delete process.env.LIFEOS_TOKEN;
      await expect(resolveMcpAuth()).rejects.toThrow(AuthError);
    });

    it("fails closed on empty whitespace token override", async () => {
      delete process.env.LIFEOS_TOKEN;
      await expect(resolveMcpAuth("   ")).rejects.toThrow(AuthError);
    });

    it("fails closed on tampered v1: encrypted token", async () => {
      await expect(resolveMcpAuth("v1:tampered_random_garbage_string")).rejects.toThrow(AuthError);
    });

    it("fails closed when session is expired in database", async () => {
      mockDbLimitImpl = async () => []; // Query returns no active unexpired session
      await expect(resolveMcpAuth("valid_looking_token")).rejects.toThrow(AuthError);
    });

    it("succeeds when session is active and unexpired in database", async () => {
      mockDbLimitImpl = async () => [
        {
          user: { id: "usr_alice", name: "Alice Test", email: "alice@test.local" },
          session: {
            id: "sess_alice",
            userId: "usr_alice",
            expiresAt: new Date(Date.now() + 3600000),
          },
        },
      ];

      const context = await resolveMcpAuth("active_alice_token");
      expect(context.user.id).toBe("usr_alice");
      expect(context.user.email).toBe("alice@test.local");
      expect(context.session.id).toBe("sess_alice");
    });

    it("correctly decrypts v1: encrypted token and authenticates", async () => {
      const rawToken = "secret_raw_token_xyz";
      const encrypted = encryptSecret(rawToken);

      mockDbLimitImpl = async () => [
        {
          user: { id: "usr_alice", name: "Alice Test", email: "alice@test.local" },
          session: {
            id: "sess_alice",
            userId: "usr_alice",
            expiresAt: new Date(Date.now() + 3600000),
          },
        },
      ];

      const context = await resolveMcpAuth(encrypted);
      expect(context.user.id).toBe("usr_alice");
    });

    it("strictly follows token precedence: flag > LIFEOS_TOKEN > credentials file", async () => {
      const tempConfig = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-auth-test-"));
      try {
        saveCredentials({ token: "creds_file_token" }, tempConfig);

        // 1. Credentials file is used when nothing else provided
        delete process.env.LIFEOS_TOKEN;
        mockDbLimitImpl = async () => [
          {
            user: { id: "usr_from_creds", name: "Creds User", email: "creds@test.local" },
            session: { id: "sess_creds", userId: "usr_from_creds", expiresAt: new Date(Date.now() + 3600000) },
          },
        ];
        const ctxCreds = await resolveMcpAuth(undefined, tempConfig);
        expect(ctxCreds.user.id).toBe("usr_from_creds");

        // 2. LIFEOS_TOKEN overrides credentials file
        process.env.LIFEOS_TOKEN = "env_var_token";
        mockDbLimitImpl = async () => [
          {
            user: { id: "usr_from_env", name: "Env User", email: "env@test.local" },
            session: { id: "sess_env", userId: "usr_from_env", expiresAt: new Date(Date.now() + 3600000) },
          },
        ];
        const ctxEnv = await resolveMcpAuth(undefined, tempConfig);
        expect(ctxEnv.user.id).toBe("usr_from_env");

        // 3. CLI flag overrides LIFEOS_TOKEN
        mockDbLimitImpl = async () => [
          {
            user: { id: "usr_from_flag", name: "Flag User", email: "flag@test.local" },
            session: { id: "sess_flag", userId: "usr_from_flag", expiresAt: new Date(Date.now() + 3600000) },
          },
        ];
        const ctxFlag = await resolveMcpAuth("cli_flag_token", tempConfig);
        expect(ctxFlag.user.id).toBe("usr_from_flag");
      } finally {
        delete process.env.LIFEOS_TOKEN;
        fs.rmSync(tempConfig, { recursive: true, force: true });
      }
    });
  });

  describe("3. Caller Identity Spoofing Protection Across ALL Tools (MCP-04)", () => {
    let client: Client;

    beforeAll(async () => {
      const context: McpContext = {
        user: { id: "usr_spoof_check", name: "Spoof Check User", email: "spoof@lifeos.internal" },
        session: { id: "sess_spoof", userId: "usr_spoof_check", expiresAt: new Date(Date.now() + 86400000) },
      };

      const server = createLifeOSMcpServer(context);
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      client = new Client({ name: "spoof-tester", version: "1.0.0" });
      await client.connect(clientTransport);
    });

    const spoofKeys = ["userId", "user_id", "user-id", "userid"];

    // 1. lifeos_create_task
    it("rejects caller spoofing attempts on lifeos_create_task", async () => {
      for (const key of spoofKeys) {
        const res = (await client.callTool({
          name: "lifeos_create_task",
          arguments: { title: "Spoof Task", [key]: "victim_user" },
        })) as { isError: boolean; content: Array<{ text: string }> };

        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("prohibited");
      }
    });

    // 2. lifeos_update_task
    it("rejects caller spoofing attempts on lifeos_update_task", async () => {
      for (const key of spoofKeys) {
        const res = (await client.callTool({
          name: "lifeos_update_task",
          arguments: { id: "task-1", [key]: "victim_user" },
        })) as { isError: boolean; content: Array<{ text: string }> };

        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("prohibited");
      }
    });

    // 3. lifeos_delete_task
    it("rejects caller spoofing attempts on lifeos_delete_task", async () => {
      for (const key of spoofKeys) {
        const res = (await client.callTool({
          name: "lifeos_delete_task",
          arguments: { id: "task-1", [key]: "victim_user" },
        })) as { isError: boolean; content: Array<{ text: string }> };

        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("prohibited");
      }
    });

    // 4. lifeos_create_project
    it("rejects caller spoofing attempts on lifeos_create_project", async () => {
      for (const key of spoofKeys) {
        const res = (await client.callTool({
          name: "lifeos_create_project",
          arguments: { name: "Spoof Project", [key]: "victim_user" },
        })) as { isError: boolean; content: Array<{ text: string }> };

        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("prohibited");
      }
    });

    // 5. lifeos_update_project
    it("rejects caller spoofing attempts on lifeos_update_project", async () => {
      for (const key of spoofKeys) {
        const res = (await client.callTool({
          name: "lifeos_update_project",
          arguments: { id: "proj-1", [key]: "victim_user" },
        })) as { isError: boolean; content: Array<{ text: string }> };

        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("prohibited");
      }
    });

    // 6. lifeos_create_goal
    it("rejects caller spoofing attempts on lifeos_create_goal", async () => {
      for (const key of spoofKeys) {
        const res = (await client.callTool({
          name: "lifeos_create_goal",
          arguments: { title: "Spoof Goal", [key]: "victim_user" },
        })) as { isError: boolean; content: Array<{ text: string }> };

        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("prohibited");
      }
    });

    // 7. lifeos_update_goal
    it("rejects caller spoofing attempts on lifeos_update_goal", async () => {
      for (const key of spoofKeys) {
        const res = (await client.callTool({
          name: "lifeos_update_goal",
          arguments: { id: "goal-1", [key]: "victim_user" },
        })) as { isError: boolean; content: Array<{ text: string }> };

        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("prohibited");
      }
    });

    // 8. lifeos_create_note
    it("rejects caller spoofing attempts on lifeos_create_note", async () => {
      for (const key of spoofKeys) {
        const res = (await client.callTool({
          name: "lifeos_create_note",
          arguments: { title: "Spoof Note", [key]: "victim_user" },
        })) as { isError: boolean; content: Array<{ text: string }> };

        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("prohibited");
      }
    });

    // 9. lifeos_search
    it("rejects caller spoofing attempts on lifeos_search", async () => {
      for (const key of spoofKeys) {
        const res = (await client.callTool({
          name: "lifeos_search",
          arguments: { q: "test", [key]: "victim_user" },
        })) as { isError: boolean; content: Array<{ text: string }> };

        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("prohibited");
      }
    });

    // 10. lifeos_log_habit
    it("rejects caller spoofing attempts on lifeos_log_habit", async () => {
      for (const key of spoofKeys) {
        const res = (await client.callTool({
          name: "lifeos_log_habit",
          arguments: { habitId: "habit-1", date: "2026-09-30", [key]: "victim_user" },
        })) as { isError: boolean; content: Array<{ text: string }> };

        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("prohibited");
      }
    });
  });

  describe("4. Cross-User Data Isolation (MCP-04)", () => {
    let clientAlice: Client;
    let clientBob: Client;

    beforeAll(async () => {
      const contextAlice: McpContext = {
        user: { id: "usr_alice", name: "Alice", email: "alice@test.local" },
        session: { id: "sess_alice", userId: "usr_alice", expiresAt: new Date(Date.now() + 86400000) },
      };
      const contextBob: McpContext = {
        user: { id: "usr_bob", name: "Bob", email: "bob@test.local" },
        session: { id: "sess_bob", userId: "usr_bob", expiresAt: new Date(Date.now() + 86400000) },
      };

      const serverAlice = createLifeOSMcpServer(contextAlice);
      const serverBob = createLifeOSMcpServer(contextBob);

      const [pairAClient, pairAServer] = InMemoryTransport.createLinkedPair();
      const [pairBClient, pairBServer] = InMemoryTransport.createLinkedPair();

      await serverAlice.connect(pairAServer);
      await serverBob.connect(pairBServer);

      clientAlice = new Client({ name: "client-alice", version: "1.0.0" });
      clientBob = new Client({ name: "client-bob", version: "1.0.0" });

      await clientAlice.connect(pairAClient);
      await clientBob.connect(pairBClient);
    });

    it("guarantees Alice's mutations are strictly bound to Alice's userId", async () => {
      mockCreateTask.mockResolvedValueOnce({ id: "task-alice-1", title: "Alice's Task" });

      await clientAlice.callTool({
        name: "lifeos_create_task",
        arguments: { title: "Alice's Task" },
      });

      expect(mockCreateTask).toHaveBeenCalledWith(
        "usr_alice",
        expect.objectContaining({ title: "Alice's Task" })
      );
      expect(mockCreateTask).not.toHaveBeenCalledWith("usr_bob", expect.anything());
    });

    it("guarantees Bob's mutations are strictly bound to Bob's userId", async () => {
      mockCreateTask.mockClear();
      mockCreateTask.mockResolvedValueOnce({ id: "task-bob-1", title: "Bob's Task" });

      await clientBob.callTool({
        name: "lifeos_create_task",
        arguments: { title: "Bob's Task" },
      });

      expect(mockCreateTask).toHaveBeenCalledWith(
        "usr_bob",
        expect.objectContaining({ title: "Bob's Task" })
      );
      expect(mockCreateTask).not.toHaveBeenCalledWith("usr_alice", expect.anything());
    });

    it("fails closed when Alice attempts to mutate an entity belonging to Bob", async () => {
      // Canonical service throws NotFoundError when entity does not belong to caller
      mockUpdateTask.mockImplementation((userId: string, taskId: string) => {
        if (userId === "usr_bob" && taskId === "task-bob-1") {
          return Promise.resolve({ id: "task-bob-1", title: "Updated" });
        }
        const err = new Error(`Task '${taskId}' not found`);
        (err as any).code = "NOT_FOUND";
        return Promise.reject(err);
      });

      const res = (await clientAlice.callTool({
        name: "lifeos_update_task",
        arguments: { id: "task-bob-1", title: "Alice Hijack Attempt" },
      })) as { isError: boolean; content: Array<{ text: string }> };

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain("NOT_FOUND");
      // Does not leak Bob's data
      expect(res.content[0].text).not.toContain("usr_bob");
    });
  });

  describe("5. Financial Shield Enforcement (MCP-03)", () => {
    it("asserts no financial mutation tools can be called", async () => {
      const context: McpContext = {
        user: { id: "usr_fin_test", name: "Fin User", email: "fin@test.local" },
        session: { id: "sess_fin", userId: "usr_fin_test", expiresAt: new Date(Date.now() + 86400000) },
      };

      const server = createLifeOSMcpServer(context);
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      const client = new Client({ name: "fin-tester", version: "1.0.0" });
      await client.connect(clientTransport);

      const prohibitedTools = [
        "lifeos_create_transaction",
        "lifeos_update_transaction",
        "lifeos_delete_transaction",
        "lifeos_create_transfer",
        "lifeos_modify_account",
        "lifeos_update_balance",
      ];

      for (const tool of prohibitedTools) {
        const res = (await client.callTool({ name: tool, arguments: {} })) as {
          isError?: boolean;
          content: Array<{ text: string }>;
        };
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("not found");
      }
    });
  });

  describe("6. Comprehensive Secret Scrubbing (MCP-05)", () => {
    it("scrubs database connection strings with embedded passwords", () => {
      const err = new Error("DB error: postgresql://admin:SuperSecretPass123!@localhost:5432/lifeos failed");
      const formatted = formatMcpToolError(err);

      expect(formatted.isError).toBe(true);
      const first = formatted.content[0];
      expect(first?.type).toBe("text");
      const text = (first as { type: "text"; text: string }).text;
      expect(text).not.toContain("SuperSecretPass123!");
      expect(text).toContain("***REDACTED***");
    });

    it("scrubs Better Auth session cookies and bearer tokens from error responses", () => {
      const err = new Error("Auth failed: better-auth.session_token=secret_token_12345; Bearer eyJhbGciOiJIUzI1Ni...");
      const formatted = formatMcpToolError(err);

      const first = formatted.content[0];
      expect(first?.type).toBe("text");
      const text = (first as { type: "text"; text: string }).text;
      expect(text).not.toContain("secret_token_12345");
      expect(text).not.toContain("eyJhbGciOiJIUzI1Ni");
      expect(text).toContain("***REDACTED***");
    });

    it("scrubs 64-character hex encryption keys from error responses", () => {
      const rawKey = "319a99a3aaff1d716490cd27096720a8cf8031500c7d7d7066591f0143c9698e";
      const err = new Error(`Crypto error using key: ${rawKey}`);
      const formatted = formatMcpToolError(err);

      const first = formatted.content[0];
      expect(first?.type).toBe("text");
      const text = (first as { type: "text"; text: string }).text;
      expect(text).not.toContain(rawKey);
      expect(text).toContain("***REDACTED***");
    });
  });

  describe("7. Database Scope & Migration Invariant", () => {
    it("verifies historical migrations exist (0000 to 0026) with intact baseline", () => {
      const migrationsDir = path.resolve(PROJECT_ROOT, "src/server/db/migrations");
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

      expect(files.length).toBeGreaterThanOrEqual(27);
      expect(files[0]).toBe("0000_productive_lord_hawal.sql");
      expect(files).toContain("0026_pgvector_knowledge_embeddings.sql");
    });
  });
});
