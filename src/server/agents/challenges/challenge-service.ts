/**
 * Agent HITL Challenge Service
 *
 * Implements the lifecycle of Human-in-the-Loop challenges:
 * 1. Cryptographically unpredictable challenge generation (UUID v4).
 * 2. Immutable binding to agent identity, user identity, operation, and arguments hash.
 * 3. Default 10-minute TTL with synchronous expiration validation.
 * 4. Human approval and rejection transitions with ownership assertions.
 * 5. Single-use, concurrency-safe consumption using atomic conditional updates.
 * 6. Argument tampering rejection.
 */

import crypto from "node:crypto";
import { eq, and, desc, sql } from "drizzle-orm";
import { db as defaultDb } from "@/server/db";
import { agentChallenges } from "@/server/db/schema/agents";
import {
  type AgentChallengeRecord,
  type CreateChallengeInput,
  type ConsumeChallengeInput,
  ChallengeNotFoundError,
  ChallengeForbiddenError,
  ChallengeExpiredError,
  ChallengeTamperedError,
  ChallengeNotApprovedError,
  ChallengeAlreadyConsumedError,
  ChallengeConflictError,
} from "./types";

export const DEFAULT_CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Deterministically canonicalizes arguments into a stable JSON string.
 * Recursively sorts keys of objects.
 */
export function canonicalizeArguments(args: unknown): string {
  if (args === null || args === undefined) {
    return "";
  }

  if (typeof args !== "object") {
    return JSON.stringify(args);
  }

  if (Array.isArray(args)) {
    return "[" + args.map((item) => canonicalizeArguments(item)).join(",") + "]";
  }

  const record = args as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const entries: string[] = [];

  for (const key of sortedKeys) {
    if (key === "challengeId" || key === "challenge_id" || key === "challenge") {
      continue;
    }
    if (record[key] !== undefined) {
      entries.push(
        JSON.stringify(key) + ":" + canonicalizeArguments(record[key])
      );
    }
  }

  return "{" + entries.join(",") + "}";
}

/**
 * Computes deterministic SHA-256 hash of canonicalized arguments.
 */
