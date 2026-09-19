// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { habits, goals } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { GET as habitsGet, POST as habitsPost } from "@/app/api/habits/route";
import {
  GET as habitDetailGet,
  PATCH as habitDetailPatch,
  DELETE as habitDetailDelete,
} from "@/app/api/habits/[id]/route";
import {
  POST as habitEntriesPost,
  DELETE as habitEntriesDelete,
} from "@/app/api/habits/[id]/entries/route";
import { POST as habitTogglePost } from "@/app/api/habits/[id]/toggle/route";

describe("Plan 02-03 Wave 2: Habits API Routes (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p02_habit_api_user@example.com",
    password: "Plan02HabitApiPassword123!",
    name: "Habit API Tester",
  };

  let testUserId: string;
  let cookieHeader: string;
  let testGoalId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUser,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie")!;
    const match = setCookie.match(/better-auth\.session_token=([^;]+)/);
    expect(match).toBeTruthy();
    cookieHeader = `better-auth.session_token=${match![1]}`;

    const [createdUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = createdUser.id;

    const [createdGoal] = await db
      .insert(goals)
      .values({
        userId: testUserId,
        title: "API Linked Goal",
        horizon: "medium_term",
        area: "personal_development",
      })
      .returning();
    testGoalId = createdGoal.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  describe("1. Authentication Boundary Across All Endpoints", () => {
    it("rejects unauthenticated GET /api/habits with 401", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/habits", {
        method: "GET",
      });
      const res = await habitsGet(req);
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated POST /api/habits with 401", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/habits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Unauthorized Habit" }),
      });
      const res = await habitsPost(req);
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated GET /api/habits/[id] with 401", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/habits/some-id", {
        method: "GET",
      });
      const res = await habitDetailGet(req, {
        params: Promise.resolve({ id: "some-id" }),
      });
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated PATCH /api/habits/[id] with 401", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/habits/some-id", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Unauthorized Patch" }),
      });
      const res = await habitDetailPatch(req, {
        params: Promise.resolve({ id: "some-id" }),
      });
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated DELETE /api/habits/[id] with 401", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/habits/some-id", {
        method: "DELETE",
      });
      const res = await habitDetailDelete(req, {
        params: Promise.resolve({ id: "some-id" }),
      });
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated POST /api/habits/[id]/entries with 401", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        "http://localhost:3000/api/habits/some-id/entries",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ date: "2026-09-15" }),
        }
      );
      const res = await habitEntriesPost(req, {
        params: Promise.resolve({ id: "some-id" }),
      });
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated DELETE /api/habits/[id]/entries with 401", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        "http://localhost:3000/api/habits/some-id/entries?date=2026-09-15",
        { method: "DELETE" }
      );
      const res = await habitEntriesDelete(req, {
        params: Promise.resolve({ id: "some-id" }),
      });
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated POST /api/habits/[id]/toggle with 401", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        "http://localhost:3000/api/habits/some-id/toggle",
        { method: "POST" }
      );
      const res = await habitTogglePost(req, {
        params: Promise.resolve({ id: "some-id" }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("2. HTTP Validation & Media Type Enforcement", () => {
    it("rejects unsupported Content-Type with 415", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/habits", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "text/plain",
        },
        body: "title=TextPlainHabit",
      });
      const res = await habitsPost(req);
      expect(res.status).toBe(415);
    });

    it("rejects malformed JSON body with 400", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/habits", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: "{ not valid json ...",
      });
      const res = await habitsPost(req);
      expect(res.status).toBe(400);
    });

    it("rejects schema validation violations with 400 and structured issues", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/habits", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "", // empty title
          frequency: "invalid_frequency",
        }),
      });
      const res = await habitsPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Validation error");
      expect(data.issues).toBeDefined();
    });
  });

  describe("3. Habit CRUD Lifecycle & Tenant Isolation", () => {
    let habitId: string;

    it("creates a habit via POST /api/habits (status 201)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/habits", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Drink Water Daily",
          description: "Drink 2.5L water",
          frequency: "daily",
          timeOfDay: "morning",
          reminderTime: "08:00",
          targetValue: 2500,
          unit: "ml",
          goalId: testGoalId,
        }),
      });

      const res = await habitsPost(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.habit).toBeDefined();
      expect(data.habit.title).toBe("Drink Water Daily");
      expect(data.habit.goalId).toBe(testGoalId);
      expect(data.habit.currentStreak).toBe(0);
      habitId = data.habit.id;
    });

    it("lists habits via GET /api/habits (status 200)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/habits", {
        method: "GET",
        headers: { cookie: cookieHeader },
      });

      const res = await habitsGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.habits)).toBe(true);
      expect(data.habits.some((h: any) => h.id === habitId)).toBe(true);
    });

    it("retrieves habit detail via GET /api/habits/[id] (status 200)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(`http://localhost:3000/api/habits/${habitId}`, {
        method: "GET",
        headers: { cookie: cookieHeader },
      });

      const res = await habitDetailGet(req, {
        params: Promise.resolve({ id: habitId }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.habit.id).toBe(habitId);
      expect(Array.isArray(data.entries)).toBe(true);
    });

    it("returns 404 for non-existent habit ID on GET", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        "http://localhost:3000/api/habits/non-existent-id",
        {
          method: "GET",
          headers: { cookie: cookieHeader },
        }
      );

      const res = await habitDetailGet(req, {
        params: Promise.resolve({ id: "non-existent-id" }),
      });
      expect(res.status).toBe(404);
    });

    it("updates habit via PATCH /api/habits/[id] (status 200)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(`http://localhost:3000/api/habits/${habitId}`, {
        method: "PATCH",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Drink 3L Water Daily",
          targetValue: 3000,
        }),
      });

      const res = await habitDetailPatch(req, {
        params: Promise.resolve({ id: habitId }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.habit.title).toBe("Drink 3L Water Daily");
      expect(data.habit.targetValue).toBe(3000);
    });

    it("deletes habit via DELETE /api/habits/[id] (status 200)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(`http://localhost:3000/api/habits/${habitId}`, {
        method: "DELETE",
        headers: { cookie: cookieHeader },
      });

      const res = await habitDetailDelete(req, {
        params: Promise.resolve({ id: habitId }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify habit is now gone
      const verifyReq = new NextRequest(
        `http://localhost:3000/api/habits/${habitId}`,
        {
          method: "GET",
          headers: { cookie: cookieHeader },
        }
      );
      const verifyRes = await habitDetailGet(verifyReq, {
        params: Promise.resolve({ id: habitId }),
      });
      expect(verifyRes.status).toBe(404);
    });
  });

  describe("4. Check-Ins, Toggle, and Entries Lifecycle via API", () => {
    let habitId: string;

    beforeAll(async () => {
      if (!probe.isAvailable) return;

      const [created] = await db
        .insert(habits)
        .values({
          userId: testUserId,
          title: "Daily Journaling",
          frequency: "daily",
          targetValue: 1,
        })
        .returning();
      habitId = created.id;
    });

    it("logs completion entry via POST /api/habits/[id]/entries (status 201)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        `http://localhost:3000/api/habits/${habitId}/entries?referenceDate=2026-09-15`,
        {
          method: "POST",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            date: "2026-09-15",
            value: 1,
            notes: "Journaled 3 pages",
          }),
        }
      );

      const res = await habitEntriesPost(req, {
        params: Promise.resolve({ id: habitId }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.entry.date).toBe("2026-09-15");
      expect(data.entry.value).toBe(1);
      expect(data.stats.currentStreak).toBe(1);
    });

    it("single-click toggles check-in via POST /api/habits/[id]/toggle (status 200)", async () => {
      if (!probe.isAvailable) return;

      // 1. Toggle off the entry for 2026-09-15
      const reqOff = new NextRequest(
        `http://localhost:3000/api/habits/${habitId}/toggle?referenceDate=2026-09-15`,
        {
          method: "POST",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({ date: "2026-09-15" }),
        }
      );

      const resOff = await habitTogglePost(reqOff, {
        params: Promise.resolve({ id: habitId }),
      });
      expect(resOff.status).toBe(200);
      const dataOff = await resOff.json();
      expect(dataOff.toggled).toBe(true);
      expect(dataOff.completed).toBe(false);
      expect(dataOff.stats.currentStreak).toBe(0);

      // 2. Toggle back on for 2026-09-15
      const reqOn = new NextRequest(
        `http://localhost:3000/api/habits/${habitId}/toggle?referenceDate=2026-09-15`,
        {
          method: "POST",
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          body: JSON.stringify({ date: "2026-09-15" }),
        }
      );

      const resOn = await habitTogglePost(reqOn, {
        params: Promise.resolve({ id: habitId }),
      });
      expect(resOn.status).toBe(200);
      const dataOn = await resOn.json();
      expect(dataOn.toggled).toBe(true);
      expect(dataOn.completed).toBe(true);
      expect(dataOn.stats.currentStreak).toBe(1);
    });

    it("deletes entry via DELETE /api/habits/[id]/entries (status 200)", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest(
        `http://localhost:3000/api/habits/${habitId}/entries?date=2026-09-15&referenceDate=2026-09-15`,
        {
          method: "DELETE",
          headers: { cookie: cookieHeader },
        }
      );

      const res = await habitEntriesDelete(req, {
        params: Promise.resolve({ id: habitId }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.stats.currentStreak).toBe(0);
    });
  });
});
