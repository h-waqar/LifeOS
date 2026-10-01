// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { tasks, agentTokens, agentChallenges, agentAuditLog } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { executeAgentOperation } from "@/server/agents/safety-boundary";
import { createChallenge, approveChallenge, consumeChallenge } from "@/server/agents/challenges/challenge-service";
import { generateTokenSecret, hashAgentToken } from "@/server/agents/token-service";
import * as attributionLogger from "@/server/agents/audit/attribution-logger";
import type { AgentSafetyContext } from "@/server/agents/permissions/types";
import { POST as incomingWebhookPost } from "@/app/api/integrations/webhooks/incoming/route";
import { webhookHandler, WebhookVerificationError } from "@/server/integrations/webhooks/handler";
import { NextRequest } from "next/server";

describe("Phase 14 Plan 14-05: Real PostgreSQL Security & Battle-Test Integration Suite", () => {
  let probe: ProbeResult;
  let testUserId: string;
  let realAgentTokenId: string;
  let agentContext: AgentSafetyContext;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // LifeOS enforces single-user constraint; use existing user if present, or create one
    const [existingUser] = await db.select().from(user).limit(1);
    if (existingUser) {
      testUserId = existingUser.id;
    } else {
      const [createdUser] = await db
        .insert(user)
        .values({
          id: `user-p14-${crypto.randomUUID()}`,
          name: "Phase 14 Security Tester",
          email: `phase14-sec-${Date.now()}@example.com`,
          emailVerified: true,
        })
        .returning();
      testUserId = createdUser.id;
    }

    // Create a real agent token record
    const { token, tokenHash, tokenPrefix } = generateTokenSecret();
    const [tokenRecord] = await db
      .insert(agentTokens)
      .values({
        userId: testUserId,
        name: "Live DB Integration Agent",
        tokenHash,
        tokenPrefix,
        provider: "live_test",
        status: "active",
      })
      .returning();

    realAgentTokenId = tokenRecord.id;

    agentContext = {
      isAgent: true,
      user: { id: testUserId },
      agent: {
        id: realAgentTokenId,
        userId: testUserId,
        name: "Live DB Integration Agent",
        tokenPrefix,
        provider: "live_test",
        status: "active",
        expiresAt: null,
        capabilities: new Set(["READ", "WRITE", "EXECUTE", "DESTRUCTIVE"]),
        permissions: [],
      },
      provider: "live_test",
      sessionId: "session-p14-live",
    };
  });

  afterAll(async () => {
    if (probe?.isAvailable && testUserId) {
      await db.delete(tasks).where(eq(tasks.userId, testUserId));
      await db.delete(agentAuditLog).where(eq(agentAuditLog.userId, testUserId));
      await db.delete(agentChallenges).where(eq(agentChallenges.userId, testUserId));
      if (realAgentTokenId) {
        await db.delete(agentTokens).where(eq(agentTokens.id, realAgentTokenId));
      }
      await closeDatabase();
    }
  });

  describe("1. Live PostgreSQL Transaction Rollback on Audit Failure", () => {
    it("Normal Case: mutation commits to PostgreSQL alongside agent_audit_log", async () => {
      if (!probe.isAvailable) return;

      const taskTitle = `Committed Live Task ${Date.now()}`;

      const result = await executeAgentOperation({
        context: agentContext,
        toolName: "tasks.create",
        arguments: { title: taskTitle },
        targetUserId: testUserId,
        executor: async (tx: any) => {
          const client = tx ?? db;
          const [inserted] = await client
            .insert(tasks)
            .values({
              userId: testUserId,
              title: taskTitle,
              status: "inbox",
              priority: "high",
            })
            .returning();
          return inserted;
        },
      });

      expect(result.status).toBe("EXECUTED");

      // Verify row exists in PostgreSQL
      const [persistedTask] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, testUserId), eq(tasks.title, taskTitle)))
        .limit(1);

      expect(persistedTask).toBeDefined();
      expect(persistedTask.title).toBe(taskTitle);

      // Verify audit log exists in PostgreSQL
      const [auditEntry] = await db
        .select()
        .from(agentAuditLog)
        .where(
          and(
            eq(agentAuditLog.userId, testUserId),
            eq(agentAuditLog.toolName, "tasks.create"),
            eq(agentAuditLog.status, "EXECUTED")
          )
        )
        .limit(1);

      expect(auditEntry).toBeDefined();
      expect(auditEntry.agentTokenId).toBe(realAgentTokenId);
    });

    it("Audit Failure: PostgreSQL transaction ROLLS BACK task insertion when audit fails", async () => {
      if (!probe.isAvailable) return;

      const uncommittedTaskTitle = `Uncommitted Ephemeral Task ${Date.now()}`;

      // Temporarily mock logAgentAudit to reject inside the transaction
      const auditSpy = vi
        .spyOn(attributionLogger, "logAgentAudit")
        .mockRejectedValueOnce(new Error("FATAL_POSTGRES_AUDIT_DISK_ERROR"));

      await expect(
        executeAgentOperation({
          context: agentContext,
          toolName: "tasks.create",
          arguments: { title: uncommittedTaskTitle },
          targetUserId: testUserId,
          executor: async (tx: any) => {
            const client = tx ?? db;
            const [inserted] = await client
              .insert(tasks)
              .values({
                userId: testUserId,
                title: uncommittedTaskTitle,
                status: "inbox",
                priority: "medium",
              })
              .returning();
            return inserted;
          },
        })
      ).rejects.toThrow("FATAL_POSTGRES_AUDIT_DISK_ERROR");

      auditSpy.mockRestore();

      // INVARIANT: Task must NOT exist in PostgreSQL because transaction rolled back!
      const uncommittedRows = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, testUserId),
            eq(tasks.title, uncommittedTaskTitle)
          )
        );

      expect(uncommittedRows.length).toBe(0);
    });
  });

  describe("2. Live PostgreSQL Concurrency & Exactly-Once Consumption", () => {
    it("guarantees atomic single consumption under concurrent race conditions in live PostgreSQL", async () => {
      if (!probe.isAvailable) return;

      // Create a pending challenge in live PostgreSQL
      const challenge = await createChallenge({
        userId: testUserId,
        agentTokenId: realAgentTokenId,
        operation: "tasks.delete",
        capability: "DESTRUCTIVE",
        resource: "tasks",
        resourceId: "target-task-999",
        arguments: { id: "target-task-999" },
        ttlMinutes: 5,
      });

      // Approve the challenge
      await approveChallenge(testUserId, challenge.id);

      let executions = 0;
      const doConsume = () =>
        consumeChallenge({
          challengeId: challenge.id,
          userId: testUserId,
          agentTokenId: realAgentTokenId,
          operation: "tasks.delete",
          arguments: { id: "target-task-999" },
          executor: async () => {
            executions++;
            return { deleted: true };
          },
        });

      // Launch 5 concurrent executions against the same approved challenge
      const results = await Promise.allSettled([
        doConsume(),
        doConsume(),
        doConsume(),
        doConsume(),
        doConsume(),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly 1 winner
      expect(fulfilled.length).toBe(1);
      // Exactly 4 rejected with concurrency collision or already-consumed errors
      expect(rejected.length).toBe(4);
      // Executor was called exactly once
      expect(executions).toBe(1);

      // Verify row in PostgreSQL is CONSUMED
      const [finalChallenge] = await db
        .select()
        .from(agentChallenges)
        .where(eq(agentChallenges.id, challenge.id))
        .limit(1);

      expect(finalChallenge.status).toBe("CONSUMED");
      expect(finalChallenge.consumedAt).toBeInstanceOf(Date);
    });
  });

  describe("3. Adversarial Attack Vectors Against Live Endpoints", () => {
    it("Inbound Webhook: strictly rejects attacker-controlled Bearer token spoofing", async () => {
      const spoofedReq = new NextRequest("http://localhost:3000/api/integrations/webhooks/incoming", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${testUserId}`, // Attacker attempting victim userId injection
        },
        body: JSON.stringify({
          eventType: "task.created",
          data: { title: "Malicious Spoofed Task" },
        }),
      });

      const res = await incomingWebhookPost(spoofedReq);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/Authentication failed|Authentication required/i);
    });

    it("Inbound Webhook: strictly rejects header webhook-secret impersonation", async () => {
      const spoofedReq = new NextRequest("http://localhost:3000/api/integrations/webhooks/incoming", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lifeos-webhook-secret": testUserId, // Attacker trying victim userId as secret
        },
        body: JSON.stringify({
          eventType: "task.created",
          data: { title: "Malicious Spoofed Task" },
        }),
      });

      const res = await incomingWebhookPost(spoofedReq);
      expect(res.status).toBe(401);
    });

    it("GitHub Webhook: fails closed with 401 when signature is absent", async () => {
      const payload = {
        repository: { name: "test-repo" },
        action: "push",
      };

      await expect(
        webhookHandler.handleGitHubWebhook({
          rawBody: JSON.stringify(payload),
          eventType: "push",
          payload,
        })
      ).rejects.toThrow(WebhookVerificationError);
    });

    it("GitHub Webhook: fails closed with 401 when signature is forged", async () => {
      const payload = {
        repository: { name: "test-repo" },
        action: "push",
      };

      await expect(
        webhookHandler.handleGitHubWebhook({
          rawBody: JSON.stringify(payload),
          eventType: "push",
          signatureHeader: "sha256=0000000000000000000000000000000000000000000000000000000000000000",
          payload,
        })
      ).rejects.toThrow(WebhookVerificationError);
    });
  });
});