export function computeArgumentsHash(args: unknown): string {
  const canonical = canonicalizeArguments(args);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Creates a new pending HITL approval challenge for a high-impact operation.
 */
export async function createChallenge(
  input: CreateChallengeInput,
  dbClient = defaultDb
): Promise<AgentChallengeRecord> {
  const challengeId = crypto.randomUUID();
  const argsHash = computeArgumentsHash(input.arguments);
  const ttlMs = (input.ttlMinutes ?? 10) * 60 * 1000;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  const [row] = await dbClient
    .insert(agentChallenges)
    .values({
      id: challengeId,
      userId: input.userId,
      agentTokenId: input.agentTokenId,
      operation: input.operation,
      capability: input.capability,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      arguments: input.arguments,
      argumentsHash: argsHash,
      status: "PENDING",
      expiresAt,
    })
    .returning();

  return row as AgentChallengeRecord;
}

/**
 * Approves a pending challenge. Strictly requires target user ownership.
 */
export async function approveChallenge(
  userId: string,
  challengeId: string,
  dbClient = defaultDb
): Promise<AgentChallengeRecord> {
  const [existing] = await dbClient
    .select()
    .from(agentChallenges)
    .where(eq(agentChallenges.id, challengeId))
    .limit(1);

  if (!existing) {
    throw new ChallengeNotFoundError(`Challenge '${challengeId}' not found.`);
  }

  if (existing.userId !== userId) {
    throw new ChallengeForbiddenError(
      `Access denied: Challenge '${challengeId}' does not belong to user '${userId}'.`
    );
  }

  const now = new Date();
  if (now >= new Date(existing.expiresAt)) {
    await dbClient
      .update(agentChallenges)
      .set({ status: "EXPIRED", updatedAt: now })
      .where(eq(agentChallenges.id, challengeId));

    throw new ChallengeExpiredError(`Challenge '${challengeId}' has expired and cannot be approved.`);
  }

  if (existing.status !== "PENDING") {
    throw new ChallengeConflictError(
      `Cannot approve challenge '${challengeId}' in status '${existing.status}'. Only PENDING challenges can be approved.`
    );
  }

  const [updated] = await dbClient
    .update(agentChallenges)
    .set({
      status: "APPROVED",
      approvedAt: now,
      updatedAt: now,
    })
    .where(and(eq(agentChallenges.id, challengeId), eq(agentChallenges.status, "PENDING")))
    .returning();

  if (!updated) {
    throw new ChallengeConflictError(`Concurrency conflict while approving challenge '${challengeId}'.`);
  }

  return updated as AgentChallengeRecord;
}

/**
 * Rejects a pending challenge. Strictly requires target user ownership.
 */
export async function rejectChallenge(
  userId: string,
  challengeId: string,
  reason?: string,
  dbClient = defaultDb
): Promise<AgentChallengeRecord> {
  const [existing] = await dbClient
    .select()
    .from(agentChallenges)
    .where(eq(agentChallenges.id, challengeId))
    .limit(1);

  if (!existing) {
    throw new ChallengeNotFoundError(`Challenge '${challengeId}' not found.`);
  }

  if (existing.userId !== userId) {
    throw new ChallengeForbiddenError(
      `Access denied: Challenge '${challengeId}' does not belong to user '${userId}'.`
    );
  }

  const now = new Date();
  const [updated] = await dbClient
    .update(agentChallenges)
    .set({
      status: "REJECTED",
      rejectedAt: now,
      rejectionReason: reason ?? "Rejected by human user",
      updatedAt: now,
    })
    .where(eq(agentChallenges.id, challengeId))
    .returning();

  return updated as AgentChallengeRecord;
}

/**
 * Retrieves a challenge by ID and applies synchronous expiration reconciliation.
 */
export async function getChallenge(
  challengeId: string,
  dbClient = defaultDb
): Promise<AgentChallengeRecord | null> {
  const [row] = await dbClient
    .select()
    .from(agentChallenges)
    .where(eq(agentChallenges.id, challengeId))
    .limit(1);

  if (!row) {
    return null;
  }

  const now = new Date();
  if (row.status === "PENDING" && now >= new Date(row.expiresAt)) {
    const [expired] = await dbClient
      .update(agentChallenges)
      .set({ status: "EXPIRED", updatedAt: now })
      .where(and(eq(agentChallenges.id, challengeId), eq(agentChallenges.status, "PENDING")))
      .returning();

    return (expired ?? row) as AgentChallengeRecord;
  }

  return row as AgentChallengeRecord;
}

/**
 * Consumes an approved challenge and executes the guarded action exactly once.
 * Concurrency-safe: atomically transitions status from APPROVED to CONSUMED.
 */
export async function consumeChallenge<T>(
  params: ConsumeChallengeInput<T>,
  dbClient = defaultDb
): Promise<T> {
  const { challengeId, userId, agentTokenId, operation, arguments: incomingArgs, executor } = params;

  const [challenge] = await dbClient
    .select()
    .from(agentChallenges)
    .where(eq(agentChallenges.id, challengeId))
    .limit(1);

  if (!challenge) {
    throw new ChallengeNotFoundError(`Challenge '${challengeId}' does not exist.`);
  }

  // 1. Identity & Binding Assertions
  if (challenge.userId !== userId) {
    throw new ChallengeForbiddenError(
      `Access denied: Challenge '${challengeId}' belongs to another user.`
    );
  }

  if (challenge.agentTokenId !== agentTokenId) {
    throw new ChallengeForbiddenError(
      `Access denied: Challenge '${challengeId}' was issued to another agent token.`
    );
  }

  if (challenge.operation !== operation) {
    throw new ChallengeForbiddenError(
      `Operation mismatch: Challenge '${challengeId}' is bound to '${challenge.operation}', but caller requested '${operation}'.`
    );
  }

  // 2. Argument Tamper Detection
  const incomingHash = computeArgumentsHash(incomingArgs);
  if (incomingHash !== challenge.argumentsHash) {
    throw new ChallengeTamperedError(
      `Security violation: Arguments for operation '${operation}' have been modified after challenge approval. Original hash '${challenge.argumentsHash}' does not match incoming hash '${incomingHash}'.`
    );
  }

  // 3. Synchronous Expiration Check
  const now = new Date();
  if (now >= new Date(challenge.expiresAt)) {
    await dbClient
      .update(agentChallenges)
      .set({ status: "EXPIRED", updatedAt: now })
      .where(and(eq(agentChallenges.id, challengeId), eq(agentChallenges.status, "APPROVED")));

    throw new ChallengeExpiredError(
      `Challenge '${challengeId}' has expired (TTL exceeded at ${challenge.expiresAt.toISOString()}). Unconfirmed or stale operations cannot execute.`
    );
  }

  // 4. Status Checks & Replay Protection
  if (challenge.status === "CONSUMED") {
    throw new ChallengeAlreadyConsumedError(
      `Replay attack detected: Challenge '${challengeId}' has already been consumed and cannot be executed again.`
    );
  }

  if (challenge.status === "REJECTED") {
    throw new ChallengeNotApprovedError(
      `Challenge '${challengeId}' was rejected by human approval and cannot execute.`
    );
  }

  if (challenge.status === "PENDING") {
    throw new ChallengeNotApprovedError(
      `Challenge '${challengeId}' is pending human approval. High-impact operations cannot execute until explicitly approved.`
    );
  }

  if (challenge.status !== "APPROVED") {
    throw new ChallengeNotApprovedError(
      `Challenge '${challengeId}' is in invalid state '${challenge.status}'. Execution prohibited.`
    );
  }

  // 5. Concurrency-Safe Exactly-Once Transition
  const [consumed] = await dbClient
    .update(agentChallenges)
    .set({
      status: "CONSUMED",
      consumedAt: now,
      updatedAt: now,
    })
    .where(and(eq(agentChallenges.id, challengeId), eq(agentChallenges.status, "APPROVED")))
    .returning();

  if (!consumed) {
    throw new ChallengeConflictError(
      `Concurrency collision: Challenge '${challengeId}' was consumed or modified concurrently by another thread.`
    );
  }

  // 6. Execute guarded canonical action
  return await executor();
}

/**
 * Lists challenges for a user, sorted descending by creation time.
 */
export async function listChallenges(
  userId: string,
  dbClient = defaultDb
): Promise<AgentChallengeRecord[]> {
  const rows = await dbClient
    .select()
    .from(agentChallenges)
    .where(eq(agentChallenges.userId, userId))
    .orderBy(desc(agentChallenges.createdAt));

  return rows as AgentChallengeRecord[];
}
