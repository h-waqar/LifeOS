// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ChromiumBrowser } from "./cdp-client";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { spawn, ChildProcess } from "node:child_process";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

describe("Plan 01-09: Frontend Security & Adversarial Test Suite", () => {
  let serverProcess: ChildProcess | null = null;
  let browser: ChromiumBrowser;

  beforeAll(async () => {
    // 1. Ensure Next.js production server is running
    let serverRunning = false;
    try {
      const res = await fetch(`${APP_URL}/api/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.status === 200 || res.status === 503) {
        serverRunning = true;
      }
    } catch {
      serverRunning = false;
    }

    if (!serverRunning) {
      serverProcess = spawn("npx", ["next", "start", "-p", "3000"], {
        stdio: "ignore",
        detached: true,
      });

      const startTime = Date.now();
      while (Date.now() - startTime < 25000) {
        try {
          const res = await fetch(`${APP_URL}/api/health`, {
            signal: AbortSignal.timeout(1000),
          });
          if (res.status === 200 || res.status === 503) {
            serverRunning = true;
            break;
          }
        } catch {
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      if (!serverRunning) {
        throw new Error(`Failed to connect to Next.js server at ${APP_URL}`);
      }
    }

    // 2. Clear user database for clean adversarial isolation
    await db.delete(user);

    // 3. Launch isolated browser
    browser = new ChromiumBrowser(9255);
    await browser.launch();
  }, 45000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (serverProcess && serverProcess.pid) {
      try {
        process.kill(-serverProcess.pid, "SIGTERM");
      } catch {
        try {
          serverProcess.kill("SIGTERM");
        } catch {}
      }
    }
    await db.delete(user);
    await closeDatabase();
  });

  describe("Route Guards & Unauthenticated Access Enforcement", () => {
    it("redirects unauthenticated visitor from /dashboard to /login", async () => {
      await browser.navigate(`${APP_URL}/dashboard`);
      await browser.waitForSelector("[data-testid='login-card']", 10000);
      const url = await browser.evaluate<string>("window.location.pathname");
      expect(url).toBe("/login");
    }, 20000);

    it("redirects unauthenticated visitor from /projects to /login", async () => {
      await browser.navigate(`${APP_URL}/projects`);
      await browser.waitForSelector("[data-testid='login-card']", 10000);
      const url = await browser.evaluate<string>("window.location.pathname");
      expect(url).toBe("/login");
    }, 20000);

    it("redirects unauthenticated visitor from /tasks to /login", async () => {
      await browser.navigate(`${APP_URL}/tasks`);
      await browser.waitForSelector("[data-testid='login-card']", 10000);
      const url = await browser.evaluate<string>("window.location.pathname");
      expect(url).toBe("/login");
    }, 20000);
  });

  describe("Single-User Auto-Lock & Registration Guard", () => {
    it("allows registering the first owner account and navigates to dashboard", async () => {
      await browser.navigate(`${APP_URL}/register`);
      await browser.waitForSelector("[data-testid='register-card']", 10000);

      await browser.fill('[data-testid="register-name"]', "Security Auditor");
      await browser.fill('[data-testid="register-email"]', "security@lifeos.local");
      await browser.fill('[data-testid="register-password"]', "SuperSecure123!");
      await browser.click('[data-testid="register-submit"]');

      await browser.waitForSelector("[data-testid='dashboard-view']", 15000);
      const url = await browser.evaluate<string>("window.location.pathname");
      expect(url).toBe("/dashboard");
    }, 25000);

    it("rejects second user registration via single-user auto-lock", async () => {
      const adversaryBrowser = new ChromiumBrowser(9256);
      await adversaryBrowser.launch();

      try {
        await adversaryBrowser.navigate(`${APP_URL}/register`);
        await adversaryBrowser.waitForSelector("[data-testid='register-card']", 10000);

        await adversaryBrowser.fill('[data-testid="register-name"]', "Second User");
        await adversaryBrowser.fill('[data-testid="register-email"]', "second@lifeos.local");
        await adversaryBrowser.fill('[data-testid="register-password"]', "SuperSecure123!");
        await adversaryBrowser.click('[data-testid="register-submit"]');

        await adversaryBrowser.waitForSelector("[data-testid='auth-error']", 10000);
        const errorText = await adversaryBrowser.evaluate<string>(
          "document.querySelector('[data-testid=\"auth-error\"]').innerText"
        );
        expect(errorText.toLowerCase()).toContain("registration is closed");
      } finally {
        await adversaryBrowser.close();
      }
    }, 25000);
  });

  describe("XSS Prevention & HTML Injection Defense", () => {
    it("renders user inputs strictly as safe text and prevents script execution", async () => {
      await browser.navigate(`${APP_URL}/projects`);
      await browser.waitForSelector("[data-testid='create-project-btn']", 10000);

      await browser.click('[data-testid="create-project-btn"]');
      await browser.waitForSelector("[data-testid='new-project-name']", 8000);

      const xssTitle = '<script>window.__xss_attack_executed__=true</script><img src="x" onerror="window.__xss_attack_executed__=true">';
      await browser.fill('[data-testid="new-project-name"]', xssTitle);
      await browser.fill(
        '[data-testid="new-project-desc"]',
        'Payload <svg onload="window.__xss_attack_executed__=true"></svg>'
      );
      await browser.click('[data-testid="submit-create-project"]');

      await browser.waitForText("Payload", 10000);

      // Verify that javascript execution was blocked and script tags were NOT evaluated
      const attackExecuted = await browser.evaluate<boolean>(
        "Boolean(window.__xss_attack_executed__)"
      );
      expect(attackExecuted).toBe(false);

      // Confirm raw string was rendered safely
      const bodyText = await browser.evaluate<string>("document.body.innerText");
      expect(bodyText).toContain("<script>");
    }, 25000);
  });

  describe("Session Invalidation & Post-Logout Access", () => {
    it("properly clears session on logout and blocks back-navigation to protected routes", async () => {
      await browser.navigate(`${APP_URL}/dashboard`);
      await browser.waitForSelector("[data-testid='sign-out-button']", 10000);

      // Click sign out
      await browser.click('[data-testid="sign-out-button"]');
      await browser.waitForSelector("[data-testid='login-card']", 10000);
      expect(await browser.evaluate<string>("window.location.pathname")).toBe("/login");

      // Attempt to immediately navigate back to /dashboard
      await browser.navigate(`${APP_URL}/dashboard`);
      await browser.waitForSelector("[data-testid='login-card']", 10000);
      expect(await browser.evaluate<string>("window.location.pathname")).toBe("/login");
    }, 20000);
  });
});
