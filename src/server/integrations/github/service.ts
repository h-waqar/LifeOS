import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { integrationConnections } from "@/server/db/schema";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { createAuditLog } from "@/server/audit";
import { GitHubClient } from "./client";
import type {
  ConnectGitHubInput,
  GitHubConnectionDTO,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: GitHub service cannot be initialized in the browser."
  );
}

export class GitHubService {
  /**
   * Connects a GitHub account using a personal access token or OAuth token.
   * Verifies credentials against the GitHub API, encrypts tokens with AES-256-GCM,
   * and persists connection metadata.
   */
  async connectWithToken(
    userId: string,
    input: ConnectGitHubInput,
    actor?: string
  ): Promise<GitHubConnectionDTO> {
    if (!userId?.trim()) {
      throw new Error("Missing user identifier");
    }

    // 1. Verify token by fetching user profile
    const client = new GitHubClient({ token: input.token });
    const userProfile = await client.getUser();

    // 2. Encrypt token using AES-256-GCM
    const encryptedToken = encryptSecret(input.token);
    const encryptedWebhookSecret = input.webhookSecret
      ? encryptSecret(input.webhookSecret)
      : undefined;

    const metadata: Record<string, unknown> = {
      username: userProfile.login,
      avatarUrl: userProfile.avatar_url,
      repos: input.repos || [],
      webhookSecretEncrypted: encryptedWebhookSecret,
      lastSyncAt: null,
      lastEventId: null,
    };

    // 3. Upsert connection record
    const [saved] = await db
      .insert(integrationConnections)
      .values({
        userId,
        provider: "github",
        status: "connected",
        encryptedAccessToken: encryptedToken,
        externalAccountId: userProfile.login,
        metadata,
      })
      .onConflictDoUpdate({
        target: [integrationConnections.userId, integrationConnections.provider],
        set: {
          status: "connected",
          encryptedAccessToken: encryptedToken,
          externalAccountId: userProfile.login,
          metadata,
          updatedAt: new Date(),
        },
      })
      .returning();

    // 4. Log audit event
    await createAuditLog({
      userId,
      category: "mutation",
      action: "integration.github_connected",
      status: "success",
      actor: actor || userId,
      details: {
        provider: "github",
        username: userProfile.login,
        reposCount: (input.repos || []).length,
      },
    });

    const connMeta = (saved.metadata || {}) as Record<string, unknown>;

    return {
      connected: true,
      status: "connected",
      username: userProfile.login,
      avatarUrl: userProfile.avatar_url,
      repos: Array.isArray(connMeta.repos) ? (connMeta.repos as string[]) : [],
      lastSyncAt: typeof connMeta.lastSyncAt === "string" ? connMeta.lastSyncAt : null,
      lastEventId: typeof connMeta.lastEventId === "string" ? connMeta.lastEventId : null,
    };
  }

  /**
   * Retrieves sanitized connection details for a user without leaking tokens.
   */
  async getConnection(userId: string): Promise<GitHubConnectionDTO> {
    if (!userId?.trim()) {
      return {
        connected: false,
        status: "disconnected",
        username: null,
        avatarUrl: null,
        repos: [],
        lastSyncAt: null,
        lastEventId: null,
      };
    }

    const [conn] = await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "github")
        )
      )
      .limit(1);

    if (!conn || conn.status === "disconnected") {
      return {
        connected: false,
        status: "disconnected",
        username: null,
        avatarUrl: null,
        repos: [],
        lastSyncAt: null,
        lastEventId: null,
      };
    }

    const meta = (conn.metadata || {}) as Record<string, unknown>;

    return {
      connected: conn.status === "connected",
      status: conn.status as GitHubConnectionDTO["status"],
      username: (meta.username as string) || conn.externalAccountId || null,
      avatarUrl: (meta.avatarUrl as string) || null,
      repos: Array.isArray(meta.repos) ? (meta.repos as string[]) : [],
      lastSyncAt: typeof meta.lastSyncAt === "string" ? meta.lastSyncAt : null,
      lastEventId: typeof meta.lastEventId === "string" ? meta.lastEventId : null,
    };
  }

  /**
   * Returns decrypted access token for server-side API operations.
   */
  async getDecryptedToken(userId: string): Promise<string | null> {
    const [conn] = await db
      .select({
        status: integrationConnections.status,
        encryptedAccessToken: integrationConnections.encryptedAccessToken,
      })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "github")
        )
      )
      .limit(1);

    if (!conn || conn.status !== "connected" || !conn.encryptedAccessToken) {
      return null;
    }

    try {
      return decryptSecret(conn.encryptedAccessToken);
    } catch {
      return null;
    }
  }

  /**
   * Returns decrypted webhook secret if configured.
   */
  async getDecryptedWebhookSecret(userId: string): Promise<string | null> {
    const [conn] = await db
      .select({
        metadata: integrationConnections.metadata,
      })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "github")
        )
      )
      .limit(1);

    const meta = (conn?.metadata || {}) as Record<string, unknown>;
    const encrypted = meta.webhookSecretEncrypted;
    if (typeof encrypted === "string" && encrypted) {
      try {
        return decryptSecret(encrypted);
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Disconnects GitHub integration and wipes encrypted tokens.
   */
  async disconnect(userId: string, actor?: string): Promise<void> {
    await db
      .update(integrationConnections)
      .set({
        status: "disconnected",
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        metadata: {},
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "github")
        )
      );

    await createAuditLog({
      userId,
      category: "mutation",
      action: "integration.github_disconnected",
      status: "success",
      actor: actor || userId,
      details: { provider: "github" },
    });
  }
}

export const githubService = new GitHubService();
