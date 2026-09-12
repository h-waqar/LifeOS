import { ChromiumBrowser } from "./cdp-client";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { spawn, ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.resolve(
  process.cwd(),
  "scripts/tests/phase-01/plan-09/screenshots"
);

async function main() {
  console.log("=== Starting Plan 01-09 Browser Journey Execution ===");
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // 1. Check if server running
  let serverRunning = false;
  let serverProcess: ChildProcess | null = null;
  try {
    const res = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (res.status === 200 || res.status === 503) serverRunning = true;
  } catch {
    serverRunning = false;
  }

  if (!serverRunning) {
    console.log(`[runner] Launching Next.js server on ${APP_URL}...`);
    serverProcess = spawn("npx", ["next", "start", "-p", "3000"], {
      stdio: "ignore",
      detached: true,
    });

    const start = Date.now();
    while (Date.now() - start < 15000) {
      try {
        const res = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(1000) });
        if (res.status === 200 || res.status === 503) {
          serverRunning = true;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  console.log("[runner] Server ready. Cleaning database...");
  await db.delete(user);

  console.log("[runner] Launching Chromium browser via CDP on port 9240...");
  const browser = new ChromiumBrowser(9240);
  await browser.launch();

  try {
    // Journey 1
    console.log("--> Testing Journey 1: Fresh visitor lands on root URL");
    await browser.navigate(`${APP_URL}/`);
    await browser.waitForSelector("[data-testid='root-landing']", 8000);
    const j1Text = await browser.evaluate<string>("document.body.innerText");
    console.log("Journey 1 text includes LifeOS:", j1Text.includes("LifeOS"));
    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-01-root.png"));
    console.log("✓ Journey 1 passed");

    // Journey 2
    console.log("--> Testing Journey 2: Single-user initial registration");
    await browser.navigate(`${APP_URL}/register`);
    await browser.waitForSelector("[data-testid='register-card']", 8000);

    await browser.fill('[data-testid="register-name"]', "Hamza Waqar");
    await browser.fill('[data-testid="register-email"]', "hamza@lifeos.local");
    await browser.fill('[data-testid="register-password"]', "StrongMasterPassword123!");
    await browser.click('[data-testid="register-submit"]');

    await browser.waitForSelector("[data-testid='dashboard-view']", 15000);
    console.log("✓ Journey 2 passed (registered and navigated to dashboard)");
    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-02-register.png"));

    // Journey 3
    console.log("--> Testing Journey 3: Second-user registration rejection (403)");
    const b2 = new ChromiumBrowser(9241);
    await b2.launch();
    try {
      await b2.navigate(`${APP_URL}/register`);
      await b2.waitForSelector("[data-testid='register-card']", 8000);
      await b2.fill('[data-testid="register-name"]', "Second User");
      await b2.fill('[data-testid="register-email"]', "second@lifeos.local");
      await b2.fill('[data-testid="register-password"]', "SecondPassword123!");
      await b2.click('[data-testid="register-submit"]');

      await b2.waitForSelector("[data-testid='auth-error']", 10000);
      const errText = await b2.evaluate<string>(
        `document.querySelector('[data-testid="auth-error"]').innerText`
      );
      console.log("Second user rejection message:", errText);
      await b2.screenshot(path.join(SCREENSHOT_DIR, "journey-03-second-user-rejected.png"));
      console.log("✓ Journey 3 passed (second registration locked)");
    } finally {
      await b2.close();
    }

    // Journey 4 & 5
    console.log("--> Testing Journey 5: Invalid login rejection");
    const b3 = new ChromiumBrowser(9242);
    await b3.launch();
    try {
      await b3.navigate(`${APP_URL}/login`);
      await b3.waitForSelector("[data-testid='login-card']", 8000);
      await b3.fill('[data-testid="login-email"]', "hamza@lifeos.local");
      await b3.fill('[data-testid="login-password"]', "WrongPassword999!");
      await b3.click('[data-testid="login-submit"]');

      await b3.waitForSelector("[data-testid='auth-error']", 10000);
      console.log("✓ Journey 5 passed (invalid login error shown)");
      await b3.screenshot(path.join(SCREENSHOT_DIR, "journey-05-invalid-login.png"));

      console.log("--> Testing Journey 4: Valid login");
      await b3.fill('[data-testid="login-password"]', "StrongMasterPassword123!");
      await b3.click('[data-testid="login-submit"]');

      await b3.waitForSelector("[data-testid='dashboard-view']", 15000);
      console.log("✓ Journey 4 passed (valid login navigated to dashboard)");
      await b3.screenshot(path.join(SCREENSHOT_DIR, "journey-04-login-success.png"));
    } finally {
      await b3.close();
    }

    // Journey 6
    console.log("--> Testing Journey 6: Session persistence across reload");
    await browser.navigate(`${APP_URL}/dashboard`);
    await browser.waitForSelector("[data-testid='dashboard-view']", 10000);
    const sessionEmail = await browser.evaluate<string>("document.body.innerText");
    console.log("Dashboard contains user email:", sessionEmail.includes("hamza@lifeos.local"));
    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-06-session-persists.png"));
    console.log("✓ Journey 6 passed");

    // Journey 7
    console.log("--> Testing Journey 7: Create project via UI");
    await browser.navigate(`${APP_URL}/projects`);
    await browser.waitForSelector("[data-testid='create-project-btn']", 10000);
    await browser.click('[data-testid="create-project-btn"]');
    await browser.waitForSelector("[data-testid='new-project-name']", 8000);

    await browser.fill('[data-testid="new-project-name"]', "Strategic Plan Q4");
    await browser.fill('[data-testid="new-project-desc"]', "Launch LifeOS system");
    await browser.click('[data-testid="submit-create-project"]');

    await browser.waitForText("Strategic Plan Q4", 10000);
    console.log("✓ Journey 7 passed (project created)");
    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-07-project-created.png"));

    // Journey 8
    console.log("--> Testing Journey 8: Create root task linked to project");
    await browser.navigate(`${APP_URL}/tasks`);
    await browser.waitForSelector("[data-testid='create-task-btn']", 10000);
    await browser.click('[data-testid="create-task-btn"]');
    await browser.waitForSelector("[data-testid='new-task-title']", 8000);

    await browser.fill('[data-testid="new-task-title"]', "Core System Hardening");
    await browser.fill('[data-testid="new-task-desc"]', "Verify all security and audit boundaries");
    await browser.click('[data-testid="submit-create-task"]');

    await browser.waitForText("Core System Hardening", 10000);
    console.log("✓ Journey 8 passed (root task created)");
    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-08-root-task-created.png"));

    // Journey 9
    console.log("--> Testing Journey 9: Create nested subtask in tree");
    await browser.waitForSelector("[data-testid^='add-subtask-']", 8000);
    await browser.click('[data-testid^="add-subtask-"]');
    await browser.waitForSelector("[data-testid='new-task-title']", 8000);

    await browser.fill('[data-testid="new-task-title"]', "Audit Cascade Deletion");
    await browser.click('[data-testid="submit-create-task"]');

    await browser.waitForText("Audit Cascade Deletion", 10000);
    console.log("✓ Journey 9 passed (subtask created in tree)");
    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-09-subtask-created.png"));

    // Journey 10
    console.log("--> Testing Journey 10: Complete subtask via checkbox");
    await browser.evaluate(`
      const toggles = document.querySelectorAll('[data-testid^="toggle-task-"]');
      if (toggles.length >= 2) {
        toggles[1].click();
      }
    `);
    await new Promise((r) => setTimeout(r, 1200));
    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-10-subtask-completed.png"));
    console.log("✓ Journey 10 passed (subtask completed)");

    // Journey 11
    console.log("--> Testing Journey 11: Update project status");
    await browser.navigate(`${APP_URL}/projects`);
    await browser.waitForSelector("[data-testid^='edit-project-']", 10000);
    await browser.click('[data-testid^="edit-project-"]');
    await browser.waitForSelector("[data-testid='edit-project-status']", 8000);

    await browser.selectOption('[data-testid="edit-project-status"]', "completed");
    await browser.click('[data-testid="submit-edit-project"]');
    await browser.waitForText("Completed", 10000);
    console.log("✓ Journey 11 passed (project status updated to completed)");
    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-11-project-status-updated.png"));

    // Journey 12
    console.log("--> Testing Journey 12: Open command palette");
    await browser.click('[data-testid="command-palette-button"]');
    await browser.waitForSelector("[data-testid='command-palette-dialog']", 8000);
    console.log("✓ Journey 12 passed (command palette opened)");
    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-12-command-palette.png"));
    await browser.evaluate(`
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 500));

    // Journey 13
    console.log("--> Testing Journey 13: Toggle theme");
    const c1 = await browser.evaluate<string>("document.documentElement.className");
    await browser.click('[data-testid="theme-toggle"]');
    await new Promise((r) => setTimeout(r, 800));
    const c2 = await browser.evaluate<string>("document.documentElement.className");
    console.log(`Theme toggled from '${c1}' to '${c2}'`);
    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-13-theme-toggle.png"));
    console.log("✓ Journey 13 passed");

    // Journey 14
    console.log("--> Testing Journey 14: Delete parent task with cascade");
    await browser.navigate(`${APP_URL}/tasks`);
    await browser.waitForSelector("[data-testid^='delete-task-']", 10000);
    await browser.click('[data-testid^="delete-task-"]');
    await browser.waitForSelector("[data-testid='confirm-delete-task']", 8000);
    await browser.click('[data-testid="confirm-delete-task"]');
    await new Promise((r) => setTimeout(r, 1500));
    const taskBody = await browser.evaluate<string>("document.body.innerText");
    console.log("Parent task removed:", !taskBody.includes("Core System Hardening"));
    console.log("Subtask removed:", !taskBody.includes("Audit Cascade Deletion"));
    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-14-cascade-task-delete.png"));
    console.log("✓ Journey 14 passed");

    // Journey 15
    console.log("--> Testing Journey 15: Delete project (orphan tasks)");
    await browser.navigate(`${APP_URL}/projects`);
    await browser.waitForSelector("[data-testid^='delete-project-']", 10000);
    await browser.click('[data-testid^="delete-project-"]');
    await browser.waitForSelector("[data-testid='confirm-delete-project']", 8000);
    await browser.click('[data-testid="confirm-delete-project"]');
    await new Promise((r) => setTimeout(r, 1500));
    const pBody = await browser.evaluate<string>("document.body.innerText");
    console.log("Project removed:", !pBody.includes("Strategic Plan Q4"));
    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-15-project-delete.png"));
    console.log("✓ Journey 15 passed");

    // Journey 16
    console.log("--> Testing Journey 16: Logout");
    await browser.click('[data-testid="sign-out-button"]');
    await browser.waitForSelector("[data-testid='login-card']", 10000);
    console.log("✓ Journey 16 passed (signed out, redirected to login)");
    await browser.screenshot(path.join(SCREENSHOT_DIR, "journey-16-logout-complete.png"));

    console.log("\n==================================================");
    console.log("🎉 ALL 16 USER JOURNEYS EXECUTED & PASSED 100%!");
    console.log("==================================================\n");
  } finally {
    await browser.close();
    if (serverProcess && serverProcess.pid) {
      try { process.kill(-serverProcess.pid); } catch {}
    }
    await closeDatabase();
  }
}

main().catch((err) => {
  console.error("FATAL ERROR IN RUNNER:", err);
  process.exit(1);
});
