// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { aiConversations, aiActions, auditLog, tasks, notes } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and } from "drizzle-orm";
import { NextRequest } from "next/server";
import { POST as chatPost } from "@/app/api/ai/chat/route";
import { resetRateLimitForTesting } from "@/server/ai/rate-limiter";
import { GET as getConversationRoute } from "@/app/api/ai/conversations/[id]/route";
import { GET as getMessagesRoute } from "@/app/api/ai/conversations/[id]/messages/route";
import { POST as confirmActionRoute } from "@/app/api/ai/actions/[id]/confirm/route";
import { POST as rejectActionRoute } from "@/app/api/ai/actions/[id]/reject/route";
import {
  createConversation,
  getConversation,
  createMessage,
  listMessages,
  NotFoundError,
} from "@/server/ai/conversation-service";
import { retrievePersonalContext } from "@/server/ai/rag/retrieval-service";
import { assembleContext } from "@/server/ai/context/engine";
import { getToolById } from "@/server/ai/tools/registry";
import {
  interceptToolCall,
  getActionById,
} from "@/server/ai/hitl/gate-service";
import { ActionForbiddenError } from "@/server/ai/hitl/types";

describe("Phase 6 Plan 06-07: End-to-End AI Assistant System (Integration)", () => {
  let probe: ProbeResult;

  const testUserA = {
    email: "p06_plan07_user_a@example.com",
    password: "Plan07Password123!",
    name: "User A Assistant E2E",
  };

  const foreignUserId = crypto.randomUUID();

  let userAId: string;
  let cookieHeaderA: string;

  function createAuthRequest(url: string, cookie: string, init?: RequestInit): NextRequest {
    const headers = new Headers(init?.headers);
    headers.set("cookie", cookie);
    return new NextRequest(url, { ...init, headers } as any);
  }

  function createUnauthRequest(url: string, init?: RequestInit): NextRequest {
    return new NextRequest(url, init as any);
  }

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Reset user table for clean single-user signup
    await db.delete(user);

    // Sign up User A
    const resA = await auth.api.signUpEmail({
      body: testUserA,
      asResponse: true,
    });
    expect(resA.status).toBe(200);
    const setCookiesA = resA.headers.getSetCookie?.() || [];
    cookieHeaderA = setCookiesA.map((c) => c.split(";")[0]).join("; ");

    const [dbUserA] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUserA.email));
    userAId = dbUserA.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await closeDatabase();
    }
  });

  it("1. Rejects unauthenticated chat requests with 401 UNAUTHORIZED", async () => {
    if (!probe?.isAvailable) return;

    const req = createUnauthRequest("http://localhost:3000/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
    });

    const res = await chatPost(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("2. Enforces sliding window rate limit of 20 requests per minute", async () => {
    if (!probe?.isAvailable) return;

    resetRateLimitForTesting();

    // Fire 20 requests
    for (let i = 0; i < 20; i++) {
      const req = createAuthRequest("http://localhost:3000/api/ai/chat", cookieHeaderA, {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: `Ping ${i}` }],
        }),
      });
      const res = await chatPost(req);
      // Status could be 200 or 500 (if no API key configured for streaming), but definitely NOT 429
      expect(res.status).not.toBe(429);
    }

    // 21st request must trigger 429
    const req21 = createAuthRequest("http://localhost:3000/api/ai/chat", cookieHeaderA, {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Rate limited message" }],
      }),
    });
    const res21 = await chatPost(req21);
    expect(res21.status).toBe(429);
    const body21 = await res21.json();
    expect(body21.code).toBe("RATE_LIMIT_EXCEEDED");

    resetRateLimitForTesting();
  });

  it("3. Enforces strict multi-tenant isolation on conversations and messages", async () => {
    if (!probe?.isAvailable) return;

    // Create a private conversation and message for User A
    const convA = await createConversation(userAId, {
      title: "User A Confidential Chat",
      provider: "google",
      model: "gemini-2.5-flash",
    });

    await createMessage(userAId, convA.id, {
      role: "user",
      content: "Secret financial details",
    });

    // User A can access their conversation via API route
    const reqGetA = createAuthRequest(
      `http://localhost:3000/api/ai/conversations/${convA.id}`,
      cookieHeaderA
    );
    const resGetA = await getConversationRoute(reqGetA, {
      params: Promise.resolve({ id: convA.id }),
    });
    expect(resGetA.status).toBe(200);

    // Foreign user cannot access User A's conversation via domain service (fails with NotFoundError)
    await expect(getConversation(foreignUserId, convA.id)).rejects.toThrow(NotFoundError);

    // Foreign user cannot access User A's messages (fails with NotFoundError)
    await expect(listMessages(foreignUserId, convA.id)).rejects.toThrow(NotFoundError);
  });

  it("4. Full Context Assembly Journey: Combines state snapshot, temporal grounding, and RAG retrieval", async () => {
    if (!probe?.isAvailable) return;

    // Seed task and note for User A
    await db.insert(tasks).values({
      userId: userAId,
      title: "Q4 Marketing Strategy Deliverable",
      status: "todo",
      priority: "high",
    });

    await db.insert(notes).values({
      userId: userAId,
      title: "Q4 Budgeting Guidelines",
      slug: `q4-budgeting-${Date.now()}`,
      content: "All budget requests must include estimated ROI and vendor quotes.",
    });

    // Run context retrieval on query matching User A's task & note
    const ragResult = await retrievePersonalContext(userAId, "Q4 marketing and budgeting");
    expect(ragResult.entities.length).toBeGreaterThan(0);
    expect(ragResult.formattedXml).toContain("Q4");

    // Assemble dynamic context
    const conv = await createConversation(userAId, { title: "Context Session" });
    const assembled = await assembleContext({
      userId: userAId,
      conversationId: conv.id,
      retrievedContextXml: ragResult.formattedXml,
    });

    // Verify temporal grounding, operational snapshot, and RAG entities
    expect(assembled.systemPrompt).toContain("<temporal_anchor");
    expect(assembled.systemPrompt).toContain("<user_state");
    expect(assembled.systemPrompt).toContain("<retrieved_entities");
    expect(assembled.tokenEstimate).toBeGreaterThan(0);

    // Verify Foreign user cannot retrieve User A's entities
    const ragResultForeign = await retrievePersonalContext(foreignUserId, "Q4 marketing and budgeting");
    expect(ragResultForeign.entities.length).toBe(0);
  });

  it("5. Full Mutation Journey: Consequential tool call -> HITL intercept -> approval -> execution -> audit log", async () => {
    if (!probe?.isAvailable) return;

    const conv = await createConversation(userAId, { title: "Mutation Flow Session" });

    // Step 1: Tool invocation requiring confirmation is intercepted
    const taskCreateTool = getToolById("tasks_create")!;
    expect(taskCreateTool).toBeDefined();

    const intercept = await interceptToolCall(
      { userId: userAId, conversationId: conv.id },
      taskCreateTool,
      {
        title: "Launch E2E Marketing Campaign",
        priority: "high",
        status: "todo",
      }
    );

    expect(intercept.isPending).toBe(true);
    expect(intercept.actionId).toBeDefined();
    const actionId = intercept.actionId!;

    // Foreign user cannot inspect or confirm action (ActionForbiddenError)
    await expect(getActionById(foreignUserId, actionId)).rejects.toThrow(ActionForbiddenError);

    // Step 2: Action preview verification
    expect(intercept.preview).toBeDefined();
    expect(intercept.preview?.summary).toContain("Launch E2E Marketing Campaign");

    // Step 3: Approve and execute via API route
    const confirmReq = createAuthRequest(
      `http://localhost:3000/api/ai/actions/${actionId}/confirm`,
      cookieHeaderA,
      { method: "POST" }
    );
    const confirmRes = await confirmActionRoute(confirmReq, {
      params: Promise.resolve({ id: actionId }),
    });

    expect(confirmRes.status).toBe(200);
    const confirmBody = await confirmRes.json();
    expect(confirmBody.data.action.status).toBe("executed");
    expect(confirmBody.data.executionResult).toBeDefined();

    // Step 4: Verify task created in database with user ownership
    const createdTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userAId),
          eq(tasks.title, "Launch E2E Marketing Campaign")
        )
      );
    expect(createdTasks.length).toBe(1);
    expect(createdTasks[0].priority).toBe("high");

    // Step 5: Verify comprehensive audit log created
    const logs = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, userAId),
          eq(auditLog.action, "ai.action_confirmed")
        )
      );
    expect(logs.length).toBeGreaterThan(0);
    const executionLog = logs.find((l) => (l.details as any)?.actionId === actionId);
    expect(executionLog).toBeDefined();

    // Step 6: Replay attack prevention (re-confirming returns 409 Conflict)
    const replayReq = createAuthRequest(
      `http://localhost:3000/api/ai/actions/${actionId}/confirm`,
      cookieHeaderA,
      { method: "POST" }
    );
    const replayRes = await confirmActionRoute(replayReq, {
      params: Promise.resolve({ id: actionId }),
    });
    expect(replayRes.status).toBe(409);
  });

  it("6. Full Rejection Journey: Intercepted tool call is rejected without mutating domain data", async () => {
    if (!probe?.isAvailable) return;

    const conv = await createConversation(userAId, { title: "Rejection Flow Session" });
    const taskCreateTool = getToolById("tasks_create")!;

    const intercept = await interceptToolCall(
      { userId: userAId, conversationId: conv.id },
      taskCreateTool,
      {
        title: "Unwanted Distraction Task",
        priority: "low",
        status: "todo",
      }
    );

    const actionId = intercept.actionId!;

    // Reject via API route
    const rejectReq = createAuthRequest(
      `http://localhost:3000/api/ai/actions/${actionId}/reject`,
      cookieHeaderA,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "User cancelled from card" }),
      }
    );
    const rejectRes = await rejectActionRoute(rejectReq, {
      params: Promise.resolve({ id: actionId }),
    });

    expect(rejectRes.status).toBe(200);
    const rejectBody = await rejectRes.json();
    expect(rejectBody.data.status).toBe("rejected");

    // Verify task was NOT created
    const taskCheck = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userAId),
          eq(tasks.title, "Unwanted Distraction Task")
        )
      );
    expect(taskCheck.length).toBe(0);
  });
});
