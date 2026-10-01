/**
 * Phase 14 Plan 14-01: Inbound Webhook Identity Spoofing & GitHub Fail-Closed Security Suite
 *
 * Verifies:
 * - SEC-01: Elimination of inbound webhook identity spoofing (no `userId = token` fallback)
 * - SEC-02: Cryptographic fail-closed enforcement for GitHub webhooks (mandatory HMAC, no limit(1) fallback)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { POST as incomingWebhookPost } from "@/app/api/integrations/webhooks/incoming/route";
import { POST as githubWebhookPost } from "@/app/api/integrations/webhooks/github/route";
import {
  WebhookHandler,
  WebhookAuthenticationError,
  WebhookVerificationError,
} from "@/server/integrations/webhooks/handler";
import { encryptSecret } from "@/lib/crypto";

// Hoisted mocks for event bus and dependencies
const { mockEvents, mockDbData } = vi.hoisted(() => {
  return {
    mockEvents: [] as any[],
    mockDbData: {
      agentTokens: new Map<string, any>(),
      integrationConnections: new Map<string, any>(),
      users: new Map<string, any>(),
      deliveries: [] as any[],
    },
  };
});

vi.mock("@/server/events/event-bus", () => ({
  eventBus: {
    publish: vi.fn(async (event: any) => {
      mockEvents.push(event);
    }),
  },
}));

vi.mock("@/server/events", () => ({
  eventBus: {
    publish: vi.fn(async (event: any) => {
      mockEvents.push(event);
    }),
  },
  createDomainEvent: (type: string, userId: string, payload: any) => ({
    id: `ev-${Math.random().toString(36).slice(2)}`,
    type,
    userId,
    payload,
    timestamp: new Date().toISOString(),
  }),
}));

vi.mock("@/server/integrations/github/sync-engine", () => ({
  githubSyncEngine: {
    ingestWebhookEvent: vi.fn(async (_userId: string, _eventType: string, _payload: any) => {
      return 1;
    }),
  },
}));

vi.mock("@/server/db", () => {
  return {
    db: {
      select: (fields?: any) => ({
        from: (table: any) => ({
          where: (condition: any) => ({
            limit: async () => {
              const rows = Array.from(mockDbData.integrationConnections.values());
              return rows;
            },
            then: (resolve: any) => resolve(Array.from(mockDbData.integrationConnections.values())),
          }),
          innerJoin: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        }),
      }),
      insert: (table: any) => ({
        values: (data: any) => {
          mockDbData.deliveries.push(data);
          return {
            returning: async () => [data],
          };
        },
      }),
    },
  };
});

describe("Phase 14 Plan 14-01: Inbound Webhook Identity Spoofing Remediation", () => {
  const victimUserId = "victim-user-uuid-9999";
  const legitimateUserId = "legit-user-uuid-1111";
  const legitimateSecret = "super-secret-automation-key-32chars!";

  beforeEach(() => {
    mockEvents.length = 0;
    mockDbData.agentTokens.clear();
    mockDbData.integrationConnections.clear();
    mockDbData.deliveries.length = 0;
    vi.clearAllMocks();
  });

  describe("1. Inbound Identity Spoofing Vector Elimination", () => {
    it("rejects request when victim userId is provided directly in Authorization header", async () => {
      const req = new NextRequest("http://localhost:3000/api/integrations/webhooks/incoming", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${victimUserId}`,
          "x-webhook-provider": "zapier",
          "x-webhook-event": "task.trigger",
        },
        body: JSON.stringify({ action: "drain_inbox", target: victimUserId }),
      });

      const res = await incomingWebhookPost(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toContain("Authentication failed");
      expect(mockEvents.length).toBe(0);
    });

    it("rejects request when victim userId is provided in x-lifeos-webhook-secret header", async () => {
      const req = new NextRequest("http://localhost:3000/api/integrations/webhooks/incoming", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-lifeos-webhook-secret": victimUserId,
          "x-webhook-provider": "n8n",
        },
        body: JSON.stringify({ malicious: true }),
      });

      const res = await incomingWebhookPost(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toContain("Authentication failed");
      expect(mockEvents.length).toBe(0);
    });

    it("rejects request when credentials are empty or missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/integrations/webhooks/incoming", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ test: 123 }),
      });

      const res = await incomingWebhookPost(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toContain("Authentication required");
      expect(mockEvents.length).toBe(0);
    });

    it("rejects malformed json payload with 400 even if authenticated", async () => {
      // Mock an active connection
      mockDbData.integrationConnections.set("conn-1", {
        id: "conn-1",
        userId: legitimateUserId,
        provider: "automation",
        status: "connected",
        metadata: {
          webhookSecret: legitimateSecret,
        },
      });

      const req = new NextRequest("http://localhost:3000/api/integrations/webhooks/incoming", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-lifeos-webhook-secret": legitimateSecret,
        },
        body: "NOT_VALID_JSON{{{",
      });

      const res = await incomingWebhookPost(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain("Invalid JSON payload");
      expect(mockEvents.length).toBe(0);
    });

    it("successfully authenticates with valid registered integration webhook secret and emits domain event for genuine user", async () => {
      mockDbData.integrationConnections.set("conn-1", {
        id: "conn-1",
        userId: legitimateUserId,
        provider: "automation",
        status: "connected",
        metadata: {
          webhookSecretEncrypted: encryptSecret(legitimateSecret),
        },
      });

      const payload = { event: "ping", source: "zapier" };
      const req = new NextRequest("http://localhost:3000/api/integrations/webhooks/incoming", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-lifeos-webhook-secret": legitimateSecret,
          "x-webhook-provider": "zapier",
          "x-webhook-event": "custom.event",
        },
        body: JSON.stringify(payload),
      });

      const res = await incomingWebhookPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Verify domain event attribution: strictly bound to legitimateUserId, never attacker string
      expect(mockEvents.length).toBe(1);
      expect(mockEvents[0].userId).toBe(legitimateUserId);
      expect(mockEvents[0].name).toBe("integration.webhook_received");
      expect(mockEvents[0].payload.provider).toBe("zapier");
    });
  });

  describe("2. GitHub Webhook Fail-Closed Security", () => {
    const handler = new WebhookHandler();
    const githubSecret = "github-webhook-secret-production-key-99";
    const samplePayload = {
      action: "opened",
      repository: { full_name: "testuser/lifeos", name: "lifeos" },
      sender: { login: "testuser" },
    };
    const rawBody = JSON.stringify(samplePayload);

    function computeGitHubSignature(body: string, secret: string): string {
      const hmac = crypto.createHmac("sha256", secret).update(Buffer.from(body, "utf-8")).digest("hex");
      return `sha256=${hmac}`;
    }

    it("verifies valid HMAC-SHA256 signature and ingests event", async () => {
      const validSignature = computeGitHubSignature(rawBody, githubSecret);

      mockDbData.integrationConnections.set("github-1", {
        id: "github-1",
        userId: legitimateUserId,
        provider: "github",
        status: "connected",
        metadata: {
          webhookSecretEncrypted: encryptSecret(githubSecret),
        },
      });

      const result = await handler.handleGitHubWebhook({
        rawBody,
        payload: samplePayload,
        eventType: "issues",
        signatureHeader: validSignature,
      });

      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBe(1);
    });

    it("fails closed when signature header is missing", async () => {
      mockDbData.integrationConnections.set("github-1", {
        id: "github-1",
        userId: legitimateUserId,
        provider: "github",
        status: "connected",
        metadata: {
          webhookSecretEncrypted: encryptSecret(githubSecret),
        },
      });

      await expect(
        handler.handleGitHubWebhook({
          rawBody,
          payload: samplePayload,
          eventType: "issues",
          signatureHeader: null,
        })
      ).rejects.toThrow(WebhookVerificationError);

      await expect(
        handler.handleGitHubWebhook({
          rawBody,
          payload: samplePayload,
          eventType: "issues",
          signatureHeader: "",
        })
      ).rejects.toThrow("Missing or malformed X-Hub-Signature-256 header");
    });

    it("fails closed when signature header is malformed (no sha256= prefix or wrong length)", async () => {
      mockDbData.integrationConnections.set("github-1", {
        id: "github-1",
        userId: legitimateUserId,
        provider: "github",
        status: "connected",
        metadata: {
          webhookSecretEncrypted: encryptSecret(githubSecret),
        },
      });

      await expect(
        handler.handleGitHubWebhook({
          rawBody,
          payload: samplePayload,
          eventType: "issues",
          signatureHeader: "md5=1234567890",
        })
      ).rejects.toThrow("Missing or malformed X-Hub-Signature-256 header");

      await expect(
        handler.handleGitHubWebhook({
          rawBody,
          payload: samplePayload,
          eventType: "issues",
          signatureHeader: "sha256=short",
        })
      ).rejects.toThrow("Missing or malformed X-Hub-Signature-256 header");
    });

    it("fails closed when HMAC signature is invalid", async () => {
      const forgedSignature = "sha256=" + "a".repeat(64);

      mockDbData.integrationConnections.set("github-1", {
        id: "github-1",
        userId: legitimateUserId,
        provider: "github",
        status: "connected",
        metadata: {
          webhookSecretEncrypted: encryptSecret(githubSecret),
        },
      });

      await expect(
        handler.handleGitHubWebhook({
          rawBody,
          payload: samplePayload,
          eventType: "push",
          signatureHeader: forgedSignature,
        })
      ).rejects.toThrow("Invalid GitHub HMAC-SHA256 signature");
    });

    it("fails closed when user integration exists but webhookSecretEncrypted is absent", async () => {
      const validSignature = computeGitHubSignature(rawBody, githubSecret);

      mockDbData.integrationConnections.set("github-unconfigured", {
        id: "github-unconfigured",
        userId: legitimateUserId,
        provider: "github",
        status: "connected",
        metadata: {
          // No webhookSecretEncrypted configured
        },
      });

      await expect(
        handler.handleGitHubWebhook({
          rawBody,
          payload: samplePayload,
          eventType: "push",
          signatureHeader: validSignature,
          userId: legitimateUserId,
        })
      ).rejects.toThrow("GitHub webhook secret is not configured for user");
    });

    it("fails closed and does not fall back to limit(1) when no integration matches", async () => {
      const signature = computeGitHubSignature(rawBody, "unknown-unregistered-secret-key");

      mockDbData.integrationConnections.set("github-1", {
        id: "github-1",
        userId: victimUserId,
        provider: "github",
        status: "connected",
        metadata: {
          webhookSecretEncrypted: encryptSecret("different-secret-from-victim"),
        },
      });

      await expect(
        handler.handleGitHubWebhook({
          rawBody,
          payload: samplePayload,
          eventType: "push",
          signatureHeader: signature,
        })
      ).rejects.toThrow("Invalid GitHub HMAC-SHA256 signature: no matching integration secret");
    });

    it("fails closed when attacker provides target userId but supplies forged signature", async () => {
      const forgedSignature = "sha256=" + "f".repeat(64);

      mockDbData.integrationConnections.set("github-victim", {
        id: "github-victim",
        userId: victimUserId,
        provider: "github",
        status: "connected",
        metadata: {
          webhookSecretEncrypted: encryptSecret(githubSecret),
        },
      });

      await expect(
        handler.handleGitHubWebhook({
          rawBody,
          payload: samplePayload,
          eventType: "pull_request",
          signatureHeader: forgedSignature,
          userId: victimUserId,
        })
      ).rejects.toThrow("Invalid GitHub HMAC-SHA256 signature");
    });

    it("rejects cross-tenant attack where attacker signs with tenant A's secret but targets tenant B", async () => {
      const tenantASecret = "tenant-a-secret-secret-key-32ch!";
      const tenantBSecret = "tenant-b-secret-secret-key-32ch!";

      const sigWithTenantA = computeGitHubSignature(rawBody, tenantASecret);

      mockDbData.integrationConnections.set("github-tenant-b", {
        id: "github-tenant-b",
        userId: "tenant-b-user",
        provider: "github",
        status: "connected",
        metadata: {
          webhookSecretEncrypted: encryptSecret(tenantBSecret),
        },
      });

      await expect(
        handler.handleGitHubWebhook({
          rawBody,
          payload: samplePayload,
          eventType: "push",
          signatureHeader: sigWithTenantA,
          userId: "tenant-b-user", // targeted victim
        })
      ).rejects.toThrow("Invalid GitHub HMAC-SHA256 signature");
    });

    it("HTTP route returns 401 on missing or invalid signature", async () => {
      const req = new NextRequest("http://localhost:3000/api/integrations/webhooks/github", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-github-event": "push",
        },
        body: JSON.stringify({ ref: "refs/heads/main" }),
      });

      const res = await githubWebhookPost(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toContain("Missing or malformed X-Hub-Signature-256 header");
    });
  });
});
