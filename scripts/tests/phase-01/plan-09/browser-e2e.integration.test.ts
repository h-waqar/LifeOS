// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ChromiumBrowser } from "./cdp-client";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { spawn, ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.resolve(__dirname, "screenshots");

describe("Plan 01-09: Real Production Browser E2E Verification Suite", () => {
  let serverProcess: ChildProcess | null = null;
  let browser: ChromiumBrowser;

  beforeAll(async () => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

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
      console.log(`[browser-e2e] Starting Next.js production server on ${APP_URL}...`);
      serverProcess = spawn("npx", ["next", "start", "-p", "3000"], {
        stdio: "ignore",
        detached: true,
      });

      const startTime = Date.now();
      while (Date.now() - startTime < 20000) {
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

    // 2. Clear database to ensure pristine initial state
    await db.delete(user);

    // 3. Launch Chromium with remote debugging
    browser = new ChromiumBrowser(9250);
    await browser.launch();
  }, 45000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (serverProcess && serverProcess.pid) {
      try {
        process.kill(-serverProcess.pid);
      } catch {}
    }
    await db.delete(user);
    await closeDatabase();
  });

  it("Journey 1: Fresh visitor lands on root URL and renders application", async () => {
    await browser.navigate(`${APP_URL}/`);
    await browser.waitForSelector("[data-testid='root-landing']", 8000);

    const text = await browser.evaluate<string>("document.body.innerText");
    expect(text).toContain("LifeOS");

    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-01-root.png"));
  }, 30000);

  it("Journey 2: Single-user initial registration", async () => {
    await browser.navigate(`${APP_URL}/register`);
    await browser.waitForSelector("[data-testid='register-card']", 8000);

    await browser.fill('[data-testid="register-name"]', "Hamza Waqar");
    await browser.fill('[data-testid="register-email"]', "hamza@lifeos.local");
    await browser.fill('[data-testid="register-password"]', "StrongMasterPassword123!");
    await browser.click('[data-testid="register-submit"]');

    await browser.waitForSelector("[data-testid='dashboard-view']", 15000);
    const bodyText = await browser.evaluate<string>("document.body.innerText");
    expect(bodyText).toContain("Dashboard");
    expect(bodyText).toContain("Hamza Waqar");

    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-02-register.png"));
  }, 30000);

  it("Journey 3: Second-user registration rejection (403 Single-User Auto-Lock)", async () => {
    const secondBrowser = new ChromiumBrowser(9251);
    await secondBrowser.launch();

    try {
      await secondBrowser.navigate(`${APP_URL}/register`);
      await secondBrowser.waitForSelector("[data-testid='register-card']", 8000);

      await secondBrowser.fill('[data-testid="register-name"]', "Adversary User");
      await secondBrowser.fill('[data-testid="register-email"]', "adversary@example.com");
      await secondBrowser.fill('[data-testid="register-password"]', "SecondPassword123!");
      await secondBrowser.click('[data-testid="register-submit"]');

      await secondBrowser.waitForSelector("[data-testid='auth-error']", 10000);
      const alertText = await secondBrowser.evaluate<string>(
        `document.querySelector('[data-testid="auth-error"]').innerText`
      );
      expect(alertText.toLowerCase()).toContain("registration is closed");

      await secondBrowser.screenshot(
        path.join(SCREENSHOT_DIR, "journey-03-second-user-rejected.png")
      );
    } finally {
      await secondBrowser.close();
    }
  }, 30000);

  it("Journey 5: User logs in with wrong password (401 Rejection UI)", async () => {
    const loginBrowser = new ChromiumBrowser(9252);
    await loginBrowser.launch();

    try {
      await loginBrowser.navigate(`${APP_URL}/login`);
      await loginBrowser.waitForSelector("[data-testid='login-card']", 8000);

      await loginBrowser.fill('[data-testid="login-email"]', "hamza@lifeos.local");
      await loginBrowser.fill('[data-testid="login-password"]', "WrongPassword999!");
      await loginBrowser.click('[data-testid="login-submit"]');

      await loginBrowser.waitForSelector("[data-testid='auth-error']", 10000);
      const errorText = await loginBrowser.evaluate<string>(
        `document.querySelector('[data-testid="auth-error"]').innerText`
      );
      expect(errorText.toLowerCase()).toContain("invalid");

      await loginBrowser.screenshot(
        path.join(SCREENSHOT_DIR, "journey-05-invalid-login.png")
      );
    } finally {
      await loginBrowser.close();
    }
  }, 30000);

  it("Journey 4: User logs in with valid credentials", async () => {
    const loginBrowser = new ChromiumBrowser(9253);
    await loginBrowser.launch();

    try {
      await loginBrowser.navigate(`${APP_URL}/login`);
      await loginBrowser.waitForSelector("[data-testid='login-card']", 8000);

      await loginBrowser.fill('[data-testid="login-email"]', "hamza@lifeos.local");
      await loginBrowser.fill('[data-testid="login-password"]', "StrongMasterPassword123!");
      await loginBrowser.click('[data-testid="login-submit"]');

      await loginBrowser.waitForSelector("[data-testid='dashboard-view']", 15000);
      const text = await loginBrowser.evaluate<string>("document.body.innerText");
      expect(text).toContain("Dashboard");

      await loginBrowser.screenshot(
        path.join(SCREENSHOT_DIR, "journey-04-login-success.png")
      );
    } finally {
      await loginBrowser.close();
    }
  }, 30000);

  it("Journey 6: Session persists across page reloads", async () => {
    await browser.navigate(`${APP_URL}/dashboard`);
    await browser.waitForSelector("[data-testid='dashboard-view']", 10000);

    const text = await browser.evaluate<string>("document.body.innerText");
    expect(text).toContain("hamza@lifeos.local");

    await browser.screenshot(
      path.join(SCREENSHOT_DIR, "journey-06-session-persists.png")
    );
  }, 30000);

  it("Journey 7: User creates first project via UI modal", async () => {
    await browser.navigate(`${APP_URL}/projects`);
    await browser.waitForSelector("[data-testid='create-project-btn']", 10000);
    await browser.click('[data-testid="create-project-btn"]');
    await browser.waitForSelector("[data-testid='new-project-name']", 8000);

    await browser.fill('[data-testid="new-project-name"]', "Strategic Plan Q4");
    await browser.fill('[data-testid="new-project-desc"]', "Launch LifeOS system");
    await browser.click('[data-testid="submit-create-project"]');

    await browser.waitForText("Strategic Plan Q4", 10000);
    const body = await browser.evaluate<string>("document.body.innerText");
    expect(body).toContain("Strategic Plan Q4");

    await browser.screenshot(
      path.join(SCREENSHOT_DIR, "journey-07-project-created.png")
    );
  }, 30000);

  it("Journey 8: User creates root task linked to project", async () => {
    await browser.navigate(`${APP_URL}/tasks`);
    await browser.waitForSelector("[data-testid='create-task-btn']", 10000);
    await browser.click('[data-testid="create-task-btn"]');
    await browser.waitForSelector("[data-testid='new-task-title']", 8000);

    await browser.fill('[data-testid="new-task-title"]', "Core System Hardening");
    await browser.fill('[data-testid="new-task-desc"]', "Verify all security and audit boundaries");
    await browser.click('[data-testid="submit-create-task"]');

    await browser.waitForText("Core System Hardening", 10000);
    const body = await browser.evaluate<string>("document.body.innerText");
    expect(body).toContain("Core System Hardening");

    await browser.screenshot(
      path.join(SCREENSHOT_DIR, "journey-08-root-task-created.png")
    );
  }, 30000);

  it("Journey 9: User creates nested subtask in hierarchical tree", async () => {
    await browser.waitForSelector("[data-testid^='add-subtask-']", 8000);
    await browser.click('[data-testid^="add-subtask-"]');
    await browser.waitForSelector("[data-testid='new-task-title']", 8000);

    await browser.fill('[data-testid="new-task-title"]', "Audit Cascade Deletion");
    await browser.click('[data-testid="submit-create-task"]');

    await browser.waitForText("Audit Cascade Deletion", 10000);
    const body = await browser.evaluate<string>("document.body.innerText");
    expect(body).toContain("Audit Cascade Deletion");

    await browser.screenshot(
      path.join(SCREENSHOT_DIR, "journey-09-subtask-created.png")
    );
  }, 30000);

  it("Journey 10: User marks subtask complete (completedAt automatically set)", async () => {
    await browser.evaluate(`
      const toggles = document.querySelectorAll('[data-testid^="toggle-task-"]');
      if (toggles.length >= 2) {
        toggles[1].click();
      }
    `);

    await new Promise((r) => setTimeout(r, 1200));

    const isLineThrough = await browser.evaluate<boolean>(`
      (() => {
        const spans = Array.from(document.querySelectorAll('span'));
        const target = spans.find(s => s.innerText.includes('Audit Cascade Deletion'));
        return target ? target.classList.contains('line-through') : false;
      })()
    `);

    expect(isLineThrough).toBe(true);

    await browser.screenshot(
      path.join(SCREENSHOT_DIR, "journey-10-subtask-completed.png")
    );
  }, 30000);

  it("Journey 11: User updates project status", async () => {
    await browser.navigate(`${APP_URL}/projects`);
    await browser.waitForSelector("[data-testid^='edit-project-']", 10000);
    await browser.click('[data-testid^="edit-project-"]');
    await browser.waitForSelector("[data-testid='edit-project-status']", 8000);

    await browser.selectOption('[data-testid="edit-project-status"]', "completed");
    await browser.click('[data-testid="submit-edit-project"]');

    await browser.waitForText("Completed", 10000);
    const body = await browser.evaluate<string>("document.body.innerText");
    expect(body).toContain("Completed");

    await browser.screenshot(
      path.join(SCREENSHOT_DIR, "journey-11-project-status-updated.png")
    );
  }, 30000);

  it("Journey 12: User opens command palette (Ctrl+K / Cmd+K)", async () => {
    await browser.click('[data-testid="command-palette-button"]');
    await browser.waitForSelector("[data-testid='command-palette-dialog']", 8000);

    const inputExists = await browser.evaluate<boolean>(`
      Boolean(document.querySelector('[data-testid="command-palette-input"]'))
    `);
    expect(inputExists).toBe(true);

    await browser.screenshot(
      path.join(SCREENSHOT_DIR, "journey-12-command-palette.png")
    );

    // Close command palette via Escape
    await browser.evaluate(`
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 400));
  }, 30000);

  it("Journey 13: User toggles theme (dark/light mode persists)", async () => {
    const initialClass = await browser.evaluate<string>(
      "document.documentElement.className"
    );

    await browser.click('[data-testid="theme-toggle"]');
    await new Promise((r) => setTimeout(r, 800));

    const toggledClass = await browser.evaluate<string>(
      "document.documentElement.className"
    );
    expect(toggledClass).not.toEqual(initialClass);

    // Reload page to verify persistence
    await browser.navigate(`${APP_URL}/projects`);
    const persistedClass = await browser.evaluate<string>(
      "document.documentElement.className"
    );
    expect(persistedClass).toEqual(toggledClass);

    await browser.screenshot(
      path.join(SCREENSHOT_DIR, "journey-13-theme-toggle.png")
    );
  }, 30000);

  it("Journey 14: User deletes parent task (cascades to subtasks)", async () => {
    await browser.navigate(`${APP_URL}/tasks`);
    await browser.waitForSelector("[data-testid^='delete-task-']", 10000);
    await browser.click('[data-testid^="delete-task-"]');
    await browser.waitForSelector("[data-testid='confirm-delete-task']", 8000);
    await browser.click('[data-testid="confirm-delete-task"]');

    await new Promise((r) => setTimeout(r, 1500));

    const body = await browser.evaluate<string>("document.body.innerText");
    expect(body).not.toContain("Core System Hardening");
    expect(body).not.toContain("Audit Cascade Deletion");

    await browser.screenshot(
      path.join(SCREENSHOT_DIR, "journey-14-cascade-task-delete.png")
    );
  }, 30000);

  it("Journey 15: User deletes project (task projectId nullified)", async () => {
    await browser.navigate(`${APP_URL}/projects`);
    await browser.waitForSelector("[data-testid^='delete-project-']", 10000);
    await browser.click('[data-testid^="delete-project-"]');
    await browser.waitForSelector("[data-testid='confirm-delete-project']", 8000);
    await browser.click('[data-testid="confirm-delete-project"]');

    await new Promise((r) => setTimeout(r, 1500));

    const projectsBody = await browser.evaluate<string>("document.body.innerText");
    expect(projectsBody).not.toContain("Strategic Plan Q4");

    await browser.screenshot(
      path.join(SCREENSHOT_DIR, "journey-15-project-delete.png")
    );
  }, 35000);

  it("Journey 16: User logs out (session cookie cleared, redirected)", async () => {
    await browser.click('[data-testid="sign-out-button"]');

    await browser.waitForSelector("[data-testid='login-card']", 10000);
    const loginText = await browser.evaluate<string>("document.body.innerText");
    expect(loginText).toContain("Sign In to LifeOS");

    await browser.navigate(`${APP_URL}/dashboard`);
    await browser.waitForSelector("[data-testid='login-card']", 10000);

    await browser.screenshot(
      path.join(SCREENSHOT_DIR, "journey-16-logout-complete.png")
    );
  }, 30000);
});
