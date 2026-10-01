import crypto from "node:crypto";
import { db } from "@/server/db";
import { webhookDeliveries, integrationConnections } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { eventBus } from "@/server/events/event-bus";
import { createDomainEvent } from "@/server/events/types";
import { githubSyncEngine } from "../github/sync-engine";

import { resolveAgentByToken } from "@/server/agents/token-service";
import { requireAuthenticatedUser } from "@/server/auth/guard";
import type { NextRequest } from "next/server";

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

export class WebhookAuthenticationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message = "Webhook authentication failed",
    status = 401,
    code = "WEBHOOK_AUTHENTICATION_FAILED"
  ) {
    super(message);
    this.name = "WebhookAuthenticationError";
    this.status = status;
    this.code = code;
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
   * Fails closed: requires cryptographic HMAC-SHA256 signature verification.
   * Never falls back to arbitrary database users or unverified connections.
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

    // 1. Mandatory HMAC signature presence and format check
    if (
      !signatureHeader ||
      typeof signatureHeader !== "string" ||
      !signatureHeader.startsWith("sha256=") ||
      signatureHeader.length !== 71
    ) {
      await this.logDelivery(
        userId || null,
        "github",
        eventType,
        finalDeliveryId,
        "failed",
        payload,
        {},
        "Missing or malformed X-Hub-Signature-256 header"
      );
      throw new WebhookVerificationError("Missing or malformed X-Hub-Signature-256 header");
    }

    let targetUserId: string;

    // 2. Deterministic target resolution and signature verification
    if (userId) {
      // Explicit target user provided: verify against this specific user's GitHub integration
      const [userConn] = await db
        .select({
          userId: integrationConnections.userId,
          metadata: integrationConnections.metadata,
          status: integrationConnections.status,
        })
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.userId, userId),
            eq(integrationConnections.provider, "github"),
            eq(integrationConnections.status, "connected")
          )
        )
        .limit(1);

      if (!userConn) {
        await this.logDelivery(
          userId,
          "github",
          eventType,
          finalDeliveryId,
          "failed",
          payload,
          {},
          "No registered active GitHub integration for specified user"
        );
        throw new WebhookVerificationError("No registered active GitHub integration for specified user");
      }

      const meta = (userConn.metadata || {}) as Record<string, any>;
      if (!meta.webhookSecretEncrypted) {
        await this.logDelivery(
          userId,
          "github",
          eventType,
          finalDeliveryId,
          "failed",
          payload,
          {},
          "GitHub webhook secret is not configured for user"
        );
        throw new WebhookVerificationError("GitHub webhook secret is not configured for user");
      }

      let secret: string;
      try {
        secret = decryptSecret(meta.webhookSecretEncrypted);
      } catch {
        await this.logDelivery(
          userId,
          "github",
          eventType,
          finalDeliveryId,
          "failed",
          payload,
          {},
          "Failed to decrypt GitHub webhook secret"
        );
        throw new WebhookVerificationError("Failed to decrypt configured GitHub webhook secret");
      }

      const isValid = this.verifyGitHubSignature(rawBody, signatureHeader, secret);
      if (!isValid) {
        await this.logDelivery(
          userId,
          "github",
          eventType,
          finalDeliveryId,
          "failed",
          payload,
          {},
          "Invalid GitHub HMAC-SHA256 signature"
        );
        throw new WebhookVerificationError("Invalid GitHub HMAC-SHA256 signature");
      }

      targetUserId = userId;
    } else {
      // No explicit user provided: find all active GitHub integrations with configured secrets
      const connections = await db
        .select({
          userId: integrationConnections.userId,
          metadata: integrationConnections.metadata,
        })
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.provider, "github"),
            eq(integrationConnections.status, "connected")
          )
        );

      if (connections.length === 0) {
        await this.logDelivery(
          null,
          "github",
          eventType,
          finalDeliveryId,
          "failed",
          payload,
          {},
          "No registered active GitHub integrations"
        );
        throw new WebhookVerificationError("No registered active GitHub integrations");
      }

      const matchedUserIds: string[] = [];
      for (const conn of connections) {
        const meta = (conn.metadata || {}) as Record<string, any>;
        if (!meta.webhookSecretEncrypted) continue;
        try {
          const secret = decryptSecret(meta.webhookSecretEncrypted);
          if (this.verifyGitHubSignature(rawBody, signatureHeader, secret)) {
            matchedUserIds.push(conn.userId);
          }
        } catch {
          // ignore individual decryption failure
        }
      }

      if (matchedUserIds.length === 0) {
        await this.logDelivery(
          null,
          "github",
          eventType,
          finalDeliveryId,
          "failed",
          payload,
          {},
          "HMAC signature did not match any registered integration secret"
        );
        throw new WebhookVerificationError(
          "Invalid GitHub HMAC-SHA256 signature: no matching integration secret"
        );
      }

      if (matchedUserIds.length > 1) {
        await this.logDelivery(
          null,
          "github",
          eventType,
          finalDeliveryId,
          "failed",
          payload,
          {},
          "Ambiguous GitHub webhook: multiple integrations matched signature"
        );
        throw new WebhookVerificationError(
          "Ambiguous GitHub webhook: multiple integrations matched signature"
        );
      }

      targetUserId = matchedUserIds[0];
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
   * Authenticates incoming automation webhooks (Zapier, Make, n8n, custom).
   * Strictly resolves authenticated credentials to an active agent token or registered integration.
   * Fails closed: NEVER accepts arbitrary strings or unauthenticated headers as userId.
   */
  async authenticateIncomingWebhook(
    req: Request | NextRequest,
    options?: { provider?: string; dbClient?: any }
  ): Promise<{ userId: string; authType: "session" | "agent_token" | "integration_secret"; entityId?: string }> {
    const dbClient = options?.dbClient || db;

    // 1. Session-based authentication if available
    try {
      if ("cookies" in req) {
        const { user } = await requireAuthenticatedUser(req as NextRequest);
        if (user?.id) {
          return { userId: user.id, authType: "session" };
        }
      }
    } catch {
      // Not a session request; proceed to bearer / webhook secret verification
    }

    // 2. Extract Authorization or x-lifeos-webhook-secret
    const authHeader = req.headers.get("authorization")?.trim();
    const secretHeader = req.headers.get("x-lifeos-webhook-secret")?.trim();
    const bearerToken = authHeader ? authHeader.replace(/^Bearer\s+/i, "").trim() : undefined;
    const token = bearerToken || secretHeader;

    if (!token) {
      throw new WebhookAuthenticationError(
        "Authentication required: missing bearer token or webhook secret",
        401
      );
    }

    // 3. Check registered agent tokens
    if (bearerToken) {
      try {
        const agent = await resolveAgentByToken(bearerToken, dbClient);
        if (agent?.userId) {
          return {
            userId: agent.userId,
            authType: "agent_token",
            entityId: agent.id,
          };
        }
      } catch {
        // Not a valid agent token; continue to integration secret check
      }
    }

    // 4. Check registered integration connections with encrypted secrets
    const connections = await dbClient
      .select({
        id: integrationConnections.id,
        userId: integrationConnections.userId,
        metadata: integrationConnections.metadata,
        status: integrationConnections.status,
      })
      .from(integrationConnections)
      .where(eq(integrationConnections.status, "connected"));

    for (const conn of connections) {
      const meta = (conn.metadata || {}) as Record<string, any>;
      if (meta.webhookSecretEncrypted) {
        try {
          const decryptedSecret = decryptSecret(meta.webhookSecretEncrypted);
          if (
            token.length === decryptedSecret.length &&
            crypto.timingSafeEqual(Buffer.from(token), Buffer.from(decryptedSecret))
          ) {
            return {
              userId: conn.userId,
              authType: "integration_secret",
              entityId: conn.id,
            };
          }
        } catch {
          // Decryption failure for malformed secret; skip
        }
      } else if (meta.webhookSecret && typeof meta.webhookSecret === "string") {
        if (
          token.length === meta.webhookSecret.length &&
          crypto.timingSafeEqual(Buffer.from(token), Buffer.from(meta.webhookSecret))
        ) {
          return {
            userId: conn.userId,
            authType: "integration_secret",
            entityId: conn.id,
          };
        }
      }
    }

    // 5. Fail closed: no arbitrary credentials permitted
    throw new WebhookAuthenticationError(
      "Authentication failed: invalid, revoked, or unrecognized webhook credential",
      401
    );
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
