// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  WebhookHandler,
  WebhookVerificationError,
} from "@/server/integrations/webhooks/handler";
import { eventBus } from "@/server/events/event-bus";

// Mock database
vi.mock("@/server/db", () => {
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      }),
    },
  };
});

describe("Plan 08-02: Webhooks (Unit Tests)", () => {
  const handler = new WebhookHandler();
  const testSecret = "super-secret-webhook-key-12345";
  const testPayload = JSON.stringify({ action: "opened", issue: { number: 42 } });

  function generateSignature(body: string, secret: string): string {
    const hash = crypto.createHmac("sha256", secret).update(body).digest("hex");
    return `sha256=${hash}`;
  }

  describe("1. HMAC-SHA256 Signature Verification", () => {
    it("successfully verifies valid GitHub webhook signature", () => {
      const signature = generateSignature(testPayload, testSecret);
      const isValid = handler.verifyGitHubSignature(testPayload, signature, testSecret);
      expect(isValid).toBe(true);
    });

    it("rejects when signature does not match payload", () => {
      const signature = generateSignature(testPayload, testSecret);
      const tamperedPayload = JSON.stringify({ action: "opened", issue: { number: 99 } });
      const isValid = handler.verifyGitHubSignature(tamperedPayload, signature, testSecret);
      expect(isValid).toBe(false);
    });

    it("rejects when secret is different", () => {
      const signature = generateSignature(testPayload, "wrong-secret");
      const isValid = handler.verifyGitHubSignature(testPayload, signature, testSecret);
      expect(isValid).toBe(false);
    });

    it("rejects when signature header prefix is not sha256=", () => {
      const hash = crypto.createHmac("sha256", testSecret).update(testPayload).digest("hex");
      const isValid = handler.verifyGitHubSignature(testPayload, `sha1=${hash}`, testSecret);
      expect(isValid).toBe(false);
    });

    it("rejects when signature header or secret is missing or empty", () => {
      expect(handler.verifyGitHubSignature(testPayload, null, testSecret)).toBe(false);
      expect(handler.verifyGitHubSignature(testPayload, "", testSecret)).toBe(false);
      expect(handler.verifyGitHubSignature(testPayload, "sha256=123", "")).toBe(false);
    });

    it("handles binary Buffer bodies correctly", () => {
      const buffer = Buffer.from(testPayload, "utf-8");
      const signature = generateSignature(testPayload, testSecret);
      expect(handler.verifyGitHubSignature(buffer, signature, testSecret)).toBe(true);
    });
  });

  describe("2. Generic Incoming Webhook Processing", () => {
    it("publishes integration.webhook_received domain event", async () => {
      const publishSpy = vi.spyOn(eventBus, "publish").mockResolvedValue(undefined as any);

      const result = await handler.handleIncomingWebhook({
        userId: "user-123",
        provider: "zapier",
        eventType: "lead.created",
        payload: { email: "lead@example.com", name: "Alice" },
      });

      expect(result.success).toBe(true);
      expect(result.deliveryId).toBeDefined();

      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "integration.webhook_received",
          userId: "user-123",
          payload: {
            provider: "zapier",
            eventType: "lead.created",
            payload: { email: "lead@example.com", name: "Alice" },
          },
        })
      );
    });
  });
});
