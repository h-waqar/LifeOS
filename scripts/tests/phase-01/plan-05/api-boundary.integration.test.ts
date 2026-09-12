import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user, session } from "@/server/db/schema/auth";
import { userPreferences } from "@/server/db/schema/preferences";
import { auditLog } from "@/server/db/schema/audit";
import { auth } from "@/server/auth";
import { GET as preferencesGet, PATCH as preferencesPatch, PUT as preferencesPut } from "@/app/api/preferences/route";
import { makeSignature } from "better-auth/crypto";
import { env } from "@/lib/env";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";

describe("Plan 01-05: Adversarial API & Authorization Boundary Integration Suite", () => {
  let probe: ProbeResult;

  const ownerUser = {
    email: "adversary_owner@example.com",
    password: "OwnerPassword123!",
    name: "Adversarial Owner",
  };

  let ownerId: string;
  let ownerSessionToken: string;
  let ownerCookieHeader: string;
  const victimId = "victim_user_" + crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Clean any prior test user
    await db.delete(user).where(eq(user.email, ownerUser.email));

    // Sign up owner
    const signUpRes = await auth.api.signUpEmail({
      body: {
        email: ownerUser.email,
        password: ownerUser.password,
        name: ownerUser.name,
      },
      asResponse: true,
    });

    expect(signUpRes.status).toBe(200);
    const setCookie = signUpRes.headers.get("set-cookie")!;
    const match = setCookie.match(/better-auth\.session_token=([^;]+)/);
    expect(match).toBeTruthy();
    const signedCookieValue = match![1];
    ownerSessionToken = signedCookieValue.split(".")[0];
    ownerCookieHeader = `better-auth.session_token=${signedCookieValue}`;

    const userRows = await db.select().from(user).where(eq(user.email, ownerUser.email));
    expect(userRows.length).toBe(1);
    ownerId = userRows[0].id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user).where(eq(user.email, ownerUser.email));
      await closeDatabase();
    }
  });

  describe("Section 3: Authentication Boundary Fail-Closed Audit", () => {
    it("rejects unauthenticated GET /api/preferences with 401 Unauthorized", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "GET",
      });

      const res = await preferencesGet(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBeDefined();
      // Ensure no stack trace or internal SQL leakage
      expect(data.stack).toBeUndefined();
    });

    it("rejects unauthenticated PATCH /api/preferences with 401 Unauthorized", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: "light" }),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it("rejects unauthenticated PUT /api/preferences with 401 Unauthorized", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: "light" }),
      });

      const res = await preferencesPut(req);
      expect(res.status).toBe(401);
    });

    it("rejects forged cookie token with 401 Unauthorized", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "GET",
        headers: {
          cookie: "better-auth.session_token=fabricated_token_not_in_db.bad_sig",
        },
      });

      const res = await preferencesGet(req);
      expect(res.status).toBe(401);
    });

    it("rejects forged HMAC signature with 401 Unauthorized", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "GET",
        headers: {
          cookie: `better-auth.session_token=${ownerSessionToken}.forgedHMACSignatureValueHere`,
        },
      });

      const res = await preferencesGet(req);
      expect(res.status).toBe(401);
    });

    it("rejects expired session with 401 Unauthorized", async () => {
      if (!probe.isAvailable) return;

      const expiredToken = "expired_" + crypto.randomUUID().replace(/-/g, "");
      const expiredDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago

      await db.insert(session).values({
        id: crypto.randomUUID(),
        userId: ownerId,
        token: expiredToken,
        expiresAt: expiredDate,
      });

      const sig = await makeSignature(expiredToken, env.BETTER_AUTH_SECRET);
      const signedExpiredCookie = `${expiredToken}.${sig}`;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "GET",
        headers: {
          cookie: `better-auth.session_token=${signedExpiredCookie}`,
        },
      });

      const res = await preferencesGet(req);
      expect(res.status).toBe(401);

      await db.delete(session).where(eq(session.token, expiredToken));
    });
  });

  describe("Section 4 & 5: IDOR, BOLA & User Identity Confusion", () => {
    it("ignores ?userId=victim query parameter and returns authenticated user preferences", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        `http://localhost:3000/api/preferences?userId=${victimId}&ownerId=${victimId}`,
        {
          method: "GET",
          headers: { cookie: ownerCookieHeader },
        }
      );

      const res = await preferencesGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.preferences.userId).toBe(ownerId);
      expect(data.preferences.userId).not.toBe(victimId);
    });

    it("rejects body payload with injected userId (400 Bad Request)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: ownerCookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId: victimId,
          theme: "light",
        }),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Validation failed");
    });

    it("rejects body payload with injected ownerId (400 Bad Request via strict schema)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: ownerCookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ownerId: victimId,
          theme: "light",
        }),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Validation failed");
    });

    it("rejects body payload with injected user_id (400 Bad Request via strict schema)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: ownerCookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          user_id: victimId,
          theme: "light",
        }),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(400);
    });

    it("rejects spoofed x-user-id header on unauthenticated request", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "GET",
        headers: {
          "x-user-id": ownerId,
          "x-authenticated-user": ownerId,
        },
      });

      const res = await preferencesGet(req);
      expect(res.status).toBe(401);
    });

    it("disregards spoofed x-user-id header on authenticated request and derives identity from session", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "GET",
        headers: {
          cookie: ownerCookieHeader,
          "x-user-id": victimId,
        },
      });

      const res = await preferencesGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.preferences.userId).toBe(ownerId);
      expect(data.preferences.userId).not.toBe(victimId);
    });
  });

  describe("Section 8: Race-Condition & Concurrent API Mutations", () => {
    it("handles 10 concurrent PATCH /api/preferences without crash or 500", async () => {
      if (!probe.isAvailable) return;

      const CONCURRENCY = 10;
      let releaseBarrier: () => void;
      const barrier = new Promise<void>((resolve) => {
        releaseBarrier = resolve;
      });

      const requests = Array.from({ length: CONCURRENCY }).map(async (_, idx) => {
        await barrier;
        const req = new NextRequest("http://localhost:3000/api/preferences", {
          method: "PATCH",
          headers: {
            cookie: ownerCookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            theme: idx % 2 === 0 ? "dark" : "light",
            timeFormat: idx % 2 === 0 ? "24h" : "12h",
          }),
        });

        return preferencesPatch(req);
      });

      releaseBarrier!();

      const responses = await Promise.all(requests);
      for (const res of responses) {
        expect(res.status).toBe(200);
      }

      // Verify PostgreSQL state
      const rows = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, ownerId));
      expect(rows.length).toBe(1);
    });
  });

  describe("Section 9: Input Validation & Type Confusion Attacks", () => {
    it("rejects malformed JSON payload (400 Bad Request)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: ownerCookieHeader,
          "content-type": "application/json",
        },
        body: "NOT_VALID_JSON{:::}",
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid JSON payload");
    });

    it("rejects array JSON payload (400 Bad Request)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: ownerCookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify([{ theme: "dark" }]),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Validation failed");
    });

    it("rejects primitive string JSON payload (400 Bad Request)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: ownerCookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify("dark"),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(400);
    });

    it("rejects primitive number JSON payload (400 Bad Request)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: ownerCookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify(12345),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(400);
    });

    it("rejects whitespace-only dateFormat (400 Bad Request)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: ownerCookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({ dateFormat: "   " }),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(400);
    });

    it("rejects invalid workingHours format (400 Bad Request)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: ownerCookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({ workingHoursStart: "25:00" }),
      });

      const res = await preferencesPatch(req);
      expect(res.status).toBe(400);
    });
  });

  describe("Section 11: Error-Path & Information Leakage Audit", () => {
    it("ensures 401 error response contains no stack traces, SQL fragments, or secrets", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "GET",
      });

      const res = await preferencesGet(req);
      const text = await res.text();

      expect(text).not.toContain("password");
      expect(text).not.toContain("BETTER_AUTH_SECRET");
      expect(text).not.toContain("LIFEOS_ENCRYPTION_KEY");
      expect(text).not.toContain("SELECT ");
      expect(text).not.toContain("at ");
    });

    it("ensures 400 validation error response contains no database internals", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: ownerCookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({ userId: "spoofed" }),
      });

      const res = await preferencesPatch(req);
      const text = await res.text();

      expect(text).not.toContain("user_preferences");
      expect(text).not.toContain("drizzle");
      expect(text).not.toContain("postgres");
      expect(text).not.toContain("node_modules");
    });
  });

  describe("Section 13: Better Auth Boundary & Single-User Lock Invariant", () => {
    it("rejects second user sign-up with 403 Forbidden (Single-User Lock D-01)", async () => {
      if (!probe.isAvailable) return;

      let errorCaught: any = null;
      try {
        await auth.api.signUpEmail({
          body: {
            email: "second_adversary@example.com",
            password: "AdversaryPassword123!",
            name: "Second Adversary",
          },
        });
      } catch (err) {
        errorCaught = err;
      }

      expect(errorCaught).toBeDefined();
      expect(errorCaught.status).toBe("FORBIDDEN");
      expect(errorCaught.statusCode).toBe(403);
    });

    it("verifies unauthenticated calls to Better Auth session endpoints fail closed", async () => {
      if (!probe.isAvailable) return;

      await expect(
        auth.api.listSessions({ headers: new Headers() })
      ).rejects.toThrow();

      await expect(
        auth.api.changePassword({
          headers: new Headers(),
          body: { currentPassword: "a", newPassword: "b" },
        })
      ).rejects.toThrow();

      await expect(
        auth.api.updateUser({
          headers: new Headers(),
          body: { name: "Hacked" },
        })
      ).rejects.toThrow();
    });
  });
});
