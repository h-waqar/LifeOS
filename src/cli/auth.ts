/**
 * CLI Authentication & Session Resolution
 *
 * Verifies session credentials against PostgreSQL Better Auth tables (session & user),
 * guarantees that user_id is derived strictly from the verified session,
 * and rejects any caller identity spoofing attempts.
 */

import { and, eq, gt } from "drizzle-orm";
import { db } from "@/server/db";
import { session, user } from "@/server/db/schema/auth";
import { resolveToken } from "./config";
import { AuthError, UsageError } from "./errors";
import type { CommandContext, GlobalOptions } from "./types";
import { resolveAgentByToken } from "@/server/agents/token-service";
import { decryptSecret } from "@/lib/crypto";

/**
 * Validates that no caller identity spoofing flags were passed in CLI arguments.
 */
export function assertNoCallerSpoofing(
  flags: unknown
): void {
  if (!flags || typeof flags !== "object") {
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

  checkRecord(flags);
}

/**
 * Resolves and validates the authenticated user and active session.
 * Fails closed with AuthError (exit code 3) if missing, invalid, or expired.
 */
export async function resolveAuthenticatedUser(
  tokenOverride?: string,
  options?: GlobalOptions
): Promise<CommandContext> {
  const token = tokenOverride || resolveToken(options);

  if (!token || !token.trim()) {
    throw new AuthError(
      "Authentication required. Missing session token. Please run 'lifeos login' or provide --token / LIFEOS_TOKEN."
    );
  }

  let cleanToken = token.trim();

  // Handle AES-256-GCM encrypted token
  if (cleanToken.startsWith("v1:")) {
    try {
      cleanToken = decryptSecret(cleanToken).trim();
    } catch {
      throw new AuthError(
        "Authentication required: session token is invalid, expired, or tampered with."
      );
    }
  }

  // If token is an agent token prefix, resolve via agent token service
  if (cleanToken.startsWith("lifeos_ag_")) {
    let agent;
    try {
      agent = await resolveAgentByToken(cleanToken);
    } catch (err: any) {
      throw new AuthError(err.message || "Invalid, expired, or revoked agent token.");
    }

    const [userRow] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
      })
      .from(user)
      .where(eq(user.id, agent.userId))
      .limit(1);

    if (!userRow) {
      throw new AuthError("User associated with agent token not found.");
    }

    return {
      user: userRow,
      session: {
        id: `agent-sess-${agent.id}`,
        userId: agent.userId,
        expiresAt: agent.expiresAt ? new Date(agent.expiresAt) : new Date(Date.now() + 86400000),
        token: cleanToken,
      },
      token: cleanToken,
      options: options || {},
      agent,
      isAgent: true,
    };
  }

  // Query database for valid session and joined user
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
        token: session.token,
      },
    })
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .where(and(eq(session.token, cleanToken), gt(session.expiresAt, now)))
    .limit(1);

  if (!row) {
    throw new AuthError(
      "Invalid, expired, or revoked session token. Please run 'lifeos login' again."
    );
  }

  return {
    user: row.user,
    session: row.session,
    token: cleanToken,
    options: options || {},
  };
}
