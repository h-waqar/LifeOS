/**
 * Agent Attribution & Forensic Audit Logger
 *
 * Implements:
 * 1. Transactional and immutable audit logging to `agent_audit_log`.
 * 2. Deep secret scrubbing (passwords, tokens, bearer headers, encryption keys).
 * 3. Precise attribution: agent identity, provider, tool, arguments hash, challenge linkage, duration.
 * 4. Pre/post execution state captures and diff computation.
 */

import { desc, eq, and } from "drizzle-orm";
import { db as defaultDb } from "@/server/db";
import { agentAuditLog, agentTokens, type AgentAuditLog } from "@/server/db/schema/agents";
import { computeArgumentsHash } from "../challenges/challenge-service";
import type { AgentAuditLogEntry } from "./types";

const SENSITIVE_KEYS_REGEX =
  /token|password|passwd|passphrase|secret|key|authorization|bearer|cookie|credential|geminikey|openaikey|anthropic|api_key|apikey|private_key/i;

/**
 * Redacts embedded secret patterns within string values.
 */
export function scrubString(str: string): string {
  // Strip null bytes and non-printable control characters that crash PostgreSQL JSONB or TEXT
  let result = str.replace(/\0/g, "").replace(/\\u0000/g, "");

  if (
    result.startsWith("v1:") ||
    result.startsWith("lifeos_ag_") ||
    result.startsWith("sk-")
  ) {
    return "***REDACTED***";
  }

  // Redact Bearer tokens: "Bearer <token>" -> "Bearer ***REDACTED***"
  result = result.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer ***REDACTED***");

  // Redact LifeOS agent tokens embedded anywhere: "lifeos_ag_..." -> "***REDACTED***"
  result = result.replace(/lifeos_ag_[a-zA-Z0-9_\-]+/g, "***REDACTED***");

  // Redact encrypted secrets embedded anywhere: "v1:..." -> "***REDACTED***"
  result = result.replace(/v1:[a-zA-Z0-9_\-\.\/+=]{16,}/g, "***REDACTED***");

  // Redact OpenAI-style API keys embedded anywhere: "sk-..." -> "***REDACTED***"
  result = result.replace(/sk-[a-zA-Z0-9_\-]{20,}/g, "***REDACTED***");

  // Redact key-value secrets: "password=xyz", "apiKey: xyz", "secret=xyz"
  result = result.replace(
    /(password|passwd|passphrase|secret|api[_-]?key)\s*([:=])\s*([^\s,;&"'>]+)/gi,
    "$1$2***REDACTED***"
  );

  return result;
}

/**
 * Deeply redacts sensitive credentials and secrets from any data structure.
 */
export function scrubSecrets(data: unknown, depth = 0): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (depth > 12) {
    return "[Truncated: Max Depth Exceeded]";
  }

  if (typeof data === "string") {
    return scrubString(data);
  }

  if (typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => scrubSecrets(item, depth + 1));
  }

  const record = data as Record<string, unknown>;
  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_KEYS_REGEX.test(key)) {
      clean[key] = "***REDACTED***";
    } else {
      clean[key] = scrubSecrets(value, depth + 1);
    }
  }

  return clean;
}

/**
 * Computes a structural diff between before and after states.
 */
export function computeStateDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!before && !after) return null;
  if (!before && after) return { created: after };
  if (before && !after) return { deleted: before };

  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const allKeys = new Set([...Object.keys(before!), ...Object.keys(after!)]);

  for (const key of allKeys) {
    const valBefore = before![key];
    const valAfter = after![key];

    if (JSON.stringify(valBefore) !== JSON.stringify(valAfter)) {
      diff[key] = { from: valBefore, to: valAfter };
    }
  }

  return Object.keys(diff).length > 0 ? diff : null;
}

/**
 * Records an immutable entry in the `agent_audit_log` table.
 */
export async function logAgentAudit(
  entry: AgentAuditLogEntry,
  dbClient = defaultDb
): Promise<AgentAuditLog> {
  const cleanArgs = entry.arguments
    ? (scrubSecrets(entry.arguments) as Record<string, unknown>)
    : null;

  const argsHash =
    entry.argumentsHash ??
    (entry.arguments ? computeArgumentsHash(entry.arguments) : null);

  const cleanBeforeState = entry.beforeState
    ? (scrubSecrets(entry.beforeState) as Record<string, unknown>)
    : null;

  const cleanAfterState = entry.afterState
    ? (scrubSecrets(entry.afterState) as Record<string, unknown>)
    : null;

  const cleanDiff =
    entry.stateDiff ??
    (cleanBeforeState || cleanAfterState
      ? computeStateDiff(cleanBeforeState, cleanAfterState)
      : null);

  let validAgentTokenId: string | null = null;
  if (entry.agentTokenId) {
    try {
      const [tokenRecord] = await dbClient
        .select({ id: agentTokens.id })
        .from(agentTokens)
        .where(eq(agentTokens.id, entry.agentTokenId))
        .limit(1);
      if (tokenRecord) {
        validAgentTokenId = tokenRecord.id;
      }
    } catch {
      validAgentTokenId = null;
    }
  }

  const [row] = await dbClient
    .insert(agentAuditLog)
    .values({
      userId: entry.userId,
      agentTokenId: validAgentTokenId,
      agentName: entry.agentName ?? null,
      provider: entry.provider ?? null,
      sessionId: entry.sessionId ?? null,
      toolName: entry.toolName,
      capability: entry.capability,
      operation: entry.operation,
      resource: entry.resource ?? null,
      arguments: cleanArgs,
      argumentsHash: argsHash,
      challengeId: entry.challengeId ?? null,
      challengeStatus: entry.challengeStatus ?? null,
      status: entry.status,
      beforeState: cleanBeforeState,
      afterState: cleanAfterState,
      stateDiff: cleanDiff,
      durationMs: entry.durationMs ?? null,
      errorMessage: entry.errorMessage ? String(scrubSecrets(entry.errorMessage)) : null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    })
    .returning();

  return row as AgentAuditLog;
}

/**
 * Queries agent audit logs with strict user tenant isolation.
 */
export async function queryAgentAuditLogs(
  userId: string,
  filters?: {
    agentTokenId?: string;
    toolName?: string;
    status?: string;
    limit?: number;
  },
  dbClient = defaultDb
): Promise<AgentAuditLog[]> {
  const conditions = [eq(agentAuditLog.userId, userId)];

  if (filters?.agentTokenId) {
    conditions.push(eq(agentAuditLog.agentTokenId, filters.agentTokenId));
  }
  if (filters?.toolName) {
    conditions.push(eq(agentAuditLog.toolName, filters.toolName));
  }
  if (filters?.status) {
    conditions.push(eq(agentAuditLog.status, filters.status as any));
  }

  const rows = await dbClient
    .select()
    .from(agentAuditLog)
    .where(and(...conditions))
    .orderBy(desc(agentAuditLog.createdAt))
    .limit(filters?.limit ?? 50);

  return rows as AgentAuditLog[];
}
