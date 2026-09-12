import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auditLog } from "@/server/db/schema/audit";
import { auth } from "@/server/auth";
import {
  GET as preferencesGet,
  PATCH as preferencesPatch,
  dynamic as preferencesDynamic,
} from "@/app/api/preferences/route";
import {
  updatePreferencesSchema,
} from "@/server/preferences/service";
import { createAuditLog } from "@/server/audit";
import { runAuthReset } from "../../../../scripts/auth-reset";
import nextConfig from "../../../../next.config";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

describe("Plan 01-06: Adversarial Application/API Security Boundary & Data-Access Audit", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "adv_plan06_user@example.com",
    password: "Plan06Password123!",
    name: "Plan06 Adversary",
  };

  let testUserId: string;
  let cookieHeader: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Clean any prior state
    await db.delete(user).where(eq(user.email, testUser.email));

    // Sign up test user
    const res = await auth.api.signUpEmail({
      body: {
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
      },
      asResponse: true,
    });

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie")!;
    const match = setCookie.match(/better-auth\.session_token=([^;]+)/);
    expect(match).toBeTruthy();
    cookieHeader = `better-auth.session_token=${match![1]}`;

    const userRows = await db.select().from(user).where(eq(user.email, testUser.email));
    expect(userRows.length).toBe(1);
    testUserId = userRows[0].id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user).where(eq(user.email, testUser.email));
      await closeDatabase();
    }
  });

  describe("Boundary 1: Caching, SSR & User Data Isolation (Section 10)", () => {
    it("exports dynamic = 'force-dynamic' to prevent static rendering of authenticated routes", () => {
      expect(preferencesDynamic).toBe("force-dynamic");
    });

    it("sets private, no-store Cache-Control headers on GET /api/preferences", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "GET",
        headers: { cookie: cookieHeader },
      });

      const res = await preferencesGet(req);
      expect(res.status).toBe(200);

      const cacheControl = res.headers.get("cache-control");
      expect(cacheControl).toBeDefined();
      expect(cacheControl).toContain("no-store");
      expect(cacheControl).toContain("no-cache");
      expect(cacheControl).toContain("must-revalidate");

      const pragma = res.headers.get("pragma");
      expect(pragma).toBe("no-cache");
    });

    it("sets private, no-store Cache-Control headers on PATCH /api/preferences", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({ theme: "dark" }),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(200);

      const cacheControl = res.headers.get("cache-control");
      expect(cacheControl).toBeDefined();
      expect(cacheControl).toContain("no-store");
      expect(cacheControl).toContain("no-cache");
    });
  });

  describe("Boundary 2: Resource Exhaustion & Payload Size Limits (Section 7)", () => {
    it("rejects oversized Content-Length header with 413 Payload Too Large", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
          "content-length": "65536", // 64KB exceeds 32KB limit
        },
        body: JSON.stringify({ theme: "dark" }),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error).toContain("Payload Too Large");
    });

    it("rejects actual oversized body payload exceeding 32KB with 413 Payload Too Large", async () => {
      if (!probe.isAvailable) return;

      // Create a payload larger than 32KB
      const hugePadding = "a".repeat(40 * 1024);
      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({ padding: hugePadding }),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(413);
    });
  });

  describe("Boundary 3: Content-Type Enforcement (Section 6 & 11)", () => {
    it("rejects missing Content-Type on PATCH with 415 Unsupported Media Type", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: cookieHeader,
          // Content-Type omitted
        },
        body: JSON.stringify({ theme: "dark" }),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(415);
      const data = await res.json();
      expect(data.error).toContain("Content-Type must be application/json");
    });

    it("rejects text/plain Content-Type on PATCH with 415 Unsupported Media Type", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: cookieHeader,
          "content-type": "text/plain",
        },
        body: JSON.stringify({ theme: "dark" }),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(415);
    });

    it("accepts application/json; charset=utf-8 Content-Type", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ theme: "system" }),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(200);
    });
  });

  describe("Boundary 4: Stored XSS & Input Sanitization in Preferences (Section 5 & 6)", () => {
    it("rejects HTML script tags in dateFormat (<script>alert(1)</script>)", () => {
      const parsed = updatePreferencesSchema.safeParse({
        dateFormat: "<script>alert(1)</script>",
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects HTML injection payloads in dateFormat (\"><img src=x onerror=...>)", () => {
      const parsed = updatePreferencesSchema.safeParse({
        dateFormat: "\"><img src=x onerror=alert(1)>",
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects control characters and null bytes in dateFormat", () => {
      expect(updatePreferencesSchema.safeParse({ dateFormat: "YYYY\u0000MM" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "YYYY\x1bMM" }).success).toBe(false);
    });

    it("accepts standard international date format strings", () => {
      expect(updatePreferencesSchema.safeParse({ dateFormat: "YYYY-MM-DD" }).success).toBe(true);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "DD/MM/YYYY" }).success).toBe(true);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "MM/DD/YYYY" }).success).toBe(true);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "YYYY.MM.DD" }).success).toBe(true);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "MMM D, YYYY" }).success).toBe(true);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "D MMMM YYYY" }).success).toBe(true);
    });

    it("rejects XSS attack against PATCH /api/preferences via API endpoint", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({ dateFormat: "<script>alert('xss')</script>" }),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Validation failed");
    });
  });

  describe("Boundary 5: Audit Log Sanitization & Header Bounding (Section 7 & 15)", () => {
    it("bounds and sanitizes oversized userAgent and ipAddress in createAuditLog", async () => {
      if (!probe.isAvailable) return;

      const hugeUserAgent = "Mozilla/" + "A".repeat(2000);
      const hugeIp = "192.168.1.1," + "9".repeat(1000);
      const actionName = "test.audit_bounds_" + crypto.randomUUID().slice(0, 8);

      await createAuditLog({
        userId: testUserId,
        category: "mutation",
        action: actionName,
        status: "success",
        ipAddress: hugeIp,
        userAgent: hugeUserAgent,
      });

      const rows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, actionName));

      expect(rows.length).toBe(1);
      expect(rows[0].ipAddress!.length).toBeLessThanOrEqual(128);
      expect(rows[0].userAgent!.length).toBeLessThanOrEqual(512);
    });

    it("validates that action is a non-empty string in createAuditLog", async () => {
      if (!probe.isAvailable) return;

      const beforeRows = await db.select().from(auditLog);
      const beforeCount = beforeRows.length;

      // An empty action should not create an invalid or untrackable audit row
      await createAuditLog({
        userId: testUserId,
        category: "security",
        action: "   ",
        status: "failure",
      });

      const afterRows = await db.select().from(auditLog);
      const afterCount = afterRows.length;

      expect(afterCount).toBe(beforeCount);
    });
  });

  describe("Boundary 6: Browser Security Headers in next.config.ts (Section 12)", () => {
    it("configures security headers in Next.js configuration", async () => {
      expect(typeof nextConfig.headers).toBe("function");
      const headersConfig = await nextConfig.headers!();
      expect(Array.isArray(headersConfig)).toBe(true);

      const rootHeaders = headersConfig.find((h) => h.source === "/:path*");
      expect(rootHeaders).toBeDefined();

      const headerMap = new Map(rootHeaders!.headers.map((h: { key: string; value: string }) => [h.key.toLowerCase(), h.value]));
      expect(headerMap.get("x-frame-options")).toBe("DENY");
      expect(headerMap.get("x-content-type-options")).toBe("nosniff");
      expect(headerMap.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(headerMap.get("permissions-policy")).toBeDefined();
      expect(headerMap.get("cross-origin-opener-policy")).toBe("same-origin");
    });
  });

  describe("Boundary 7: CLI Password Upper-Bound Boundary in auth-reset (Section 7)", () => {
    it("rejects password exceeding 128 characters in auth-reset", async () => {
      const hugePassword = "A".repeat(129);
      const res = await runAuthReset({
        email: testUser.email,
        password: hugePassword,
      });

      expect(res.success).toBe(false);
      expect(res.message).toContain("128");
    });
  });
});
