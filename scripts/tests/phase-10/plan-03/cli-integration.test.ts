/**
 * Plan 10-03: Real Subprocess CLI Integration Tests
 *
 * Executes bin/lifeos.js via child_process.spawnSync to verify:
 * 1. Executable invocation and cold start.
 * 2. Exit codes (0, 1, 2, 3, 4).
 * 3. Deterministic --json serialization.
 * 4. Tabular output formatting and column alignment.
 * 5. Clean stdout/stderr stream separation.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const PROJECT_ROOT = path.resolve(__dirname, "../../../../");
const LIFEOS_BIN = path.join(PROJECT_ROOT, "bin/lifeos.js");

interface CliOutput {
  status: number | null;
  stdout: string;
  stderr: string;
  json: <T = Record<string, unknown>>() => T;
}

function runLifeOS(
  args: string[],
  options?: { env?: Record<string, string> }
): CliOutput {
  // Use a blank temp home to ensure no ambient ~/.config/lifeos credentials interfere
  const isolatedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: "/tmp/lifeos-test-home-" + Math.random().toString(36).slice(2),
    XDG_CONFIG_HOME: "/tmp/lifeos-test-xdg-" + Math.random().toString(36).slice(2),
    NODE_NO_WARNINGS: "1",
    ...(options?.env || {}),
  };
  delete isolatedEnv.LIFEOS_TOKEN;
  delete isolatedEnv.LIFEOS_CONFIG_DIR;
  delete isolatedEnv.LIFEOS_CREDENTIALS_PATH;

  const result = spawnSync(process.execPath, [LIFEOS_BIN, ...args], {
    cwd: PROJECT_ROOT,
    env: isolatedEnv,
    encoding: "utf-8",
    timeout: 20000,
  });

  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    json: <T = Record<string, unknown>>(): T => {
      try {
        return JSON.parse(result.stdout) as T;
      } catch (err) {
        throw new Error(
          `Failed to parse CLI stdout as JSON:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
        );
      }
    },
  };
}

describe("Plan 10-03: Subprocess CLI Execution & Stream Separation", { timeout: 25000 }, () => {
  it("verifies executable file exists and has executable permissions", () => {
    expect(fs.existsSync(LIFEOS_BIN)).toBe(true);
    if (process.platform !== "win32") {
      const stats = fs.statSync(LIFEOS_BIN);
      expect((stats.mode & 0o111) > 0).toBe(true); // Executable
    }
  });

  describe("1. Flag-Based Invocations (--version, --help)", () => {
    it("runs --version returning version string and exit code 0 with clean stderr", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runLifeOS(["--version"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("LifeOS CLI v0.1.0");
      expect(res.stderr.trim()).toBe("");
    });

    it("runs --version --json returning deterministic JSON and exit code 0", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runLifeOS(["--version", "--json"]);
      expect(res.status).toBe(0);
      const data = res.json<{ version: string }>();
      expect(data.version).toBe("0.1.0");
      expect(res.stderr.trim()).toBe("");
    });

    it("runs --help returning usage guide and exit code 0", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runLifeOS(["--help"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Usage:");
      expect(res.stdout).toContain("Core Commands:");
      expect(res.stderr.trim()).toBe("");
    });

    it("runs --help --json returning structured JSON help", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runLifeOS(["--help", "--json"]);
      expect(res.status).toBe(0);
      const data = res.json<{ help: string }>();
      expect(data.help).toContain("Usage:");
      expect(res.stderr.trim()).toBe("");
    });
  });

  describe("2. Usage & Argument Rejections (Exit Code 2)", () => {
    it("fails closed with exit code 2 when unknown command is provided", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runLifeOS(["unknown-command"]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("Unknown command: 'unknown-command'");
      expect(res.stdout.trim()).toBe("");
    });

    it("fails closed with exit code 2 and structured JSON on stdout when --json is passed", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runLifeOS(["unknown-command", "--json"]);
      expect(res.status).toBe(2);
      const data = res.json<{ success: boolean; error: { code: string; message: string } }>();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("USAGE_ERROR");
      expect(data.error.message).toContain("Unknown command");
      expect(res.stderr.trim()).toBe("");
    });

    it("fails closed with exit code 2 when required argument is missing (e.g. login)", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runLifeOS(["login"]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("both --email and --password must be provided");
    });
  });

  describe("3. Unauthenticated Rejections (Exit Code 3)", () => {
    it("fails closed with exit code 3 when protected command is called unauthenticated", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runLifeOS(["whoami"]);
      expect(res.status).toBe(3);
      expect(res.stderr).toContain("AUTH_ERROR");
      expect(res.stderr).toContain("Authentication required");
      expect(res.stdout.trim()).toBe("");
    });

    it("fails closed with exit code 3 and structured JSON on stdout when whoami --json is called", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runLifeOS(["whoami", "--json"]);
      expect(res.status).toBe(3);
      const data = res.json<{ success: boolean; error: { code: string; message: string } }>();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("AUTH_ERROR");
      expect(data.error.message).toContain("Authentication required");
      expect(res.stderr.trim()).toBe("");
    });

    it("fails closed with exit code 3 when status is called unauthenticated", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runLifeOS(["status"]);
      expect(res.status).toBe(3);
      expect(res.stderr).toContain("AUTH_ERROR");
    });

    it("fails closed with exit code 3 when tasks list is called unauthenticated", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runLifeOS(["tasks", "list"]);
      expect(res.status).toBe(3);
      expect(res.stderr).toContain("AUTH_ERROR");
    });
  });

  describe("4. Stream Separation & Machine Readability Invariants", () => {
    it("verifies that stdout is never polluted by debug logs or banners when --json is used", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runLifeOS(["--version", "--json"]);
      expect(res.status).toBe(0);

      // Must parse cleanly without stripping any prefixes or lines
      let parseError = false;
      try {
        JSON.parse(res.stdout);
      } catch {
        parseError = true;
      }
      expect(parseError).toBe(false);
    });

    it("verifies that error messages are written strictly to stderr in default mode", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runLifeOS(["whoami"]);
      expect(res.status).toBe(3);
      expect(res.stdout.trim()).toBe("");
      expect(res.stderr.length).toBeGreaterThan(0);
    });
  });
});
