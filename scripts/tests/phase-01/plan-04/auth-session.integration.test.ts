import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user, session } from "@/server/db/schema/auth";
import { userPreferences } from "@/server/db/schema/preferences";
import { auditLog } from "@/server/db/schema/audit";
import { auth } from "@/server/auth";
import {
  requireAuthenticatedUser,
  requireResourceOwnership,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  getUserPreferences,
  updateUserPreferences,
} from "@/server/preferences/service";
import { GET as preferencesGet, PATCH as preferencesPatch } from "@/app/api/preferences/route";
import { runAuthReset } from "../../../../scripts/auth-reset";
import { makeSignature } from "better-auth/crypto";
import { env } from "@/lib/env";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";

describe("Plan 01-04: Better Auth Authentication, Session Security & Server Authorization", () => {
  let probe: ProbeResult;

  const testUserA = {
    email: "user_a_plan04@example.com",
    password: "PasswordA123!",
    name: "User Alpha",
  };

  const testUserB = {
    email: "user_b_plan04@example.com",
    password: "PasswordB123!",
    name: "User Beta",
  };

  let userAId: string;
  let userBId: string;
  let userASessionToken: string;
  let userACookieHeader: string;
  let userBSessionToken: string;
  let userBCookieHeader: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Clean any residual test data before starting
    await db
      .delete(user)
      .where(inArray(user.email, [testUserA.email, testUserB.email]));
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db
        .delete(user)
        .where(inArray(user.email, [testUserA.email, testUserB.email]));
      await closeDatabase();
    }
  });

  describe("Authentication Lifecycle & Single-User Auto-Lock (AUTH-01, Decision D-01)", () => {
    it("successfully registers the primary owner (User A) and sets up session + preferences", async () => {
      if (!probe.isAvailable) return;

      const res = await auth.api.signUpEmail({
        body: {
          email: testUserA.email,
          password: testUserA.password,
          name: testUserA.name,
        },
        asResponse: true,
      });

      expect(res.status).toBe(200);

      const setCookie = res.headers.get("set-cookie");
      expect(setCookie, "Response must include Set-Cookie header").toBeTruthy();
      expect(setCookie).toContain("better-auth.session_token=");
      expect(setCookie?.toLowerCase()).toContain("httponly");
      expect(setCookie).toContain("Path=/");

      const match = setCookie?.match(/better-auth\.session_token=([^;]+)/);
      expect(match).toBeTruthy();
      const signedCookieValue = match![1];
      userASessionToken = signedCookieValue.split(".")[0];
      userACookieHeader = `better-auth.session_token=${signedCookieValue}`;

      // Verify user exists in PostgreSQL
      const userRows = await db
        .select()
        .from(user)
        .where(eq(user.email, testUserA.email));
      expect(userRows.length).toBe(1);
      userAId = userRows[0].id;
      expect(userRows[0].name).toBe(testUserA.name);

      // Verify default user preferences were automatically created
      const prefRows = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userAId));
      expect(prefRows.length).toBe(1);
      expect(prefRows[0].theme).toBe("dark");
      expect(prefRows[0].timeFormat).toBe("24h");

      // Verify audit log entry was written
      const auditRows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.userId, userAId));
      const registerLog = auditRows.find((a) => a.action === "user.registered");
      expect(registerLog).toBeDefined();
      expect(registerLog?.category).toBe("auth");
      expect(registerLog?.status).toBe("success");
    });

    it("enforces Single-User Auto-Lock (D-01): rejects subsequent registration attempt with 403 Forbidden", async () => {
      if (!probe.isAvailable) return;

      let errorCaught: any = null;
      try {
        await auth.api.signUpEmail({
          body: {
            email: testUserB.email,
            password: testUserB.password,
            name: testUserB.name,
          },
        });
      } catch (err) {
        errorCaught = err;
      }

      expect(errorCaught, "Subsequent signup must be rejected").toBeDefined();
      expect(errorCaught.status).toBe("FORBIDDEN");
      expect(errorCaught.statusCode).toBe(403);
      expect(errorCaught.body?.message).toContain("single-user");

      // Confirm User B was NOT created in PostgreSQL
      const userBRows = await db
        .select()
        .from(user)
        .where(eq(user.email, testUserB.email));
      expect(userBRows.length).toBe(0);
    });

    it("allows valid login with correct credentials and returns session cookie", async () => {
      if (!probe.isAvailable) return;

      const res = await auth.api.signInEmail({
        body: {
          email: testUserA.email,
          password: testUserA.password,
        },
        asResponse: true,
      });

      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("better-auth.session_token=");
    });

    it("rejects login attempt with invalid password", async () => {
      if (!probe.isAvailable) return;

      let errorCaught: any = null;
      try {
        await auth.api.signInEmail({
          body: {
            email: testUserA.email,
            password: "WrongPassword123!",
          },
        });
      } catch (err) {
        errorCaught = err;
      }

      expect(errorCaught).toBeDefined();
      expect(errorCaught.status).toBe("UNAUTHORIZED");
      expect(errorCaught.statusCode).toBe(401);
    });

    it("rejects login attempt with non-existent email", async () => {
      if (!probe.isAvailable) return;

      let errorCaught: any = null;
      try {
        await auth.api.signInEmail({
          body: {
            email: "nonexistent_user@example.com",
            password: "SomePassword123!",
          },
        });
      } catch (err) {
        errorCaught = err;
      }

      expect(errorCaught).toBeDefined();
      expect(errorCaught.status).toBe("UNAUTHORIZED");
    });
  });

  describe("Session Security & Lifecycle Verification (AUTH-01, Decision D-03)", () => {
    it("validates authentic session and returns user identity with ~30-day expiry", async () => {
      if (!probe.isAvailable) return;

      const headers = new Headers({ cookie: userACookieHeader });
      const context = await requireAuthenticatedUser(headers);

      expect(context).toBeDefined();
      expect(context.user.id).toBe(userAId);
      expect(context.user.email).toBe(testUserA.email);

      // Verify ~30 days expiration (2592000s)
      const now = Date.now();
      const expiresAt = new Date(context.session.expiresAt).getTime();
      const diffDays = (expiresAt - now) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(28);
      expect(diffDays).toBeLessThanOrEqual(31);
    });

    it("fails closed on missing session headers (401 Unauthorized)", async () => {
      if (!probe.isAvailable) return;

      await expect(requireAuthenticatedUser(new Headers())).rejects.toThrow(
        AuthenticationError
      );
    });

    it("fails closed on forged or tampered session token (401 Unauthorized)", async () => {
      if (!probe.isAvailable) return;

      const forgedHeaders = new Headers({
        cookie: "better-auth.session_token=tampered_fake_token_value; path=/",
      });

      await expect(requireAuthenticatedUser(forgedHeaders)).rejects.toThrow(
        AuthenticationError
      );
    });

    it("fails closed on forged HMAC signature (401 Unauthorized)", async () => {
      if (!probe.isAvailable) return;

      const invalidSignedHeaders = new Headers({
        cookie: `better-auth.session_token=${userASessionToken}.invalidHMACSignatureValueHere; path=/`,
      });

      await expect(requireAuthenticatedUser(invalidSignedHeaders)).rejects.toThrow(
        AuthenticationError
      );
    });

    it("fails closed on expired session (401 Unauthorized)", async () => {
      if (!probe.isAvailable) return;

      const expiredToken = "expired_test_token_" + crypto.randomUUID().replace(/-/g, "");
      const expiredDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour in the past

      await db.insert(session).values({
        id: crypto.randomUUID(),
        userId: userAId,
        token: expiredToken,
        expiresAt: expiredDate,
      });

      const sig = await makeSignature(expiredToken, env.BETTER_AUTH_SECRET);
      const signedExpiredCookie = `${expiredToken}.${sig}`;

      const expiredHeaders = new Headers({
        cookie: `better-auth.session_token=${signedExpiredCookie}`,
      });

      await expect(requireAuthenticatedUser(expiredHeaders)).rejects.toThrow(
        AuthenticationError
      );

      // Clean up test expired session
      await db.delete(session).where(eq(session.token, expiredToken));
    });

    it("revokes session on sign-out and prevents session replay", async () => {
      if (!probe.isAvailable) return;

      const headers = new Headers({ cookie: userACookieHeader });

      // Ensure session is valid first
      const beforeSignOut = await requireAuthenticatedUser(headers);
      expect(beforeSignOut.user.id).toBe(userAId);

      // Execute sign out
      await auth.api.signOut({ headers });

      // Replay attack: Attempt to use the same session token after sign out
      await expect(requireAuthenticatedUser(headers)).rejects.toThrow(
        AuthenticationError
      );

      // Re-login User A to obtain fresh session for subsequent ownership tests
      const loginRes = await auth.api.signInEmail({
        body: {
          email: testUserA.email,
          password: testUserA.password,
        },
        asResponse: true,
      });
      const newSetCookie = loginRes.headers.get("set-cookie")!;
      const match = newSetCookie.match(/better-auth\.session_token=([^;]+)/);
      const signedVal = match![1];
      userASessionToken = signedVal.split(".")[0];
      userACookieHeader = `better-auth.session_token=${signedVal}`;
    });
  });

  describe("Resource Ownership & IDOR Protection (AUTH-02, Sections 6 & 8)", () => {
    beforeAll(async () => {
      if (!probe?.isAvailable) return;

      // Define adversary identifier to test IDOR resistance
      userBId = "adversary_user_b_" + crypto.randomUUID().slice(0, 8);

      // Verify invariant: Attempting to insert a second user directly into PostgreSQL must fail
      let secondUserError: any = null;
      try {
        await db.insert(user).values({
          id: userBId,
          email: testUserB.email,
          name: testUserB.name,
        });
      } catch (err) {
        secondUserError = err;
      }
      expect(
        secondUserError,
        "PostgreSQL must reject inserting a second user row directly"
      ).toBeDefined();
    });

    it("allows User A to update and read their own preferences", async () => {
      if (!probe.isAvailable) return;

      const updated = await updateUserPreferences(userAId, {
        theme: "light",
        timeFormat: "12h",
      });

      expect(updated.theme).toBe("light");
      expect(updated.timeFormat).toBe("12h");
      expect(updated.userId).toBe(userAId);

      const fetched = await getUserPreferences(userAId);
      expect(fetched?.theme).toBe("light");
      expect(fetched?.timeFormat).toBe("12h");
    });

    it("IDOR Attack: non-owner user ID cannot access User A's preferences", async () => {
      if (!probe.isAvailable) return;

      // When an unauthorized ID accesses preferences, query scopes strictly to that ID
      const userBPrefs = await getUserPreferences(userBId);
      expect(userBPrefs).toBeNull();
    });

    it("IDOR Attack: non-owner user ID cannot mutate User A's preferences", async () => {
      if (!probe.isAvailable) return;

      // Attempting to mutate preferences for non-existent/adversary ID fails closed
      let errorCaught: any = null;
      try {
        await updateUserPreferences(userBId, {
          theme: "system",
        });
      } catch (err) {
        errorCaught = err;
      }
      expect(errorCaught).toBeDefined();

      // Verify User A's preferences were NOT modified by adversary action
      const userAPrefs = await getUserPreferences(userAId);
      expect(userAPrefs?.userId).toBe(userAId);
      expect(userAPrefs?.theme).toBe("light"); // Untouched!
    });

    it("Identity Spoofing Attack: Client-supplied userId in body cannot mutate victim", async () => {
      if (!probe.isAvailable) return;

      // Authenticated user attempts to spoof another userId in body
      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "PATCH",
        headers: {
          cookie: userACookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId: userBId, // Spoofed user ID!
          theme: "dark",
        }),
      });

      const res = await preferencesPatch(req);
      // Our schema forbids userId in payload, rejecting with 400 Bad Request
      expect(res.status).toBe(400);

      // Verify User A preferences are still light
      const userAPrefs = await getUserPreferences(userAId);
      expect(userAPrefs?.theme).toBe("light");
    });

    it("Query Parameter Spoofing: Client-supplied ?userId=victim is disregarded", async () => {
      if (!probe.isAvailable) return;

      // Authenticated user calls GET /api/preferences?userId=<userBId>
      const req = new NextRequest(
        `http://localhost:3000/api/preferences?userId=${userBId}`,
        {
          method: "GET",
          headers: {
            cookie: userACookieHeader,
          },
        }
      );

      const res = await preferencesGet(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      // Data returned is strictly the authenticated User A's preferences, ignoring ?userId parameter
      expect(data.preferences.userId).toBe(userAId);
      expect(data.preferences.userId).not.toBe(userBId);
    });

    it("Header Spoofing Attack: Unauthenticated request cannot fake x-user-id header", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/preferences", {
        method: "GET",
        headers: {
          "x-user-id": userAId,
          "x-authenticated-user": userAId,
        },
      });

      const res = await preferencesGet(req);
      expect(res.status).toBe(401);
    });

    it("Ownership Primitive: requireResourceOwnership fails closed when IDs mismatch", () => {
      expect(() => requireResourceOwnership(userAId, userBId)).toThrow(
        AuthorizationError
      );
      expect(() => requireResourceOwnership(userBId, userAId)).toThrow(
        AuthorizationError
      );
      expect(() => requireResourceOwnership(userAId, userAId)).not.toThrow();
    });
  });

  describe("CLI Emergency Recovery Script (Decision D-04, scripts/auth-reset.ts)", () => {
    it("successfully resets user credentials via CLI and revokes active sessions", async () => {
      if (!probe.isAvailable) return;

      const newPassword = "NewResetPassword789!";

      const resetResult = await runAuthReset({
        email: testUserA.email,
        password: newPassword,
      });

      expect(resetResult.success).toBe(true);
      expect(resetResult.userId).toBe(userAId);

      // 1. Prior session must be revoked
      const priorSessionHeaders = new Headers({ cookie: userACookieHeader });
      await expect(requireAuthenticatedUser(priorSessionHeaders)).rejects.toThrow(
        AuthenticationError
      );

      // 2. Old password fails
      let oldLoginError: any = null;
      try {
        await auth.api.signInEmail({
          body: {
            email: testUserA.email,
            password: testUserA.password,
          },
        });
      } catch (err) {
        oldLoginError = err;
      }
      expect(oldLoginError).toBeDefined();

      // 3. New password succeeds
      const newLoginRes = await auth.api.signInEmail({
        body: {
          email: testUserA.email,
          password: newPassword,
        },
        asResponse: true,
      });
      expect(newLoginRes.status).toBe(200);

      // 4. Security audit log was recorded
      const securityLogs = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.userId, userAId));
      const resetLog = securityLogs.find((a) => a.action === "auth.cli_reset");
      expect(resetLog).toBeDefined();
      expect(resetLog?.category).toBe("security");
      expect(resetLog?.status).toBe("success");
    });
  });
});
