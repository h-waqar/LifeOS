// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  ActionNotFoundError,
  ActionForbiddenError,
  ActionConflictError,
  ActionExpiredError,
} from "@/server/ai/hitl/types";
import { ACTION_TTL_MS, mapActionToDTO } from "@/server/ai/hitl/gate-service";
import { requiresConfirmation, type LifeOSTool, type ToolContext } from "@/server/ai/tools/types";
import { interceptToolCall } from "@/server/ai/hitl/gate-service";
import { db } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { eq } from "drizzle-orm";

describe("Phase 6 Plan 06-05: HITL Confirmation Gate (Unit)", () => {
  let testUserId: string = "user-123";

  beforeAll(async () => {
    const [existing] = await db.select({ id: user.id }).from(user).limit(1);
    if (existing) {
      testUserId = existing.id;
    } else {
      const [inserted] = await db
        .insert(user)
        .values({
          id: "user-123",
          name: "Test User 123",
          email: "user123_hitl@example.com",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      testUserId = inserted.id;
    }
  });

  it("defines standard error classes with appropriate HTTP statuses and codes", () => {
    const notFound = new ActionNotFoundError();
    expect(notFound.status).toBe(404);
    expect(notFound.code).toBe("ACTION_NOT_FOUND");

    const forbidden = new ActionForbiddenError();
    expect(forbidden.status).toBe(403);
    expect(forbidden.code).toBe("ACTION_FORBIDDEN");

    const conflict = new ActionConflictError();
    expect(conflict.status).toBe(409);
    expect(conflict.code).toBe("ACTION_CONFLICT");

    const expired = new ActionExpiredError();
    expect(expired.status).toBe(410);
    expect(expired.code).toBe("ACTION_EXPIRED");
  });

  it("configures 5-minute TTL constant", () => {
    expect(ACTION_TTL_MS).toBe(5 * 60 * 1000);
  });

  it("auto-executes Tier 1 read-only tools without interception or database calls", async () => {
    const mockExecute = vi.fn().mockResolvedValue([{ id: "task-1", title: "Test" }]);

    const readOnlyTool: LifeOSTool = {
      id: "test_readonly",
      name: "test_readonly",
      description: "Read only tool",
      category: "tasks",
      riskTier: "tier1_readonly",
      schema: null as any,
      execute: mockExecute,
    };

    const ctx: ToolContext = {
      userId: testUserId,
    };

    const res = await interceptToolCall(ctx, readOnlyTool, { query: "test" });
    expect(res.isPending).toBe(false);
    expect(res.result).toEqual([{ id: "task-1", title: "Test" }]);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(ctx, { query: "test" });
  });

  it("bypasses confirmation interception when ctx.skipHITL is true", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ id: "task-2", status: "created" });

    const consequentialTool: LifeOSTool = {
      id: "test_consequential",
      name: "test_consequential",
      description: "Consequential tool",
      category: "tasks",
      riskTier: "tier3_consequential",
      schema: null as any,
      execute: mockExecute,
    };

    const ctx: ToolContext = {
      userId: testUserId,
      skipHITL: true,
    };

    const res = await interceptToolCall(ctx, consequentialTool, { title: "Urgent Task" });
    expect(res.isPending).toBe(false);
    expect(res.result).toEqual({ id: "task-2", status: "created" });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("maps database action row to client DTO accurately", () => {
    const now = new Date();
    const expires = new Date(now.getTime() + ACTION_TTL_MS);

    const row: any = {
      id: "action-uuid-1",
      conversationId: "conv-uuid-1",
      messageId: "msg-uuid-1",
      userId: "user-uuid-1",
      toolName: "tasks_create",
      riskLevel: "consequential",
      status: "pending",
      parameters: { title: "Complete report" },
      previewData: {
        summary: 'Create task "Complete report"',
        affectedEntities: [{ domain: "tasks", name: "Complete report" }],
      },
      expiresAt: expires,
      executedAt: null,
      errorMessage: null,
      createdAt: now,
    };

    const dto = mapActionToDTO(row);
    expect(dto.id).toBe("action-uuid-1");
    expect(dto.toolName).toBe("tasks_create");
    expect(dto.riskLevel).toBe("consequential");
    expect(dto.status).toBe("pending");
    expect(dto.parameters.title).toBe("Complete report");
    expect(dto.previewData.summary).toContain("Complete report");
    expect(dto.expiresAt).toBe(expires.toISOString());
    expect(dto.executedAt).toBeNull();
  });
});
