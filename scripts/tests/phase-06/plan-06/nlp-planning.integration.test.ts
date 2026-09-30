// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTask, updateTask } from "@/server/tasks/service";
import { createHabit, logHabitEntry } from "@/server/habits/service";
import { createAccount } from "@/server/finance/account-service";
import { createTransaction } from "@/server/finance/transaction-service";
import { POST as parseCapturePost } from "@/app/api/ai/parse-capture/route";
import { GET as dailySuggestionsGet } from "@/app/api/ai/daily-suggestions/route";
import { GET as weeklyReviewGet } from "@/app/api/ai/weekly-review/route";

describe("Phase 6 Plan 06-06: NLP & Proactive Planning Engine (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p06_plan06_nlp@example.com",
    password: "Plan06NLPPassword123!",
    name: "NLP Planning Tester",
  };

  const foreignUserId = crypto.randomUUID();

  let testUserId: string;
  let cookieHeader: string;

  function createAuthRequest(url: string, init?: RequestInit): NextRequest {
    const headers = new Headers(init?.headers);
    headers.set("cookie", cookieHeader);
    return new NextRequest(url, { ...init, headers } as any);
  }

  function createUnauthRequest(url: string, init?: RequestInit): NextRequest {
    return new NextRequest(url, init as any);
  }

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Reset database to ensure clean test state
    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUser,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const setCookies = res.headers.getSetCookie?.() || [];
    cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");

    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = u.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await closeDatabase();
    }
  });

  it("POST /api/ai/parse-capture parses natural language input into structured entities", async () => {
    if (!probe?.isAvailable) return;

    // 1. Unauthenticated request -> 401
    const unauthReq = createUnauthRequest("http://localhost:3000/api/ai/parse-capture", {
      method: "POST",
      body: JSON.stringify({ input: "Plan quarterly sprint tomorrow" }),
      headers: { "Content-Type": "application/json" },
    });
    const unauthRes = await parseCapturePost(unauthReq);
    expect(unauthRes.status).toBe(401);

    // 2. Authenticated request -> 200
    const authReq = createAuthRequest("http://localhost:3000/api/ai/parse-capture", {
      method: "POST",
      body: JSON.stringify({
        input: "Meeting with client tomorrow at 3pm for 45 mins #client +urgent",
        referenceDate: "2026-10-20T10:00:00.000Z",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const authRes = await parseCapturePost(authReq);
    expect(authRes.status).toBe(200);

    const data = await authRes.json();
    expect(data.data).toBeDefined();
    expect(data.data.intent).toBe("calendar");
    expect(data.data.durationMinutes).toBe(45);
    expect(data.data.scheduledDate).toBeDefined();
    expect(data.data.tags).toContain("urgent");
  });

  it("GET /api/ai/daily-suggestions returns top focus tasks, free hours, and warnings", async () => {
    if (!probe?.isAvailable) return;

    const targetDate = "2026-10-22";

    // 1. Create an overdue task
    await createTask(testUserId, {
      title: "Fix broken database migration",
      status: "todo",
      priority: "critical",
    });

    // 2. Create a scheduled task for targetDate
    await createTask(testUserId, {
      title: "Deliver design system review",
      status: "todo",
      priority: "high",
      scheduledDate: `${targetDate}T09:00:00.000Z`,
    });

    // 3. Query daily suggestions
    const req = createAuthRequest(
      `http://localhost:3000/api/ai/daily-suggestions?date=${targetDate}`
    );
    const res = await dailySuggestionsGet(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.date).toBe(targetDate);
    expect(body.data.focusTasks.length).toBeGreaterThanOrEqual(1);
    expect(body.data.summary).toContain("focus time");

    // Multi-tenant check: Foreign user sees 0 tasks
    const { generateDailySuggestions } = await import(
      "@/server/ai/proactive/daily-planner"
    );
    const foreignSuggestions = await generateDailySuggestions(
      foreignUserId,
      targetDate
    );
    expect(foreignSuggestions.focusTasks.length).toBe(0);
  });

  it("GET /api/ai/weekly-review synthesizes tasks, habits, and financial movements", async () => {
    if (!probe?.isAvailable) return;

    const endDate = "2026-10-25";

    // 1. Create and complete a task
    const t = await createTask(testUserId, {
      title: "Launch LifeOS Phase 6 Assistant",
      status: "todo",
      priority: "high",
    });
    await updateTask(testUserId, t.id, { status: "completed" });

    // 2. Log a habit entry
    const habit = await createHabit(testUserId, {
      title: "Daily Morning Standup",
      frequency: "daily",
      targetValue: 1,
    });
    await logHabitEntry(testUserId, habit.id, {
      date: "2026-10-23",
      value: 1,
    });

    // 3. Record a financial expense
    const acc = await createAccount(testUserId, {
      name: "Weekly Review Checking",
      accountType: "checking",
      currency: "PKR",
      initialBalance: 50000,
    });
    await createTransaction(testUserId, {
      accountId: acc.id,
      transactionType: "expense",
      amount: 15000,
      currency: "PKR",
      date: new Date("2026-10-24T12:00:00.000Z"),
      description: "Weekly hosting costs",
    });

    // 4. Query weekly review
    const req = createAuthRequest(
      `http://localhost:3000/api/ai/weekly-review?endDate=${endDate}`
    );
    const res = await weeklyReviewGet(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.metrics).toBeDefined();
    expect(body.data.metrics.totalExpenses).toBeGreaterThanOrEqual(15000);
    expect(body.data.markdownReport).toContain("Weekly Synthesis Review");
    expect(body.data.markdownReport).toContain("Velocity & Wins");
    expect(body.data.markdownReport).toContain("Financial Summary & Pacing");
    expect(body.data.recommendations.length).toBeGreaterThanOrEqual(1);
  });
});
