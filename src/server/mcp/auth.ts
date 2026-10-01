/**
 * MCP Authentication & Identity Resolution
 *
 * Enforces zero-trust authentication boundary:
 * 1. Derives authenticated identity strictly from verified PostgreSQL Better Auth session.
 * 2. Supports plaintext tokens and AES-256-GCM encrypted tokens (v1:...).
 * 3. Rejects caller identity spoofing (userId, user_id, user-id) before any schema normalization.
 * 4. Fails closed with AuthError when tokens are missing, expired, revoked, or tampered.
 */

import { and, eq, gt } from "drizzle-orm";
import { db } from "@/server/db";
import { session, user } from "@/server/db/schema/auth";
import { loadCredentials } from "@/cli/config";
import { AuthError, UsageError } from "@/cli/errors";
import { decryptSecret } from "@/lib/crypto";
import type { McpContext } from "./types";

/**
 * Validates that no caller identity spoofing attributes were passed in MCP requests.
 * Recursively inspects incoming argument trees before any schema stripping occurs.
 */
export function assertNoCallerSpoofing(args: unknown): void {
  if (!args || typeof args !== "object") {
    return;
  }

  const forbiddenKeys = [
    "user",
    "userid",
    "user_id",
    "user-id",
    "agentid",
    "agent_id",
    "agent-id",
    "agenttokenid",
    "agent_token_id",
    "agent-token-id",
    "tenantid",
    "tenant_id",
    "tenant-id",
    "caller",
    "callerid",
    "caller_id",
    "caller-id",
    "actor",
    "actorid",
    "actor_id",
    "actor-id",
    "principal",
    "principalid",
    "principal_id",
    "principal-id",
    "ownerid",
    "owner_id",
    "owner-id",
    "createdby",
    "created_by",
    "created-by",
    "updatedby",
    "updated_by",
    "updated-by",
  ];

  function checkRecord(target: unknown): void {
    if (!target || typeof target !== "object") {
      return;
    }

    if (Array.isArray(target)) {
      for (const item of target) {
        checkRecord(item);
      }
      return;
    }

    for (const key of Object.keys(target as Record<string, unknown>)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (forbiddenKeys.includes(normalized) || forbiddenKeys.includes(key.toLowerCase())) {
        throw new UsageError(
          `Specifying '${key}' is prohibited. Caller identity is strictly bound to the authenticated session.`
        );
      }
      checkRecord((target as Record<string, unknown>)[key]);
    }
  }

  checkRecord(args);
}

/**
 * Validates that an in-flight MCP context session has not expired.
 */
export function verifySessionActive(context: McpContext): void {
  if (!context?.session?.expiresAt || new Date() >= new Date(context.session.expiresAt)) {
    throw new AuthError("Active session has expired. Please re-authenticate.");
  }
}

/**
 * Resolves the authentication token following strict precedence:
 * 1. CLI flag / argument `tokenOverride`
 * 2. Environment variable `LIFEOS_TOKEN`
 * 3. Stored credentials file `~/.config/lifeos/credentials.json`
 *
 * If the token starts with `v1:`, it is decrypted using AES-256-GCM.
 * Validates against PostgreSQL Better Auth session and user tables.
 */
export async function resolveMcpAuth(
  tokenOverride?: string,
  configPath?: string
): Promise<McpContext> {
  let rawToken: string | undefined;

  if (tokenOverride && typeof tokenOverride === "string" && tokenOverride.trim()) {
    rawToken = tokenOverride.trim();
  } else if (process.env.LIFEOS_TOKEN && process.env.LIFEOS_TOKEN.trim()) {
    rawToken = process.env.LIFEOS_TOKEN.trim();
  } else {
    const creds = loadCredentials(configPath);
    if (creds?.token && creds.token.trim()) {
      rawToken = creds.token.trim();
    }
  }

  if (!rawToken) {
    throw new AuthError(
      "Authentication required: missing or invalid LifeOS session token. Provide --token, set LIFEOS_TOKEN, or run 'lifeos login'."
    );
  }

  // Handle AES-256-GCM encrypted token
  let cleanToken = rawToken;
  if (rawToken.startsWith("v1:")) {
    try {
      cleanToken = decryptSecret(rawToken).trim();
    } catch {
      throw new AuthError(
        "Authentication required: session token is invalid, expired, or tampered with."
      );
    }
  }

  if (!cleanToken) {
    throw new AuthError(
      "Authentication required: resolved session token is empty."
    );
  }

  // Check for LifeOS Agent Token (lifeos_ag_...)
  if (cleanToken.startsWith("lifeos_ag_")) {
    try {
      const { resolveAgentByToken } = await import("@/server/agents/token-service");
      const agent = await resolveAgentByToken(cleanToken);
      const [u] = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
        })
        .from(user)
        .where(eq(user.id, agent.userId))
        .limit(1);

      if (!u) {
        throw new AuthError("Authentication required: agent owner user not found.");
      }

      return {
        user: u,
        session: {
          id: agent.id,
          userId: agent.userId,
          expiresAt: agent.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
        agent,
        isAgent: true,
      };
    } catch (error: any) {
      if (error instanceof AuthError) throw error;
      throw new AuthError(`Authentication required: ${error.message}`);
    }
  }

  const now = new Date();
  const [row] = await db
    .select({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      session: {
        id: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt,
      },
    })
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .where(and(eq(session.token, cleanToken), gt(session.expiresAt, now)))
    .limit(1);

  if (!row) {
    throw new AuthError(
      "Authentication required: session token is invalid, expired, or revoked."
    );
  }

  return {
    user: row.user,
    session: row.session,
    agent: {
      id: row.session.id,
      userId: row.user.id,
      name: "MCP Client",
      tokenPrefix: "mcp_session",
      provider: "mcp",
      status: "active",
      expiresAt: row.session.expiresAt,
      capabilities: new Set(["READ", "WRITE", "EXECUTE", "DESTRUCTIVE"]),
      permissions: [],
    },
    isAgent: true,
  };
}
