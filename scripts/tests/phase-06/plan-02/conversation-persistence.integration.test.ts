// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { aiConversations, aiMessages, aiActions } from "@/server/db/schema/ai";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import {
  createConversation,
  getConversation,
  listConversations,
  updateConversation,
  deleteConversation,
  createMessage,
  listMessages,
  NotFoundError,
} from "@/server/ai/conversation-service";
import {
  GET as convsGet,
  POST as convsPost,
} from "@/app/api/ai/conversations/route";
import {
  GET as convItemGet,
  PATCH as convItemPatch,
  DELETE as convItemDelete,
} from "@/app/api/ai/conversations/[id]/route";
import {
  GET as messagesGet,
  POST as messagesPost,
} from "@/app/api/ai/conversations/[id]/messages/route";

describe("Phase 6 Plan 06-02: Conversation & Message Persistence (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p06_plan02_conv@example.com",
    password: "Plan06ConvPassword123!",
    name: "AI Conversation Tester",
  };

  const foreignUserId = crypto.randomUUID();

  let testUserId: string;
  let cookieHeader: string;
  let createdConvId: string;

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

    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUser,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const match = res.headers.get("set-cookie")!.match(/better-auth\.session_token=([^;]+)/);
    cookieHeader = `better-auth.session_token=${match![1]}`;

    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = u.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Creates and persists a conversation in PostgreSQL with default model", async () => {
    if (!probe.isAvailable) return;

    const conv = await createConversation(testUserId, {
      title: "Quarterly Strategy Chat",
      provider: "google",
      model: "gemini-2.5-flash",
      metadata: { source: "test" },
    });

    expect(conv.id).toBeDefined();
    expect(conv.userId).toBe(testUserId);
    expect(conv.title).toBe("Quarterly Strategy Chat");
    expect(conv.provider).toBe("google");
    expect(conv.model).toBe("gemini-2.5-flash");

    createdConvId = conv.id;

    // Verify row exists directly in database
    const [row] = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, conv.id));
    expect(row).toBeDefined();
    expect(row.title).toBe("Quarterly Strategy Chat");
  });

  it("2. Appends user and assistant messages with tool calls and results", async () => {
    if (!probe.isAvailable) return;

    const userMsg = await createMessage(testUserId, createdConvId, {
      role: "user",
      content: "Can you list my overdue tasks?",
    });

    expect(userMsg.id).toBeDefined();
    expect(userMsg.role).toBe("user");
    expect(userMsg.content).toBe("Can you list my overdue tasks?");

    const assistantMsg = await createMessage(testUserId, createdConvId, {
      role: "assistant",
      content: "Let me check for you.",
      toolCalls: [
        {
          id: "call-1",
          toolName: "tasks_search",
          args: { status: "pending" },
        },
      ],
      tokenCount: 45,
    });

    expect(assistantMsg.id).toBeDefined();
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.toolCalls).toHaveLength(1);

    const toolMsg = await createMessage(testUserId, createdConvId, {
      role: "tool",
      content: "",
      toolResults: [
        {
          id: "call-1",
          toolName: "tasks_search",
          result: [{ id: "t1", title: "Review taxes" }],
        },
      ],
    });

    expect(toolMsg.id).toBeDefined();
    expect(toolMsg.role).toBe("tool");

    // Fetch conversation message history
    const history = await listMessages(testUserId, createdConvId);
    expect(history).toHaveLength(3);
    expect(history[0].role).toBe("user");
    expect(history[1].role).toBe("assistant");
    expect(history[2].role).toBe("tool");
  });

  it("3. Cascade Deletion: Deleting conversation removes all child messages and actions", async () => {
    if (!probe.isAvailable) return;

    // Create a temporary conversation with a message and an action
    const tempConv = await createConversation(testUserId, {
      title: "Temporary Thread",
    });

    const tempMsg = await createMessage(testUserId, tempConv.id, {
      role: "user",
      content: "Doomed message",
    });

    // Insert an action linked to this conversation
    const [action] = await db
      .insert(aiActions)
      .values({
        conversationId: tempConv.id,
        messageId: tempMsg.id,
        userId: testUserId,
        toolName: "tasks_create",
        riskLevel: "consequential",
        status: "pending",
        parameters: { title: "Draft Task" },
        previewData: { summary: "Create task Draft Task" },
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      })
      .returning();

    expect(action.id).toBeDefined();

    // Delete conversation
    await deleteConversation(testUserId, tempConv.id);

    // Verify conversation is deleted
    const convRows = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, tempConv.id));
    expect(convRows).toHaveLength(0);

    // Verify messages cascaded
    const msgRows = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, tempConv.id));
    expect(msgRows).toHaveLength(0);

    // Verify actions cascaded
    const actionRows = await db
      .select()
      .from(aiActions)
      .where(eq(aiActions.conversationId, tempConv.id));
    expect(actionRows).toHaveLength(0);
  });

  it("4. Multi-Tenant Isolation: Foreign user cannot read or delete owner's conversations", async () => {
    if (!probe.isAvailable) return;

    // Foreign user attempting to get User A's conversation must throw NotFoundError (fails closed)
    await expect(getConversation(foreignUserId, createdConvId)).rejects.toThrow(
      NotFoundError
    );

    // Foreign user attempting to list messages of User A's conversation must throw NotFoundError
    await expect(listMessages(foreignUserId, createdConvId)).rejects.toThrow(
      NotFoundError
    );

    // Foreign user attempting to update User A's conversation must throw NotFoundError
    await expect(
      updateConversation(foreignUserId, createdConvId, { title: "Hijacked Title" })
    ).rejects.toThrow(NotFoundError);

    // Foreign user attempting to delete User A's conversation must throw NotFoundError
    await expect(
      deleteConversation(foreignUserId, createdConvId)
    ).rejects.toThrow(NotFoundError);

    // Listing conversations for foreign user returns 0 items
    const foreignList = await listConversations(foreignUserId);
    expect(foreignList.items).toHaveLength(0);
    expect(foreignList.total).toBe(0);
  });

  it("5. API Routes: GET and POST /api/ai/conversations enforce authentication", async () => {
    if (!probe.isAvailable) return;

    // Unauthenticated GET fails with 401
    const unauthGet = createUnauthRequest("http://localhost:3000/api/ai/conversations");
    const resUnauth = await convsGet(unauthGet);
    expect(resUnauth.status).toBe(401);

    // Authenticated GET returns conversations list
    const authGet = createAuthRequest("http://localhost:3000/api/ai/conversations");
    const resAuth = await convsGet(authGet);
    expect(resAuth.status).toBe(200);
    const body = await resAuth.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    // Authenticated POST creates a new conversation
    const authPost = createAuthRequest("http://localhost:3000/api/ai/conversations", {
      method: "POST",
      body: JSON.stringify({
        title: "API Created Conversation",
        provider: "anthropic",
        model: "claude-3-7-sonnet",
      }),
    });
    const resPost = await convsPost(authPost);
    expect(resPost.status).toBe(201);
    const postBody = await resPost.json();
    expect(postBody.data.title).toBe("API Created Conversation");
    expect(postBody.data.provider).toBe("anthropic");
  });

  it("6. API Routes: /api/ai/conversations/[id] PATCH and message endpoints", async () => {
    if (!probe.isAvailable) return;

    // PATCH update title
    const patchReq = createAuthRequest(
      `http://localhost:3000/api/ai/conversations/${createdConvId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated Strategy Chat" }),
      }
    );
    const patchRes = await convItemPatch(patchReq, {
      params: Promise.resolve({ id: createdConvId }),
    });
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.data.title).toBe("Updated Strategy Chat");

    // POST message to conversation via API
    const postMsgReq = createAuthRequest(
      `http://localhost:3000/api/ai/conversations/${createdConvId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          role: "user",
          content: "Hello from API!",
        }),
      }
    );
    const postMsgRes = await messagesPost(postMsgReq, {
      params: Promise.resolve({ id: createdConvId }),
    });
    expect(postMsgRes.status).toBe(201);

    // GET messages via API
    const getMsgsReq = createAuthRequest(
      `http://localhost:3000/api/ai/conversations/${createdConvId}/messages`
    );
    const getMsgsRes = await messagesGet(getMsgsReq, {
      params: Promise.resolve({ id: createdConvId }),
    });
    expect(getMsgsRes.status).toBe(200);
    const getMsgsBody = await getMsgsRes.json();
    expect(getMsgsBody.data.some((m: any) => m.content === "Hello from API!")).toBe(true);
  });
});
