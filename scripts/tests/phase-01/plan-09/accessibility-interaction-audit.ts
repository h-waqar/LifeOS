import { EnhancedChromiumBrowser } from "./enhanced-cdp";
import { db, closeDatabase } from "@/server/db";
import { user, account } from "@/server/db/schema/auth";
import { hashPassword } from "better-auth/crypto";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_URL = process.env.APP_URL || "http://localhost:3000";

async function runInteractiveAccessibilityAudit() {
  console.log("=== Starting Live Browser Accessibility & Interaction Verification ===");
  const browser = new EnhancedChromiumBrowser(9275);
  await browser.launch({ windowSize: "1440,900", headless: true });

  const auditResults: Record<string, any> = {};

  try {
    // 0. Ensure user account exists for authentication
    const users = await db.select().from(user);
    if (users.length === 0) {
      console.log("-> 0. Seeding initial user for audit");
      const userId = crypto.randomUUID();
      const hashedPassword = await hashPassword("StrongMasterPassword123!");
      await db.insert(user).values({
        id: userId,
        name: "Hamza Waqar",
        email: "hamza@lifeos.local",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.insert(account).values({
        id: crypto.randomUUID(),
        userId,
        accountId: userId,
        providerId: "credential",
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Clear session cookies so /login tests unauthenticated interaction
    try {
      await browser.send("Network.clearBrowserCookies");
    } catch {}

    // 1. Keyboard Navigation & Focus Ring on /login
    console.log("-> 1. Testing Keyboard Navigation on /login");
    await browser.navigate(`${APP_URL}/login`);
    await browser.waitForSelector("[data-testid='login-card']", 8000);

    // Press Tab and inspect document.activeElement
    const tabOrder: string[] = [];
    for (let i = 0; i < 5; i++) {
      await browser.pressKey("Tab");
      await new Promise((r) => setTimeout(r, 100));
      const activeEl = await browser.evaluate<any>(`(() => {
        const el = document.activeElement;
        return {
          tagName: el?.tagName,
          testId: el?.getAttribute('data-testid'),
          id: el?.id,
          type: el?.getAttribute('type'),
          text: el?.textContent?.trim().slice(0, 30),
          className: el?.className
        };
      })()`);
      tabOrder.push(`${activeEl.tagName} (testId: ${activeEl.testId || activeEl.id || activeEl.text || 'none'})`);
    }
    auditResults.loginTabOrder = tabOrder;
    console.log("Login Tab Order:", tabOrder);

    // Form label associations on /login
    const loginFormLabels = await browser.evaluate<any>(`(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return inputs.map(input => {
        const id = input.id;
        const label = id ? document.querySelector('label[for="' + id + '"]') : null;
        const parentLabel = input.closest('label');
        const ariaLabel = input.getAttribute('aria-label');
        const ariaLabelledBy = input.getAttribute('aria-labelledby');
        return {
          id,
          name: input.name,
          type: input.type,
          hasLabelFor: !!label,
          labelText: label ? label.textContent?.trim() : (parentLabel ? parentLabel.textContent?.trim() : null),
          ariaLabel,
          ariaLabelledBy,
          isAccessible: !!(label || parentLabel || ariaLabel || ariaLabelledBy)
        };
      });
    })()`);
    auditResults.loginFormLabels = loginFormLabels;
    console.log("Login Form Labels Associated:", loginFormLabels);

    // 2. Login and test Modal Focus Trap & Keyboard Navigation
    console.log("-> 2. Authenticating & Testing Modal Focus Trap");
    await browser.fill('[data-testid="login-email"]', "hamza@lifeos.local");
    await browser.fill('[data-testid="login-password"]', "StrongMasterPassword123!");
    await browser.click('[data-testid="login-submit"]');
    await browser.waitForSelector("[data-testid='dashboard-view']", 15000);

    // Open "New Task" modal
    await browser.click('[data-testid="quick-add-task-btn"]');
    await browser.waitForSelector("input[placeholder*='What needs to be done?']", 8000);

    // Verify modal ARIA attributes
    const modalAria = await browser.evaluate<any>(`(() => {
      const modal = document.querySelector('[role="dialog"]');
      return {
        role: modal?.getAttribute('role'),
        ariaModal: modal?.getAttribute('aria-modal'),
        ariaLabelledby: modal?.getAttribute('aria-labelledby'),
        titleText: modal?.querySelector('h2, h3, [id]')?.textContent?.trim()
      };
    })()`);
    auditResults.modalAria = modalAria;
    console.log("Modal ARIA attributes:", modalAria);

    // Verify focus trap: Tab 10 times and verify focus never escapes the modal
    let escapedModal = false;
    const modalElementsVisited: string[] = [];
    for (let i = 0; i < 8; i++) {
      await browser.pressKey("Tab");
      await new Promise((r) => setTimeout(r, 100));
      const inside = await browser.evaluate<any>(`(() => {
        const modal = document.querySelector('[role="dialog"]');
        const active = document.activeElement;
        const isInside = modal && modal.contains(active);
        return {
          isInside,
          tagName: active?.tagName,
          id: active?.id,
          placeholder: active?.getAttribute('placeholder') || active?.textContent?.trim().slice(0, 20)
        };
      })()`);
      if (!inside.isInside) {
        escapedModal = true;
      }
      modalElementsVisited.push(`${inside.tagName} (${inside.id || inside.placeholder})`);
    }
    auditResults.focusTrapMaintained = !escapedModal;
    auditResults.modalElementsVisited = modalElementsVisited;
    console.log("Focus Trap Maintained:", !escapedModal, "Visited:", modalElementsVisited);

    // Test Escape key dismissal
    await browser.pressKey("Escape");
    await new Promise((r) => setTimeout(r, 500));
    const modalClosed = await browser.evaluate<boolean>(`(() => {
      return document.querySelector('[role="dialog"]') === null;
    })()`);
    auditResults.modalDismissedOnEscape = modalClosed;
    console.log("Modal Dismissed On Escape:", modalClosed);

    // 3. Command Palette Keyboard Navigation
    console.log("-> 3. Testing Command Palette Keyboard Navigation");
    await browser.pressKey("k", "KeyK", 2);
    await new Promise((r) => setTimeout(r, 500));
    const paletteFocused = await browser.evaluate<any>(`(() => {
      const active = document.activeElement;
      return {
        tagName: active?.tagName,
        placeholder: active?.getAttribute('placeholder'),
        isInput: active?.tagName === 'INPUT'
      };
    })()`);
    auditResults.commandPaletteAutofocus = paletteFocused;
    console.log("Command Palette Autofocus:", paletteFocused);

    // Navigate with Down Arrow
    await browser.pressKey("ArrowDown");
    await new Promise((r) => setTimeout(r, 100));
    await browser.pressKey("ArrowDown");
    await new Promise((r) => setTimeout(r, 100));
    const activeCommand = await browser.evaluate<string>(`(() => {
      const selected = document.querySelector('[aria-selected="true"], [data-selected="true"]');
      return selected?.textContent?.trim() || 'none';
    })()`);
    auditResults.activeCommandArrowNav = activeCommand;
    console.log("Selected Command after ArrowDown:", activeCommand);

    // Dismiss Palette
    await browser.pressKey("Escape");
    await new Promise((r) => setTimeout(r, 400));

    // 4. Color Contrast Audit in Dark & Light Modes
    console.log("-> 4. Checking Color Contrast Ratios");
    const getContrast = `(() => {
      function getLuminance(r, g, b) {
        const a = [r, g, b].map(v => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
      }
      function parseRgb(colorStr) {
        const m = colorStr.match(/\\d+/g);
        if (!m || m.length < 3) return [0, 0, 0];
        return [parseInt(m[0]), parseInt(m[1]), parseInt(m[2])];
      }
      function getRatio(fg, bg) {
        const l1 = getLuminance(...parseRgb(fg));
        const l2 = getLuminance(...parseRgb(bg));
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        return Math.round(ratio * 100) / 100;
      }

      const body = document.body;
      const bodyBg = window.getComputedStyle(body).backgroundColor;
      const h1 = document.querySelector('h1, [class*="text-2xl"]') || document.body;
      const h1Color = window.getComputedStyle(h1).color;
      const p = document.querySelector('p, [class*="text-muted"]') || document.body;
      const pColor = window.getComputedStyle(p).color;

      return {
        bodyBg,
        headingColor: h1Color,
        headingContrast: getRatio(h1Color, bodyBg),
        mutedColor: pColor,
        mutedContrast: getRatio(pColor, bodyBg)
      };
    })()`;

    const darkContrast = await browser.evaluate<any>(getContrast);
    auditResults.darkContrast = darkContrast;
    console.log("Dark Mode Contrast:", darkContrast);

    // Toggle Light Mode and check contrast
    await browser.evaluate(`document.documentElement.classList.remove('dark');`);
    await new Promise((r) => setTimeout(r, 400));
    const lightContrast = await browser.evaluate<any>(getContrast);
    auditResults.lightContrast = lightContrast;
    console.log("Light Mode Contrast:", lightContrast);

    // Restore dark mode
    await browser.evaluate(`document.documentElement.classList.add('dark');`);

    console.log("\n=== Accessibility & Interaction Audit Summary ===");
    console.log(JSON.stringify(auditResults, null, 2));

    const outPath1 = path.join(__dirname, "../../../../.human-loop/artifacts/plan-01-09/logs/accessibility-interaction-audit.json");
    const outPath2 = path.join(__dirname, "../../../../.human-loop/artifacts/plan-01-09/accessibility-interaction-audit.json");
    fs.writeFileSync(outPath1, JSON.stringify(auditResults, null, 2));
    fs.writeFileSync(outPath2, JSON.stringify(auditResults, null, 2));
    console.log(`Saved audit results to: ${outPath1} and ${outPath2}`);

  } finally {
    await browser.close();
    await closeDatabase();
  }
}

runInteractiveAccessibilityAudit().catch(console.error);
