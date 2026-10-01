/**
 * Agent Token & Identity Resolution Service
 *
 * Implements:
 * 1. Cryptographically secure agent token generation.
 * 2. SHA-256 token hashing at rest (plaintext tokens NEVER stored).
 * 3. Token resolution, revocation, expiration, and capability aggregation.
 * 4. Fails closed with structured errors.
 */

import crypto from "node:crypto";
import { eq, and, gt, desc } from "drizzle-orm";
import { db as defaultDb } from "@/server/db";
import { agentTokens, agentPermissions } from "@/server/db/schema/agents";
import { user } from "@/server/db/schema/auth";
import type {
  AgentCapability,
  AgentIdentity,
  AgentPermissionRule,
} from "./permissions/types";

export interface CreateAgentTokenInput {
  name: string;
  provider?: string;
  expiresInDays?: number;
  capabilities?: AgentCapability[];
  permissions?: Array<{
    capability: AgentCapability;
    resource?: string;
    action?: string;
    allowed?: boolean;
  }>;
}

export interface GeneratedTokenResult {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
  agent: {
    id: string;
    userId: string;
    name: string;
    provider: string;
    status: string;
    expiresAt: Date | null;
  };
}

/**
 * Computes deterministic SHA-256 hash of a raw bearer token.
 */
export function hashAgentToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
}

/**
 * Generates an unguessable 256-bit agent token string with prefix.
 */
export function generateTokenSecret(prefix = "lifeos_ag_"): {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const randomBytes = crypto.randomBytes(32).toString("hex");
  const token = `${prefix}${randomBytes}`;
  const tokenHash = hashAgentToken(token);
  const tokenPrefix = `${prefix}${randomBytes.slice(0, 8)}...`;

  return { token, tokenHash, tokenPrefix };
}

/**
 * Creates and registers a new agent token with scoped permissions.
 * The plaintext token is returned ONCE upon creation and never persisted.
 */
export async function createAgentToken(
  userId: string,
  input: CreateAgentTokenInput,
  dbClient = defaultDb
): Promise<GeneratedTokenResult> {
  const { token, tokenHash, tokenPrefix } = generateTokenSecret();

  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const [createdAgent] = await dbClient
    .insert(agentTokens)
    .values({
      userId,
      name: input.name.trim(),
      tokenHash,
      tokenPrefix,
      provider: input.provider?.trim() || "generic",
      status: "active",
      expiresAt,
    })
    .returning();

  // Seed default or explicit capabilities
  const capabilitiesToGrant = input.capabilities ?? ["READ"];
  const permissionValues: Array<typeof agentPermissions.$inferInsert> = [];

  for (const cap of capabilitiesToGrant) {
    permissionValues.push({
      agentTokenId: createdAgent.id,
      userId,
      capability: cap,
      resource: "*",
      action: "*",
      allowed: true,
    });
  }

  // Seed any specific granular permissions
  if (input.permissions && input.permissions.length > 0) {
    for (const p of input.permissions) {
      permissionValues.push({
        agentTokenId: createdAgent.id,
        userId,
        capability: p.capability,
        resource: p.resource || "*",
        action: p.action || "*",
        allowed: p.allowed !== undefined ? p.allowed : true,
      });
    }
  }

  if (permissionValues.length > 0) {
    await dbClient.insert(agentPermissions).values(permissionValues);
  }

  return {
    token,
    tokenHash,
    tokenPrefix,
    agent: {
      id: createdAgent.id,
      userId: createdAgent.userId,
      name: createdAgent.name,
      provider: createdAgent.provider,
      status: createdAgent.status,
      expiresAt: createdAgent.expiresAt,
    },
  };
}

/**
 * Resolves an agent's identity and capabilities by raw bearer token.
 * Fails closed by throwing an Error if missing, invalid, revoked, or expired.
 */
export async function resolveAgentByToken(
  rawToken: string,
  dbClient = defaultDb
): Promise<AgentIdentity> {
  if (!rawToken || typeof rawToken !== "string" || !rawToken.trim()) {
    throw new Error("Authentication required: missing agent bearer token.");
  }

  const tokenHash = hashAgentToken(rawToken);

  const [agentRow] = await dbClient
    .select({
      id: agentTokens.id,
      userId: agentTokens.userId,
      name: agentTokens.name,
      tokenPrefix: agentTokens.tokenPrefix,
      provider: agentTokens.provider,
      status: agentTokens.status,
      expiresAt: agentTokens.expiresAt,
      userName: user.name,
      userEmail: user.email,
    })
    .from(agentTokens)
    .innerJoin(user, eq(agentTokens.userId, user.id))
    .where(eq(agentTokens.tokenHash, tokenHash))
    .limit(1);

  if (!agentRow) {
    throw new Error("Authentication required: invalid or unrecognized agent token.");
  }

  if (agentRow.status === "revoked") {
    throw new Error("Authentication failed: agent token has been revoked.");
  }

  if (agentRow.expiresAt && new Date() >= new Date(agentRow.expiresAt)) {
    throw new Error("Authentication failed: agent token has expired.");
  }

  // Fetch granted permissions and capabilities
  const permissionsRows = await dbClient
    .select({
      capability: agentPermissions.capability,
      resource: agentPermissions.resource,
      action: agentPermissions.action,
      allowed: agentPermissions.allowed,
    })
    .from(agentPermissions)
    .where(eq(agentPermissions.agentTokenId, agentRow.id));

  const capabilities = new Set<AgentCapability>();
  const permissions: AgentPermissionRule[] = [];

  for (const row of permissionsRows) {
    if (row.allowed) {
      capabilities.add(row.capability as AgentCapability);
    }
    permissions.push({
      capability: row.capability as AgentCapability,
      resource: row.resource,
      action: row.action,
      allowed: row.allowed,
    });
  }

  return {
    id: agentRow.id,
    userId: agentRow.userId,
    name: agentRow.name,
    tokenPrefix: agentRow.tokenPrefix,
    provider: agentRow.provider,
    status: agentRow.status as "active" | "revoked" | "expired",
    expiresAt: agentRow.expiresAt,
    capabilities,
    permissions,
  };
}

/**
 * Revokes an agent token by ID.
 */
export async function revokeAgentToken(
  userId: string,
  agentTokenId: string,
  dbClient = defaultDb
): Promise<void> {
  const result = await dbClient
    .update(agentTokens)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(agentTokens.userId, userId), eq(agentTokens.id, agentTokenId)));

  return;
}

/**
 * Lists all agent tokens belonging to a user.
 */
export async function listAgentTokens(
  userId: string,
  dbClient = defaultDb
) {
  const tokens = await dbClient
    .select({
      id: agentTokens.id,
      name: agentTokens.name,
      tokenPrefix: agentTokens.tokenPrefix,
      provider: agentTokens.provider,
      status: agentTokens.status,
      expiresAt: agentTokens.expiresAt,
      createdAt: agentTokens.createdAt,
    })
    .from(agentTokens)
    .where(eq(agentTokens.userId, userId))
    .orderBy(desc(agentTokens.createdAt));

  return tokens;
}
