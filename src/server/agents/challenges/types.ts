/**
 * Agent HITL Challenge Types & Errors
 *
 * Defines the lifecycle states:
 * PENDING -> APPROVED -> CONSUMED
 * PENDING -> REJECTED
 * PENDING -> EXPIRED
 *
 * Enforces cryptographic unpredictable tokens, argument integrity hashes,
 * identity binding, single-use consumption, and race-safe transitions.
 */

import type { AgentCapability } from "../permissions/types";

export type ChallengeStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CONSUMED";

export interface AgentChallengeRecord {
  id: string;
  userId: string;
  agentTokenId: string;
  operation: string;
  capability: "DESTRUCTIVE" | "SENSITIVE";
  resource: string;
  resourceId: string | null;
  arguments: Record<string, unknown>;
  argumentsHash: string;
  status: ChallengeStatus;
  expiresAt: Date;
  approvedAt: Date | null;
  consumedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateChallengeInput {
  userId: string;
  agentTokenId: string;
  operation: string;
  capability: "DESTRUCTIVE" | "SENSITIVE";
  resource: string;
  resourceId?: string | null;
  arguments: Record<string, unknown>;
  ttlMinutes?: number;
}

export interface ConsumeChallengeInput<T = unknown> {
  challengeId: string;
  userId: string;
  agentTokenId: string;
  operation: string;
  arguments: Record<string, unknown>;
  executor: () => Promise<T>;
}

export class ChallengeNotFoundError extends Error {
  public readonly code = "CHALLENGE_NOT_FOUND";
  constructor(message = "Challenge not found.") {
    super(message);
    this.name = "ChallengeNotFoundError";
  }
}

export class ChallengeForbiddenError extends Error {
  public readonly code = "CHALLENGE_FORBIDDEN";
  constructor(message = "Access to challenge is forbidden.") {
    super(message);
    this.name = "ChallengeForbiddenError";
  }
}

export class ChallengeExpiredError extends Error {
  public readonly code = "CHALLENGE_EXPIRED";
  constructor(message = "Challenge has expired.") {
    super(message);
    this.name = "ChallengeExpiredError";
  }
}

export class ChallengeTamperedError extends Error {
  public readonly code = "CHALLENGE_TAMPERED";
  constructor(message = "Challenge arguments have been modified.") {
    super(message);
    this.name = "ChallengeTamperedError";
  }
}

export class ChallengeNotApprovedError extends Error {
  public readonly code = "CHALLENGE_NOT_APPROVED";
  constructor(message = "Challenge is not approved.") {
    super(message);
    this.name = "ChallengeNotApprovedError";
  }
}

export class ChallengeAlreadyConsumedError extends Error {
  public readonly code = "CHALLENGE_ALREADY_CONSUMED";
  constructor(message = "Challenge has already been consumed.") {
    super(message);
    this.name = "ChallengeAlreadyConsumedError";
  }
}

export class ChallengeConflictError extends Error {
  public readonly code = "CHALLENGE_CONFLICT";
  constructor(message = "Concurrency collision on challenge.") {
    super(message);
    this.name = "ChallengeConflictError";
  }
}
