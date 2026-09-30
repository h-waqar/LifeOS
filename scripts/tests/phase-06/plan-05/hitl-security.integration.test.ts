// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { aiConversations, aiActions, auditLog, tasks } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getToolById } from "@/server/ai/tools/registry";
import { interceptToolCall, getActionById, rejectAction } from "@/server/ai/hitl/gate-service";
import { confirmAndExecuteAction } from "@/server/ai/hitl/action-executor";
import {
  ActionNotFoundError,
  ActionForbiddenError,
  ActionConflictError,
  ActionExpiredError,
} from "@/server/ai/hitl/types";
import { GET as actionGet } from "@/app/api/ai/actions/[id]/route";
import { POST as actionConfirmPost } from "@/app/api/ai/actions/[id]/confirm/route";
import { POST as actionRejectPost } from "@/app/api/ai/actions/[id]/reject/route";

describe("Phase 6 Plan 06-05: HITL Gate & Action Execution Security (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p06_plan05_hitl@example.com",
    password: "Plan05HITLPassword123!",
    name: "HITL Security Tester",
  };

  const foreignUserId = crypto.randomUUID();

  let testUserId: string;
  let cookieHeader: string;
  let conversationId: string;

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

    // Create a base conversation for HITL tests
    const [conv] = await db
      .insert(aiConversations)
      .values({
        userId: testUserId,
        title: "HITL Security Session",
        provider: "google",
        model: "gemini-2.5-flash",
      })
      .returning();
    conversationId = conv.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await closeDatabase();
    }
  });

  it("intercepts Tier 3 tool calls and persists previewable pending action with 5-min TTL", async () => {
    if (!probe?.isAvailable) return;

    const taskCreateTool = getToolById("tasks_create")!;
    expect(taskCreateTool).toBeDefined();

    const intercept = await interceptToolCall(
      { userId: testUserId, conversationId },
      taskCreateTool,
      {
        title: "Intercepted Task For Confirmation",
        priority: "high",
        status: "todo",
      }
    );

    expect(intercept.isPending).toBe(true);
    expect(intercept.actionId).toBeDefined();
    expect(intercept.preview).toBeDefined();
    expect(intercept.preview?.summary).toContain("Intercepted Task For Confirmation");

    // Verify persisted in DB
    const [actionInDb] = await db
      .select()
      .from(aiActions)
      .where(eq(aiActions.id, intercept.actionId!));
    expect(actionInDb).toBeDefined();
    expect(actionInDb.status).toBe("pending");
    expect(actionInDb.toolName).toBe("tasks_create");
    expect(actionInDb.userId).toBe(testUserId);
    expect(actionInDb.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("confirms and executes action, creates audit log, and mutates database", async () => {
    if (!probe?.isAvailable) return;

    const taskCreateTool = getToolById("tasks_create")!;
    const intercept = await interceptToolCall(
      { userId: testUserId, conversationId },
      taskCreateTool,
      {
        title: "Production Critical Task To Execute",
        priority: "critical",
        status: "inbox",
      }
    );

    const actionId = intercept.actionId!;

    // Execute confirmation
    const execRes = await confirmAndExecuteAction(testUserId, actionId, {
      ipAddress: "127.0.0.1",
      userAgent: "Vitest/LifeOS-Agent",
    });

    expect(execRes.action.status).toBe("executed");
    expect(execRes.action.executedAt).toBeDefined();
    expect(execRes.executionResult).toBeDefined();

    // Verify task actually exists in DB
    const createdTask = execRes.executionResult as any;
    const [dbTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, createdTask.id));
    expect(dbTask).toBeDefined();
    expect(dbTask.title).toBe("Production Critical Task To Execute");
    expect(dbTask.userId).toBe(testUserId);

    // Verify audit log row was written
    const auditRows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, testUserId),
          eq(auditLog.action, "ai.action_confirmed")
        )
      );
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    const lastAudit = auditRows[auditRows.length - 1];
    expect(lastAudit.actor).toBe(`user:${testUserId}`);
    expect((lastAudit.details as any)?.actionId).toBe(actionId);
    expect((lastAudit.details as any)?.toolName).toBe("tasks_create");
  });

  it("prevents replay attacks and handles concurrent execution races gracefully", async () => {
    if (!probe?.isAvailable) return;

    const taskCreateTool = getToolById("tasks_create")!;
    const intercept = await interceptToolCall(
      { userId: testUserId, conversationId },
      taskCreateTool,
      {
        title: "Single-Execution Race Condition Test Task",
      }
    );

    const actionId = intercept.actionId!;

    // Confirm once
    const firstConfirm = await confirmAndExecuteAction(testUserId, actionId);
    expect(firstConfirm.action.status).toBe("executed");

    // Second confirmation MUST fail with ActionConflictError
    await expect(
      confirmAndExecuteAction(testUserId, actionId)
    ).rejects.toThrow(ActionConflictError);

    // Test concurrent execution race: only one should succeed
    const interceptRace = await interceptToolCall(
      { userId: testUserId, conversationId },
      taskCreateTool,
      {
        title: "Simultaneous Concurrent Approvals Task",
      }
    );
    const raceActionId = interceptRace.actionId!;

    const results = await Promise.allSettled([
      confirmAndExecuteAction(testUserId, raceActionId),
      confirmAndExecuteAction(testUserId, raceActionId),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
  });

  it("strictly enforces multi-tenant isolation (foreign user cannot inspect or confirm)", async () => {
    if (!probe?.isAvailable) return;

    const taskCreateTool = getToolById("tasks_create")!;
    const intercept = await interceptToolCall(
      { userId: testUserId, conversationId },
      taskCreateTool,
      {
        title: "Confidential Strategy Plan",
      }
    );

    const actionId = intercept.actionId!;

    // Foreign user inspection fails with 403 Forbidden
    await expect(
      getActionById(foreignUserId, actionId)
    ).rejects.toThrow(ActionForbiddenError);

    // Foreign user confirmation fails with 403 Forbidden
    await expect(
      confirmAndExecuteAction(foreignUserId, actionId)
    ).rejects.toThrow(ActionForbiddenError);

    // Foreign user rejection fails with 403 Forbidden
    await expect(
      rejectAction(foreignUserId, actionId, "Malicious attempt")
    ).rejects.toThrow(ActionForbiddenError);
  });

  it("enforces expiration and fails closed when TTL is exceeded", async () => {
    if (!probe?.isAvailable) return;

    const taskCreateTool = getToolById("tasks_create")!;
    const intercept = await interceptToolCall(
      { userId: testUserId, conversationId },
      taskCreateTool,
      {
        title: "Expired Task Attempt",
      }
    );

    const actionId = intercept.actionId!;

    // Manually backdate expiresAt to simulate TTL expiration
    await db
      .update(aiActions)
      .set({
        expiresAt: new Date(Date.now() - 10000), // 10 seconds in the past
      })
      .where(eq(aiActions.id, actionId));

    // Inspecting expired action updates status to expired and returns it
    const action = await getActionById(testUserId, actionId);
    expect(action.status).toBe("expired");

    // Attempting to confirm expired action fails with ActionExpiredError
    await expect(
      confirmAndExecuteAction(testUserId, actionId)
    ).rejects.toThrow(ActionExpiredError);
  });

  it("handles rejection transition and prevents subsequent confirmation", async () => {
    if (!probe?.isAvailable) return;

    const taskCreateTool = getToolById("tasks_create")!;
    const intercept = await interceptToolCall(
      { userId: testUserId, conversationId },
      taskCreateTool,
      {
        title: "Task That User Decides To Reject",
      }
    );

    const actionId = intercept.actionId!;

    // Reject action
    const rejected = await rejectAction(
      testUserId,
      actionId,
      "Duplicate task already exists"
    );
    expect(rejected.status).toBe("rejected");
    expect(rejected.errorMessage).toBe("Duplicate task already exists");

    // Attempting to confirm rejected action fails with ActionConflictError
    await expect(
      confirmAndExecuteAction(testUserId, actionId)
    ).rejects.toThrow(ActionConflictError);
  });

  it("exposes HTTP API endpoints for action retrieval, confirmation, and rejection", async () => {
    if (!probe?.isAvailable) return;

    const taskCreateTool = getToolById("tasks_create")!;
    const intercept = await interceptToolCall(
      { userId: testUserId, conversationId },
      taskCreateTool,
      {
        title: "HTTP API Confirmable Task",
      }
    );

    const actionId = intercept.actionId!;

    // 1. GET /api/ai/actions/[id] (Unauthenticated -> 401)
    const unauthGet = await actionGet(
      createUnauthRequest(`http://localhost:3000/api/ai/actions/${actionId}`),
      { params: Promise.resolve({ id: actionId }) }
    );
    expect(unauthGet.status).toBe(401);

    // 2. GET /api/ai/actions/[id] (Authenticated -> 200)
    const authGet = await actionGet(
      createAuthRequest(`http://localhost:3000/api/ai/actions/${actionId}`),
      { params: Promise.resolve({ id: actionId }) }
    );
    expect(authGet.status).toBe(200);
    const getData = await authGet.json();
    expect(getData.data.id).toBe(actionId);
    expect(getData.data.status).toBe("pending");

    // 3. POST /api/ai/actions/[id]/confirm (Authenticated -> 200)
    const confirmRes = await actionConfirmPost(
      createAuthRequest(`http://localhost:3000/api/ai/actions/${actionId}/confirm`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: actionId }) }
    );
    expect(confirmRes.status).toBe(200);
    const confirmData = await confirmRes.json();
    expect(confirmData.data.action.status).toBe("executed");

    // 4. Test Rejection route with new action
    const intercept2 = await interceptToolCall(
      { userId: testUserId, conversationId },
      taskCreateTool,
      {
        title: "HTTP API Rejectable Task",
      }
    );
    const rejectActionId = intercept2.actionId!;

    const rejectRes = await actionRejectPost(
      createAuthRequest(`http://localhost:3000/api/ai/actions/${rejectActionId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: "User cancelled via UI" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ id: rejectActionId }) }
    );
    expect(rejectRes.status).toBe(200);
    const rejectData = await rejectRes.json();
    expect(rejectData.data.status).toBe("rejected");
    expect(rejectData.data.errorMessage).toBe("User cancelled via UI");
  });
});
