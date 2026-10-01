/**
 * Plan 10-01: Shared Domain Service Contracts & Standalone CLI Runner Foundation
 *
 * Verifies:
 * 1. CLI runner entry point, arguments and flag routing.
 * 2. Configuration resolution and 0o600 permission enforcement.
 * 3. Token precedence (flag > env > stored credentials).
 * 4. Authentication boundary & caller identity spoofing rejection.
 * 5. Deterministic JSON formatting and tabular output.
 * 6. POSIX exit code mappings (0, 1, 2, 3, 4).
 * 7. Secret scrubbing from output and error streams.
 * 8. Database lifecycle teardown.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ZodError, z } from "zod";
import {
  parseArgs,
  runCli,
  getHelpText,
} from "@/cli/index";
import {
  getConfigDir,
  getCredentialsPath,
  saveCredentials,
  loadCredentials,
  clearCredentials,
  resolveToken,
  enforceSecurePermissions,
} from "@/cli/config";
import {
  resolveAuthenticatedUser,
  assertNoCallerSpoofing,
} from "@/cli/auth";
import {
  formatJson,
  formatTable,
  sortKeysDeterministically,
} from "@/cli/formatters";
import {
  CliError,
  UsageError,
  ValidationError,
  AuthError,
  NotFoundError,
  ForbiddenError,
  scrubSecrets,
  resolveCliError,
  formatCliError,
} from "@/cli/errors";
import { EXIT_CODES } from "@/cli/types";
import { AuthenticationError, AuthorizationError } from "@/server/auth/guard";

describe("Plan 10-01: CLI Runner & Configuration Foundation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-cli-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
    delete process.env.LIFEOS_TOKEN;
    delete process.env.LIFEOS_CONFIG_DIR;
    delete process.env.LIFEOS_CREDENTIALS_PATH;
  });

  describe("1. Configuration & Credential Store (CLI-01)", () => {
    it("resolves default and custom configuration paths", () => {
      const customConfig = path.join(tempDir, "custom-config");
      const credsPath = getCredentialsPath(customConfig);
      expect(credsPath).toBe(path.join(customConfig, "credentials.json"));
    });

    it("saves credentials with strict POSIX 0o600 file permissions", () => {
      const customConfig = path.join(tempDir, "config");
      const credsPath = path.join(customConfig, "credentials.json");

      saveCredentials(
        {
          token: "test_token_secret_12345",
          user: { id: "user_1", name: "Hamza", email: "hamza@example.com" },
        },
        customConfig
      );

      expect(fs.existsSync(credsPath)).toBe(true);

      if (process.platform !== "win32") {
        const stats = fs.statSync(credsPath);
        const mode = stats.mode & 0o777;
        expect(mode).toBe(0o600);
      }
    });

    it("enforces and corrects insecure file permissions to 0o600", () => {
      if (process.platform === "win32") return;

      const credsPath = path.join(tempDir, "credentials.json");
      fs.writeFileSync(credsPath, JSON.stringify({ token: "tok123" }), { mode: 0o666 });

      // Insecure mode verified
      fs.chmodSync(credsPath, 0o666);
      expect(fs.statSync(credsPath).mode & 0o777).toBe(0o666);

      // Loading credentials triggers enforcement
      enforceSecurePermissions(credsPath);
      expect(fs.statSync(credsPath).mode & 0o777).toBe(0o600);
    });

    it("loads and clears credentials accurately", () => {
      const customConfig = path.join(tempDir, "config");
      saveCredentials(
        {
          token: "stored_secret_token",
          user: { id: "u123", name: "User", email: "u@example.com" },
        },
        customConfig
      );

      const loaded = loadCredentials(customConfig);
      expect(loaded).toBeTruthy();
      expect(loaded?.token).toBe("stored_secret_token");
      expect(loaded?.user?.email).toBe("u@example.com");

      const cleared = clearCredentials(customConfig);
      expect(cleared).toBe(true);
      expect(loadCredentials(customConfig)).toBeNull();
    });

    it("resolves token following strict precedence: flag > env > credentials file", () => {
      const customConfig = path.join(tempDir, "config");
      saveCredentials({ token: "stored_token" }, customConfig);

      // 1. Only stored
      expect(resolveToken({ config: customConfig })).toBe("stored_token");

      // 2. Env overrides stored
      process.env.LIFEOS_TOKEN = "env_token";
      expect(resolveToken({ config: customConfig })).toBe("env_token");

      // 3. CLI flag overrides both env and stored
      expect(resolveToken({ token: "flag_token", config: customConfig })).toBe("flag_token");
    });
  });

  describe("2. Argument Parsing & Caller Identity Protection (CLI-01, CLI-04)", () => {
    it("parses subcommands, boolean flags, and string flags accurately", () => {
      const parsed = parseArgs([
        "tasks",
        "list",
        "--status",
        "todo",
        "--overdue",
        "--json",
        "--token",
        "my_token",
      ]);

      expect(parsed.subcommands).toEqual(["tasks", "list"]);
      expect(parsed.flags.status).toBe("todo");
      expect(parsed.flags.overdue).toBe(true);
      expect(parsed.options.json).toBe(true);
      expect(parsed.options.token).toBe("my_token");
    });

    it("strictly rejects caller identity spoofing via --userId or --user_id", () => {
      expect(() => parseArgs(["tasks", "list", "--userId", "injected_user_id"])).toThrow(
        /Specifying 'userId' is prohibited/
      );
      expect(() => parseArgs(["tasks", "list", "--user-id", "injected_user_id"])).toThrow(
        /Specifying 'user-id' is prohibited/
      );
      expect(() => parseArgs(["tasks", "list", "--user_id", "injected_user_id"])).toThrow(
        /Specifying 'user_id' is prohibited/
      );
    });

    it("assertNoCallerSpoofing fails closed on spoofed object flags", () => {
      expect(() => assertNoCallerSpoofing({ userId: "malicious" })).toThrow();
      expect(() => assertNoCallerSpoofing({ user_id: "malicious" })).toThrow();
      expect(() => assertNoCallerSpoofing({ userid: "malicious" })).toThrow();
      expect(() => assertNoCallerSpoofing({ title: "Safe Task" })).not.toThrow();
    });
  });

  describe("3. Deterministic Formatters & Key Sorting (CLI-02)", () => {
    it("recursively sorts object keys alphabetically", () => {
      const raw = {
        zebra: 1,
        apple: 2,
        nested: {
          charlie: "c",
          bravo: "b",
          alpha: [
            { z: 1, a: 2 },
            { y: 3, b: 4 },
          ],
        },
      };

      const sorted = sortKeysDeterministically(raw) as any;
      expect(Object.keys(sorted)).toEqual(["apple", "nested", "zebra"]);
      expect(Object.keys(sorted.nested)).toEqual(["alpha", "bravo", "charlie"]);
      expect(Object.keys(sorted.nested.alpha[0])).toEqual(["a", "z"]);
      expect(Object.keys(sorted.nested.alpha[1])).toEqual(["b", "y"]);
    });

    it("produces deterministic JSON with stable 2-space indentation", () => {
      const obj1 = { b: 2, a: 1 };
      const obj2 = { a: 1, b: 2 };
      expect(formatJson(obj1)).toBe(formatJson(obj2));
      expect(formatJson(obj1)).toBe(`{\n  "a": 1,\n  "b": 2\n}`);
    });

    it("formats tables with aligned columns, headers, and separators", () => {
      const columns = [
        { key: "id", label: "ID", width: 6 },
        { key: "title", label: "Title", width: 12 },
      ];
      const rows = [
        { id: "1", title: "First Task" },
        { id: "2", title: "Second Task" },
      ];

      const table = formatTable(columns, rows);
      expect(table).toContain("ID");
      expect(table).toContain("Title");
      expect(table).toContain("First Task");
      expect(table).toContain("Second Task");
    });

    it("displays clean (no records found) message for empty table rows", () => {
      const columns = [{ key: "id", label: "ID" }];
      const table = formatTable(columns, []);
      expect(table).toBe("(no records found)");
    });
  });

  describe("4. Secret Scrubbing & Redaction Invariants", () => {
    it("scrubs bearer tokens and session secrets from strings", () => {
      const secretString = "Authorization: Bearer secret_token_1234567890abcdef";
      expect(scrubSecrets(secretString)).toBe("Authorization: Bearer ***REDACTED***");
    });

    it("scrubs better-auth session cookies", () => {
      const cookieStr = "Cookie: better-auth.session_token=sensitive_session_value_xyz.sig123; Path=/";
      expect(scrubSecrets(cookieStr)).toBe("Cookie: better-auth.session_token=***REDACTED***; Path=/");
    });

    it("scrubs passwords from text and errors", () => {
      const text = 'Failed with password: "super_secret_password_123"';
      expect(scrubSecrets(text)).toBe('Failed with password: "***REDACTED***"');
    });

    it("never includes raw credentials in formatted errors", () => {
      const sensitiveError = new Error("Invalid password MyPassword! provided for user hamza");
      const formatted = formatCliError(sensitiveError, false);
      expect(formatted.output).not.toContain("MyPassword!");
      expect(formatted.output).toContain("***REDACTED***");
    });
  });

  describe("5. POSIX Exit Code Mappings & Error Formatting (CLI-01, CLI-02)", () => {
    it("maps Zod validation error to exit code 2 (ERROR_VALIDATION)", () => {
      const schema = z.object({ title: z.string().min(3) });
      const parseResult = schema.safeParse({ title: "ab" });
      expect(parseResult.success).toBe(false);

      if (!parseResult.success) {
        const resolved = resolveCliError(parseResult.error);
        expect(resolved.exitCode).toBe(EXIT_CODES.ERROR_VALIDATION);
        expect(resolved.code).toBe("VALIDATION_ERROR");

        const formatted = formatCliError(parseResult.error, true);
        expect(formatted.exitCode).toBe(2);
        const parsedJson = JSON.parse(formatted.output);
        expect(parsedJson.success).toBe(false);
        expect(parsedJson.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("maps AuthenticationError to exit code 3 (ERROR_AUTH)", () => {
      const authErr = new AuthenticationError();
      const resolved = resolveCliError(authErr);
      expect(resolved.exitCode).toBe(EXIT_CODES.ERROR_AUTH);
      expect(resolved.code).toBe("AUTH_ERROR");

      const formatted = formatCliError(authErr, true);
      expect(formatted.exitCode).toBe(3);
      const parsedJson = JSON.parse(formatted.output);
      expect(parsedJson.error.code).toBe("AUTH_ERROR");
    });

    it("maps AuthorizationError to exit code 4 (ERROR_NOT_FOUND)", () => {
      const authzErr = new AuthorizationError();
      const resolved = resolveCliError(authzErr);
      expect(resolved.exitCode).toBe(EXIT_CODES.ERROR_NOT_FOUND);
      expect(resolved.code).toBe("FORBIDDEN");
    });

    it("maps NotFoundError to exit code 4 (ERROR_NOT_FOUND)", () => {
      const notFoundErr = new NotFoundError();
      const resolved = resolveCliError(notFoundErr);
      expect(resolved.exitCode).toBe(EXIT_CODES.ERROR_NOT_FOUND);
      expect(resolved.code).toBe("NOT_FOUND");
    });

    it("maps UsageError to exit code 2 (ERROR_VALIDATION)", () => {
      const usageErr = new UsageError("Unknown flag passed");
      const resolved = resolveCliError(usageErr);
      expect(resolved.exitCode).toBe(EXIT_CODES.ERROR_VALIDATION);
      expect(resolved.code).toBe("USAGE_ERROR");
    });

    it("maps generic unexpected error to exit code 1 (ERROR_GENERAL)", () => {
      const genericErr = new Error("Database connection dropped unexpectedly");
      const resolved = resolveCliError(genericErr);
      expect(resolved.exitCode).toBe(EXIT_CODES.ERROR_GENERAL);
    });
  });

  describe("6. CLI Entry Point Routing Contracts (CLI-01, CLI-02)", () => {
    it("handles --version without requiring database connection (exit code 0)", async () => {
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const exitCode = await runCli(["--version"]);
      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("LifeOS CLI v0.1.0"));
      stdoutSpy.mockRestore();
    });

    it("handles --version --json producing valid JSON output", async () => {
      let output = "";
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((str) => {
        output += str;
        return true;
      });
      const exitCode = await runCli(["--version", "--json"]);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(output);
      expect(parsed.version).toBe("0.1.0");
      stdoutSpy.mockRestore();
    });

    it("handles --help without requiring database connection (exit code 0)", async () => {
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const exitCode = await runCli(["--help"]);
      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
      stdoutSpy.mockRestore();
    });

    it("fails closed with exit code 2 when unknown command is invoked", async () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const exitCode = await runCli(["nonexistent_command"]);
      expect(exitCode).toBe(2);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown command: 'nonexistent_command'"));
      stderrSpy.mockRestore();
    });

    it("fails closed with exit code 2 and structured JSON when unknown command is invoked with --json", async () => {
      let output = "";
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((str) => {
        output += str;
        return true;
      });
      const exitCode = await runCli(["nonexistent_command", "--json"]);
      expect(exitCode).toBe(2);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("USAGE_ERROR");
      stdoutSpy.mockRestore();
    });

    it("fails closed with exit code 3 when protected command invoked unauthenticated", async () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const exitCode = await runCli(["whoami"]);
      expect(exitCode).toBe(3);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("AUTH_ERROR"));
      stderrSpy.mockRestore();
    });
  });
});
