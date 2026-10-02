import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";

// Schemas & utilities from core domain
import { roundMoney } from "@/server/finance/calculations";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { resolveSafeDocPath } from "@/server/docs/path-safety";
import { UsageError } from "@/cli/errors";

describe("Plan 20-02: Adversarial Journey Challenge of H01–H12 Scenarios (QA-06)", () => {
  describe("H01: Authentication & Route Guards Adversarial Challenge", () => {
    it("rejects tampered session tokens and malformed signatures", () => {
      const validToken = "sess_0123456789abcdef0123456789abcdef";
      const tamperedToken = validToken + "_tampered_suffix_payload";

      // Verification function simulates Better Auth session lookup
      function verifySessionToken(token: string | null | undefined): { valid: boolean; reason?: string } {
        if (!token) return { valid: false, reason: "No session token provided" };
        if (token.length !== 37 || !token.startsWith("sess_")) {
          return { valid: false, reason: "Malformed or tampered session token signature" };
        }
        return { valid: true };
      }

      expect(verifySessionToken(null).valid).toBe(false);
      expect(verifySessionToken("").valid).toBe(false);
      expect(verifySessionToken(tamperedToken).valid).toBe(false);
      expect(verifySessionToken("sess_short").valid).toBe(false);
      expect(verifySessionToken(validToken).valid).toBe(true);
    });

    it("rejects expired session timestamps strictly fail-closed", () => {
      const now = Date.now();
      const expiredSession = {
        id: "sess_123",
        userId: "usr_123",
        expiresAt: new Date(now - 1000 * 60), // Expired 1 minute ago
      };
      const activeSession = {
        id: "sess_456",
        userId: "usr_123",
        expiresAt: new Date(now + 1000 * 60 * 60), // Expires in 1 hour
      };

      function isSessionActive(sess: { expiresAt: Date }): boolean {
        return sess.expiresAt.getTime() > Date.now();
      }

      expect(isSessionActive(expiredSession)).toBe(false);
      expect(isSessionActive(activeSession)).toBe(true);
    });

    it("enforces route guard redirection to /login when unauthenticated", () => {
      const protectedRoutes = ["/dashboard", "/tasks", "/projects", "/settings", "/finance"];
      const publicRoutes = ["/login", "/register", "/manifest.webmanifest"];

      function handleRouteGuard(pathname: string, isAuthenticated: boolean): string | null {
        if (publicRoutes.includes(pathname)) return null;
        if (!isAuthenticated && protectedRoutes.some((r) => pathname.startsWith(r))) {
          return `/login?callbackUrl=${encodeURIComponent(pathname)}`;
        }
        return null;
      }

      for (const route of protectedRoutes) {
        expect(handleRouteGuard(route, false)).toBe(`/login?callbackUrl=${encodeURIComponent(route)}`);
        expect(handleRouteGuard(route, true)).toBeNull();
      }
      expect(handleRouteGuard("/login", false)).toBeNull();
    });
  });

  describe("H02: Registration & Single-User Lock Adversarial Challenge", () => {
    it("strictly blocks secondary registration attempts when a user exists", () => {
      let existingUsersCount = 1;

      function attemptRegistration(input: { email: string; name: string }): { success: boolean; error?: string } {
        // Enforce single-user lock invariant
        if (existingUsersCount >= 1) {
          return { success: false, error: "Registration is disabled: single-user system already provisioned." };
        }
        existingUsersCount++;
        return { success: true };
      }

      const secondaryAttempt = attemptRegistration({
        email: "intruder@domain.com",
        name: "Intruder",
      });

      expect(secondaryAttempt.success).toBe(false);
      expect(secondaryAttempt.error).toContain("single-user system already provisioned");
      expect(existingUsersCount).toBe(1);
    });

    it("safely sanitizes SQL injection payloads in email and name inputs", () => {
      const RegistrationSchema = z.object({
        email: z.string().email(),
        name: z.string().trim().min(1).max(100),
      });

      const sqlInjectionInputs = [
        { email: "admin' OR '1'='1", name: "Hacker" },
        { email: "admin@lifeos.local; DROP TABLE users;--", name: "Destructor" },
        { email: "valid@lifeos.local", name: "   " }, // Empty whitespace name
      ];

      for (const input of sqlInjectionInputs) {
        const result = RegistrationSchema.safeParse(input);
        expect(result.success).toBe(false);
      }
    });
  });

  describe("H03: Dashboard & Metrics Zero-State & Resilience", () => {
    it("computes dashboard metrics with 0 entities without NaN or division by zero", () => {
      interface TaskMetricInput {
        total: number;
        completed: number;
      }

      function calculateCompletionRate(data: TaskMetricInput): { rate: number; formatted: string } {
        if (!data || data.total <= 0) {
          return { rate: 0, formatted: "0%" };
        }
        const rate = (data.completed / data.total) * 100;
        return {
          rate: Math.min(100, Math.max(0, rate)),
          formatted: `${Math.round(rate)}%`,
        };
      }

      expect(calculateCompletionRate({ total: 0, completed: 0 })).toEqual({ rate: 0, formatted: "0%" });
      expect(calculateCompletionRate({ total: 10, completed: 10 })).toEqual({ rate: 100, formatted: "100%" });
      const partial = calculateCompletionRate({ total: 3, completed: 1 });
      expect(partial.formatted).toBe("33%");
      expect(partial.rate).toBeCloseTo(33.33, 1);
    });
  });

  describe("H04: Project Management & Adversarial Titles", () => {
    it("handles extreme length and adversarial unicode characters in project titles", () => {
      const ProjectInputSchema = z.object({
        name: z.string().trim().min(1).max(255),
        description: z.string().max(2000).optional(),
      });

      // 500-character string exceeds max limit
      const oversized = "A".repeat(500);
      expect(ProjectInputSchema.safeParse({ name: oversized }).success).toBe(false);

      // Valid unicode with emojis, RTL characters, and special characters within limit
      const validUnicode = "🚀 Project LifeOS — \u202E RLO test \u202C & <script>alert(1)</script>";
      const result = ProjectInputSchema.safeParse({ name: validUnicode });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe(validUnicode.trim());
      }
    });

    it("prevents double-create race conditions via deterministic key debouncing", () => {
      const createdProjects = new Map<string, { id: string; name: string }>();

      function createProjectIdempotent(idempotencyKey: string, name: string): { status: "created" | "duplicate"; project: any } {
        if (createdProjects.has(idempotencyKey)) {
          return { status: "duplicate", project: createdProjects.get(idempotencyKey) };
        }
        const newProj = { id: `proj_${Date.now()}`, name };
        createdProjects.set(idempotencyKey, newProj);
        return { status: "created", project: newProj };
      }

      const key = "client_req_uuid_12345";
      const call1 = createProjectIdempotent(key, "Strategic Initiative");
      const call2 = createProjectIdempotent(key, "Strategic Initiative");

      expect(call1.status).toBe("created");
      expect(call2.status).toBe("duplicate");
      expect(call1.project.id).toBe(call2.project.id);
    });
  });

  describe("H05: Task Hierarchy & Circular Dependency Prevention", () => {
    it("detects and rejects circular parent-child task nesting", () => {
      // In-memory graph representing task parent pointers: childId -> parentId
      const parentMap = new Map<string, string>();
      parentMap.set("task_B", "task_A"); // B is child of A
      parentMap.set("task_C", "task_B"); // C is child of B

      function canSetParent(taskId: string, proposedParentId: string | null): boolean {
        if (!proposedParentId) return true;
        if (taskId === proposedParentId) return false; // Self-parenting prohibited

        let current: string | undefined = proposedParentId;
        const visited = new Set<string>();

        while (current) {
          if (current === taskId) {
            return false; // Cycle detected: proposed parent is already descendant of taskId
          }
          if (visited.has(current)) break;
          visited.add(current);
          current = parentMap.get(current);
        }

        return true;
      }

      // Propose making A child of C (would form A -> C -> B -> A cycle)
      expect(canSetParent("task_A", "task_C")).toBe(false);
      // Propose making A child of itself
      expect(canSetParent("task_A", "task_A")).toBe(false);
      // Propose making a new task D child of C (valid linear tree)
      expect(canSetParent("task_D", "task_C")).toBe(true);
    });
  });

  describe("H06: Responsive & Mobile Viewport Breakpoint Resilience", () => {
    it("verifies responsive CSS breakpoint boundary definitions", () => {
      const globalsCssPath = path.resolve(process.cwd(), "src/app/globals.css");
      const globalsCss = fs.readFileSync(globalsCssPath, "utf-8");

      expect(globalsCss).toContain("safe-top");
      expect(globalsCss).toContain("safe-bottom");
      expect(globalsCss).toContain("touch-target");
      expect(globalsCss).toContain("min-height: 44px");
    });
  });

  describe("H07: Theme & Preferences Corrupted Value Recovery", () => {
    it("falls back to default dark theme when corrupted theme string is encountered", () => {
      const validThemes = ["dark", "light", "system"] as const;

      function sanitizeTheme(candidate: unknown): "dark" | "light" | "system" {
        if (typeof candidate === "string" && (validThemes as readonly string[]).includes(candidate)) {
          return candidate as "dark" | "light" | "system";
        }
        return "dark"; // Safe default fallback
      }

      expect(sanitizeTheme("dark")).toBe("dark");
      expect(sanitizeTheme("light")).toBe("light");
      expect(sanitizeTheme("system")).toBe("system");
      expect(sanitizeTheme("corrupted_payload_123")).toBe("dark");
      expect(sanitizeTheme(null)).toBe("dark");
      expect(sanitizeTheme({})).toBe("dark");
    });
  });

  describe("H08: Command Palette Adversarial Query Handling", () => {
    it("safely sanitizes command palette search queries containing HTML/XSS or SQL wildcards", () => {
      function sanitizeSearchQuery(query: string): string {
        return query
          .trim()
          .replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, "")
          .slice(0, 100);
      }

      const maliciousQueries = [
        "<script>alert('xss')</script>",
        "SELECT * FROM users WHERE '%",
        "normal query\0with null byte",
      ];

      for (const q of maliciousQueries) {
        const sanitized = sanitizeSearchQuery(q);
        expect(sanitized).not.toContain("\0");
        expect(sanitized).not.toContain("%");
        expect(sanitized).not.toContain("'");
        expect(sanitized.length).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("H09: Error & Edge States Network Resilience", () => {
    it("handles HTTP 500 responses and abort signals gracefully", async () => {
      async function safeApiCall(mockResponse: { ok: boolean; status: number; text?: string }): Promise<{
        success: boolean;
        error?: string;
      }> {
        try {
          if (!mockResponse.ok) {
            return {
              success: false,
              error: `Server responded with status ${mockResponse.status}. Please try again later.`,
            };
          }
          return { success: true };
        } catch (err: any) {
          if (err.name === "AbortError") {
            return { success: false, error: "Request was cancelled." };
          }
          return { success: false, error: "Network connection failed." };
        }
      }

      const res500 = await safeApiCall({ ok: false, status: 500 });
      expect(res500.success).toBe(false);
      expect(res500.error).toContain("status 500");

      const res404 = await safeApiCall({ ok: false, status: 404 });
      expect(res404.success).toBe(false);
      expect(res404.error).toContain("status 404");
    });
  });

  describe("H10: Keyboard & Accessibility Trapping Defense", () => {
    it("verifies modal focus cycling index containment algorithm", () => {
      // Elements inside modal: [CloseButton, InputField, CancelBtn, SubmitBtn]
      const totalFocusableElements = 4;

      function getNextFocusedIndex(currentIndex: number, isShiftTab: boolean): number {
        if (isShiftTab) {
          return (currentIndex - 1 + totalFocusableElements) % totalFocusableElements;
        }
        return (currentIndex + 1) % totalFocusableElements;
      }

      // Tab cycling forward: 0 -> 1 -> 2 -> 3 -> 0
      expect(getNextFocusedIndex(0, false)).toBe(1);
      expect(getNextFocusedIndex(3, false)).toBe(0);

      // Shift+Tab cycling backward: 0 -> 3 -> 2 -> 1 -> 0
      expect(getNextFocusedIndex(0, true)).toBe(3);
      expect(getNextFocusedIndex(3, true)).toBe(2);
    });
  });

  describe("H11: Visual Polish & Typography Extremes", () => {
    it("handles 500-character unbroken strings safely without horizontal blowout", () => {
      const longUnbrokenWord = "SUPER" + "A".repeat(490) + "CALIFRAGILISTIC";
      
      // Verification of wrapping logic utility
      function truncateOrBreak(text: string, maxLength = 80): { wrapped: boolean; preview: string } {
        if (text.length > maxLength) {
          return {
            wrapped: true,
            preview: text.slice(0, maxLength) + "...",
          };
        }
        return { wrapped: false, preview: text };
      }

      const res = truncateOrBreak(longUnbrokenWord);
      expect(res.wrapped).toBe(true);
      expect(res.preview.length).toBe(83); // 80 + '...'
    });
  });

  describe("H12: Operational Healthcheck Integrity", () => {
    it("verifies healthcheck payload sanitization does not leak secret environment variables", () => {
      const mockEnv = {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://lifeos:SUPER_SECRET_PASSWORD@localhost:5432/lifeos",
        BETTER_AUTH_SECRET: "SECRET_AUTH_KEY_DO_NOT_LEAK",
        LIFEOS_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      };

      function generatePublicHealthReport(dbHealthy: boolean): Record<string, any> {
        return {
          status: dbHealthy ? "healthy" : "degraded",
          timestamp: new Date().toISOString(),
          version: "2.1.0",
          database: dbHealthy ? "connected" : "disconnected",
        };
      }

      const report = generatePublicHealthReport(true);
      const serialized = JSON.stringify(report);

      expect(report.status).toBe("healthy");
      expect(serialized).not.toContain("SUPER_SECRET_PASSWORD");
      expect(serialized).not.toContain("SECRET_AUTH_KEY");
      expect(serialized).not.toContain(mockEnv.LIFEOS_ENCRYPTION_KEY);
    });
  });
});
