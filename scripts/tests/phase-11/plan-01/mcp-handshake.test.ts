/**
 * Plan 11-01: MCP Server Foundation, Transport & Security Handshake Tests
 *
 * Verifies:
 * 1. MCP Server factory, name, version, and capability advertisement (MCP-01).
 * 2. Stdio transport stream discipline: stdout is protocol-only, stderr is diagnostics-only (MCP-01).
 * 3. Authentication boundary: token precedence, encrypted v1: token decryption, active session verification (MCP-05).
 * 4. Fails closed on missing, expired, revoked, or tampered tokens with exit code 3 (MCP-05).
 * 5. Caller identity spoofing rejection across userId, user_id, and user-id variants (MCP-04).
 * 6. CLI integration: lifeos mcp command registration and lifecycle teardown.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PassThrough } from "node:stream";
import { createLifeOSMcpServer } from "@/server/mcp/server";
import { resolveMcpAuth, assertNoCallerSpoofing, verifySessionActive } from "@/server/mcp/auth";
import { startStdioServer } from "@/server/mcp/transport";
import { COMMAND_REGISTRY, getHelpText, runCli } from "@/cli/index";
import { encryptSecret } from "@/lib/crypto";
import { AuthError, UsageError, EXIT_CODES } from "@/cli/errors";
import { saveCredentials } from "@/cli/config";
import type { McpContext } from "@/server/mcp/types";

// Mock database
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

vi.mock("@/server/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            innerJoin: (...jArgs: unknown[]) => {
              mockInnerJoin(...jArgs);
              return {
                where: (...wArgs: unknown[]) => {
                  mockWhere(...wArgs);
                  return {
                    limit: (...lArgs: unknown[]) => {
                      mockLimit(...lArgs);
                      return mockLimitImpl();
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  },
  closeDatabase: vi.fn().mockResolvedValue(undefined),
}));

let mockLimitImpl = vi.fn().mockResolvedValue([]);

describe("Plan 11-01: MCP Server Foundation, Transport & Security Handshake", () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-mcp-test-"));
    process.env.XDG_CONFIG_HOME = tempDir;
    delete process.env.LIFEOS_TOKEN;
    delete process.env.LIFEOS_CREDENTIALS_PATH;
    process.env.LIFEOS_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env = originalEnv;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe("1. Server Factory & Capability Negotiation (MCP-01)", () => {
    it("initializes McpServer with server info and declared capabilities", () => {
      const mockContext: McpContext = {
        user: { id: "user-123", name: "Test User", email: "test@example.com" },
        session: { id: "sess-123", userId: "user-123", expiresAt: new Date(Date.now() + 3600000) },
      };

      const server = createLifeOSMcpServer(mockContext);
      expect(server).toBeDefined();

      const serverInternal = server.server as unknown as {
        _serverInfo: { name: string; version: string };
        _capabilities: Record<string, unknown>;
      };

      expect(serverInternal._serverInfo).toEqual({
        name: "lifeos",
        version: "0.1.0",
      });

      expect(serverInternal._capabilities).toHaveProperty("resources");
      expect(serverInternal._capabilities).toHaveProperty("tools");
      expect(serverInternal._capabilities).toHaveProperty("prompts");
      expect(serverInternal._capabilities).toHaveProperty("logging");
    });
  });

  describe("2. Authentication Boundary & Token Resolution (MCP-05)", () => {
    const validUser = { id: "user-abc", name: "Alice", email: "alice@example.com" };
    const validSession = {
      id: "sess-abc",
      userId: "user-abc",
      expiresAt: new Date(Date.now() + 3600000),
      token: "secret-token-123",
    };

    it("resolves authenticated user from explicit tokenOverride", async () => {
      mockLimitImpl = vi.fn().mockResolvedValue([
        { user: validUser, session: validSession },
      ]);

      const context = await resolveMcpAuth("explicit-token");
      expect(context.user).toEqual(validUser);
      expect(context.session.id).toBe(validSession.id);
    });

    it("resolves authenticated user from LIFEOS_TOKEN environment variable", async () => {
      process.env.LIFEOS_TOKEN = "env-token-xyz";
      mockLimitImpl = vi.fn().mockResolvedValue([
        { user: validUser, session: validSession },
      ]);

      const context = await resolveMcpAuth();
      expect(context.user).toEqual(validUser);
    });

    it("resolves authenticated user from credentials file when env is absent", async () => {
      saveCredentials({ token: "creds-token-file" });
      mockLimitImpl = vi.fn().mockResolvedValue([
        { user: validUser, session: validSession },
      ]);

      const context = await resolveMcpAuth();
      expect(context.user).toEqual(validUser);
    });

    it("resolves and decrypts AES-256-GCM encrypted token starting with v1:", async () => {
      const plaintext = "decrypted-secret-token";
      const encrypted = encryptSecret(plaintext);
      expect(encrypted.startsWith("v1:")).toBe(true);

      mockLimitImpl = vi.fn().mockResolvedValue([
        { user: validUser, session: { ...validSession, token: plaintext } },
      ]);

      const context = await resolveMcpAuth(encrypted);
      expect(context.user).toEqual(validUser);
    });

    it("fails closed on tampered encrypted token (exit code 3 / AuthError)", async () => {
      const encrypted = encryptSecret("some-token");
      const tampered = encrypted.slice(0, -4) + "0000";

      await expect(resolveMcpAuth(tampered)).rejects.toThrow(AuthError);
    });

    it("fails closed when no token is found in any source", async () => {
      await expect(resolveMcpAuth()).rejects.toThrow(AuthError);
    });

    it("fails closed when database finds no active or unexpired session", async () => {
      mockLimitImpl = vi.fn().mockResolvedValue([]);

      await expect(resolveMcpAuth("invalid-token")).rejects.toThrow(AuthError);
    });

    it("verifySessionActive throws AuthError if session timestamp is in the past", () => {
      const expiredContext: McpContext = {
        user: validUser,
        session: {
          id: "sess-old",
          userId: "user-abc",
          expiresAt: new Date(Date.now() - 5000),
        },
      };

      expect(() => verifySessionActive(expiredContext)).toThrow(AuthError);
    });
  });

  describe("3. Caller Identity Spoofing Defense (MCP-04)", () => {
    it("rejects arguments containing userId", () => {
      expect(() => assertNoCallerSpoofing({ userId: "target-user" })).toThrow(UsageError);
    });

    it("rejects arguments containing user_id", () => {
      expect(() => assertNoCallerSpoofing({ user_id: "target-user" })).toThrow(UsageError);
    });

    it("rejects arguments containing user-id", () => {
      expect(() => assertNoCallerSpoofing({ "user-id": "target-user" })).toThrow(UsageError);
    });

    it("rejects nested identity spoofing in arguments", () => {
      expect(() =>
        assertNoCallerSpoofing({
          data: {
            task: {
              userId: "target-user",
            },
          },
        })
      ).toThrow(UsageError);
    });

    it("passes when arguments contain no caller identity selector", () => {
      expect(() =>
        assertNoCallerSpoofing({
          title: "My Task",
          priority: 3,
          details: { area: "WORK" },
        })
      ).not.toThrow();
    });
  });

  describe("4. CLI Integration & Stream Discipline (MCP-01)", () => {
    it("registers 'mcp' command in COMMAND_REGISTRY", () => {
      expect(COMMAND_REGISTRY).toHaveProperty("mcp");
      expect(COMMAND_REGISTRY.mcp.requiresAuth).toBe(false);
    });

    it("lists 'mcp' in global help output", () => {
      const help = getHelpText();
      expect(help).toContain("mcp");
      expect(help).toContain("Model Context Protocol");
    });

    it("fails closed with exit code 3 and writes zero bytes to stdout on unauthenticated mcp execution", async () => {
      let stdoutData = "";
      let stderrData = "";

      const origStdoutWrite = process.stdout.write;
      const origStderrWrite = process.stderr.write;

      process.stdout.write = vi.fn().mockImplementation((chunk: unknown) => {
        stdoutData += String(chunk);
        return true;
      });

      process.stderr.write = vi.fn().mockImplementation((chunk: unknown) => {
        stderrData += String(chunk);
        return true;
      });

      try {
        const exitCode = await runCli(["mcp"]);
        expect(exitCode).toBe(EXIT_CODES.ERROR_AUTH);
        expect(stdoutData).toBe(""); // ZERO BYTES ON STDOUT!
        expect(stderrData).toContain("Authentication required");
      } finally {
        process.stdout.write = origStdoutWrite;
        process.stderr.write = origStderrWrite;
      }
    });

    it("startStdioServer writes authenticated connection diagnostic strictly to stderr", async () => {
      let stderrOutput = "";
      const origStderrWrite = process.stderr.write;
      process.stderr.write = vi.fn().mockImplementation((chunk: unknown) => {
        stderrOutput += String(chunk);
        return true;
      });

      const mockStdin = new PassThrough() as unknown as NodeJS.ReadStream;
      const mockStdout = new PassThrough() as unknown as NodeJS.WriteStream;

      const mockContext: McpContext = {
        user: { id: "user-test", name: "Tester", email: "tester@lifeos.internal" },
        session: { id: "sess-test", userId: "user-test", expiresAt: new Date(Date.now() + 60000) },
      };

      try {
        const serverPromise = startStdioServer(
          { stdin: mockStdin, stdout: mockStdout },
          mockContext
        );

        // Allow microtasks to complete connection
        await new Promise((r) => setTimeout(r, 50));

        expect(stderrOutput).toContain("[lifeos-mcp] Authenticated session established for tester@lifeos.internal");

        // Close stdin to end server
        mockStdin.emit("close");
      } finally {
        process.stderr.write = origStderrWrite;
      }
    });
  });
});
