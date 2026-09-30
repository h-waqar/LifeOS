import crypto from "node:crypto";
import { db } from "@/server/db";
import { webhookDeliveries, integrationConnections } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { eventBus } from "@/server/events/event-bus";
import { createDomainEvent } from "@/server/events/types";
import { githubSyncEngine } from "../github/sync-engine";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Webhook handler cannot be initialized in the browser."
  );
}

export class WebhookVerificationError extends Error {
  readonly status = 401;
  readonly code = "WEBHOOK_VERIFICATION_FAILED";

  constructor(message = "Webhook signature verification failed") {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

export class WebhookHandler {
  /**
   * Verifies an incoming GitHub webhook HMAC-SHA256 signature (X-Hub-Signature-256).
   */
  verifyGitHubSignature(
    rawBody: string | Buffer,
    signatureHeader: string | null,
    secret: string
  ): boolean {
    if (!signatureHeader || !secret) {
      return false;
    }

    const expectedPrefix = "sha256=";
    if (!signatureHeader.startsWith(expectedPrefix)) {
      return false;
    }

    const signature = signatureHeader.slice(expectedPrefix.length);
    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf-8");
    const hmac = crypto.createHmac("sha256", secret).update(bodyBuffer).digest("hex");

    if (signature.length !== hmac.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(hmac, "hex"));
    } catch {
      return false;
    }
  }

  /**
   * Processes an incoming GitHub webhook event.
   */
  async handleGitHubWebhook(params: {
    rawBody: string;
    payload: Record<string, any>;
    eventType: string;
    deliveryId?: string;
    signatureHeader?: string | null;
    userId?: string;
  }): Promise<{ success: boolean; itemsProcessed: number; deliveryId: string }> {
    const { rawBody, payload, eventType, deliveryId, signatureHeader, userId } = params;
    const finalDeliveryId = deliveryId || crypto.randomUUID();

    // Determine target userId: if not provided directly, try to match repository owner or connected account
    let targetUserId = userId;

    if (!targetUserId) {
      // Find user who owns this repository or connected GitHub account
      const repoName = payload.repository?.full_name || payload.repository?.name;
      const [conn] = await db
        .select({ userId: integrationConnections.userId, metadata: integrationConnections.metadata })
        .from(integrationConnections)
        .where(eq(integrationConnections.provider, "github"))
        .limit(1);

      if (conn) {
        targetUserId = conn.userId;
      }
    }

    if (!targetUserId) {
      // Record unassigned webhook delivery
      await this.logDelivery(null, "github", eventType, finalDeliveryId, "ignored", payload, {}, "No matching user found");
      return { success: false, itemsProcessed: 0, deliveryId: finalDeliveryId };
    }

    // Verify signature if webhook secret is configured for user
    const [userConn] = await db
      .select({ metadata: integrationConnections.metadata })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, targetUserId),
          eq(integrationConnections.provider, "github")
        )
      )
      .limit(1);

    const meta = (userConn?.metadata || {}) as Record<string, any>;
    if (meta.webhookSecretEncrypted) {
      const secret = decryptSecret(meta.webhookSecretEncrypted);
      const isValid = this.verifyGitHubSignature(rawBody, signatureHeader ?? null, secret);
      if (!isValid) {
        await this.logDelivery(targetUserId, "github", eventType, finalDeliveryId, "failed", payload, {}, "Invalid HMAC-SHA256 signature");
        throw new WebhookVerificationError("Invalid GitHub HMAC-SHA256 signature");
      }
    }

    try {
      // Ingest directly via sync engine
      const count = await githubSyncEngine.ingestWebhookEvent(targetUserId, eventType, payload);

      await this.logDelivery(targetUserId, "github", eventType, finalDeliveryId, "processed", payload, {}, null);

      return {
        success: true,
        itemsProcessed: count,
        deliveryId: finalDeliveryId,
      };
    } catch (err: any) {
      await this.logDelivery(targetUserId, "github", eventType, finalDeliveryId, "failed", payload, {}, err.message);
      throw err;
    }
  }

  /**
   * Processes generic inbound webhook events from automation tools (Zapier, Make, n8n).
   */
  async handleIncomingWebhook(params: {
    userId: string;
    provider: string;
    eventType: string;
    payload: Record<string, any>;
    headers?: Record<string, any>;
  }): Promise<{ success: boolean; deliveryId: string }> {
    const { userId, provider, eventType, payload, headers } = params;
    const deliveryId = crypto.randomUUID();

    try {
      // 1. Emit domain event so automation engine can trigger user-defined rules
      await eventBus.publish(
        createDomainEvent("integration.webhook_received", userId, {
          provider,
          eventType,
          payload,
        })
      );

      // 2. Log delivery record
      await this.logDelivery(userId, provider, eventType, deliveryId, "processed", payload, headers || {}, null);

      return { success: true, deliveryId };
    } catch (err: any) {
      await this.logDelivery(userId, provider, eventType, deliveryId, "failed", payload, headers || {}, err.message);
      throw err;
    }
  }

  private async logDelivery(
    userId: string | null,
    provider: string,
    eventType: string,
    deliveryId: string,
    status: "processed" | "ignored" | "failed",
    payload: Record<string, any>,
    headers: Record<string, any>,
    errorMessage: string | null
  ): Promise<void> {
    try {
      await db.insert(webhookDeliveries).values({
        userId,
        provider,
        eventType,
        deliveryId,
        status,
        payload,
        headers,
        errorMessage,
      });
    } catch {
      // Non-fatal
    }
  }
}

export const webhookHandler = new WebhookHandler();
