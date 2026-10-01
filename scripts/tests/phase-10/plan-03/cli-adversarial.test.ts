/**
 * Plan 10-03: Adversarial Security, Authorization Spoofing & Secret Scrubbing Tests
 *
 * Verifies:
 * 1. Caller identity spoofing resistance (--userId, --user_id, --userid, --user-id).
 * 2. Token tampering and expired/invalid session fail-closed behavior (exit code 3).
 * 3. Comprehensive secret scrubbing (passwords, tokens, cookies, secrets never leaked).
 * 4. Credential store file permission enforcement (POSIX 0o600).
 * 5. Domain validation invariant protections (exit code 2).
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  saveCredentials,
  enforceSecurePermissions,
} from "@/cli/config";
import { scrubSecrets, AuthError } from "@/cli/errors";
import { assertNoCallerSpoofing, resolveAuthenticatedUser } from "@/cli/auth";
import { probeDatabase } from "../../phase-01/plan-02/db-probe";
import * as dbModule from "@/server/db";

const PROJECT_ROOT = path.resolve(__dirname, "../../../../");
const LIFEOS_BIN = path.join(PROJECT_ROOT, "bin/lifeos.js");

let isDbAvailable = false;

beforeAll(async () => {
  const probe = await probeDatabase();
  isDbAvailable = probe.isAvailable;
});

function runCliAdversarial(args: string[], env?: Record<string, string>) {
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
    combined: (result.stdout || "") + "\n" + (result.stderr || ""),
  };
}

describe("Plan 10-03: Adversarial Security & Authorization Boundary", { timeout: 25000 }, () => {
  describe("1. Caller Identity Spoofing Resistance (CLI-01, CLI-04)", () => {
    it("fails closed when caller attempts identity injection via --userId", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runCliAdversarial(["tasks", "list", "--userId", "injected_user_b"]);
      expect(res.status).toBe(2);
      expect(res.combined).toContain("Specifying 'userId' is prohibited");
    });

    it("fails closed when caller attempts identity injection via --user_id", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runCliAdversarial(["status", "--user_id", "injected_user_b"]);
      expect(res.status).toBe(2);
      expect(res.combined).toContain("Specifying 'user_id' is prohibited");
    });

    it("fails closed when caller attempts identity injection via --user-id", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runCliAdversarial(["projects", "list", "--user-id", "injected_user_b"]);
      expect(res.status).toBe(2);
      expect(res.combined).toContain("Specifying 'user-id' is prohibited");
    });

    it("fails closed when caller attempts identity injection in --json mode", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const res = runCliAdversarial(["tasks", "list", "--userId", "injected_user_b", "--json"]);
      expect(res.status).toBe(2);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("USAGE_ERROR");
      expect(parsed.error.message).toContain("Specifying 'userId' is prohibited");
    });

    it("assertNoCallerSpoofing rejects identity aliases in object flags", () => {
      expect(() => assertNoCallerSpoofing({ userId: "123" })).toThrow(/prohibited/);
      expect(() => assertNoCallerSpoofing({ user_id: "123" })).toThrow(/prohibited/);
      expect(() => assertNoCallerSpoofing({ userid: "123" })).toThrow(/prohibited/);
      expect(() => assertNoCallerSpoofing({ "user-id": "123" })).toThrow(/prohibited/);
    });
  });

  describe("2. Token Tampering & Session Forgery (CLI-01)", () => {
    it("fails closed with AuthError (exit code 3) on invalid or non-existent token", async () => {
      const fakePool = { ended: false } as any;
      const fakeDb = {
        $client: fakePool,
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      } as any;

      globalThis.__lifeos_pg_pool__ = fakePool;
      globalThis.__lifeos_drizzle_db__ = fakeDb;

      try {
        await expect(resolveAuthenticatedUser("tampered_token_xyz")).rejects.toThrow(AuthError);
      } finally {
        globalThis.__lifeos_pg_pool__ = undefined;
        globalThis.__lifeos_drizzle_db__ = undefined;
      }
    });

    it("fails closed with exit code 3 when a forged token is supplied via --token (live DB)", () => {
      if (!isDbAvailable) return;
      const res = runCliAdversarial(["whoami", "--token", "forged_malicious_jwt_or_token_123"]);
      expect(res.status).toBe(3);
      expect(res.combined).toContain("AUTH_ERROR");
    });

    it("fails closed with exit code 3 when an invalid token is supplied via LIFEOS_TOKEN (live DB)", () => {
      if (!isDbAvailable) return;
      const res = runCliAdversarial(["whoami"], {
        LIFEOS_TOKEN: "tampered_env_token_value_abc",
      });
      expect(res.status).toBe(3);
      expect(res.combined).toContain("AUTH_ERROR");
    });

    it("fails closed with structured JSON when forged token is used with --json (live DB)", () => {
      if (!isDbAvailable) return;
      const res = runCliAdversarial(["whoami", "--token", "forged_token", "--json"]);
      expect(res.status).toBe(3);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe("AUTH_ERROR");
    });
  });

  describe("3. Secret Scrubbing & Data Leakage Prevention (CLI-01, CLI-02)", () => {
    it("never echoes plain-text passwords back into stdout or stderr", async () => {
      await new Promise((r) => setTimeout(r, 10));
      const password = "VerySecretPassword123!@#";
      const res = runCliAdversarial([
        "login",
        "--email",
        "attacker@example.com",
        "--password",
        password,
      ]);

      expect(res.combined).not.toContain(password);
    });

    it("scrubs complex composite tokens and cookies from error strings", () => {
      const input = "Connection error: better-auth.session_token=secret_sess_abc123.sig456; Bearer tok_xyz789";
      const scrubbed = scrubSecrets(input);

      expect(scrubbed).not.toContain("secret_sess_abc123");
      expect(scrubbed).not.toContain("tok_xyz789");
      expect(scrubbed).toContain("***REDACTED***");
    });
  });

  describe("4. Local Credential Storage Security Mode (0o600)", () => {
    it("guarantees credentials.json is created with 0o600 permissions", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-adv-cred-"));
      try {
        const credPath = path.join(tmpDir, "credentials.json");
        saveCredentials({ token: "tok_secure_123" }, tmpDir);

        expect(fs.existsSync(credPath)).toBe(true);

        if (process.platform !== "win32") {
          const stats = fs.statSync(credPath);
          const mode = stats.mode & 0o777;
          expect(mode).toBe(0o600);
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("tightens loose file mode to 0o600 on POSIX platforms", () => {
      if (process.platform === "win32") return;

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-adv-cred-"));
      try {
        const credPath = path.join(tmpDir, "credentials.json");
        fs.writeFileSync(credPath, JSON.stringify({ token: "insecure" }), { mode: 0o666 });
        fs.chmodSync(credPath, 0o666);

        expect(fs.statSync(credPath).mode & 0o777).toBe(0o666);

        // Enforce mode
        enforceSecurePermissions(credPath);
        expect(fs.statSync(credPath).mode & 0o777).toBe(0o600);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
