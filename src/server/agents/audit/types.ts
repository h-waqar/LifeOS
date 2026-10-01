/**
 * Agent Audit & Attribution Types
 *
 * Captures comprehensive forensic context:
 * - REQUESTED: Initial request interception
 * - DENIED: Unauthorized capability or financial shield violation
 * - CHALLENGE_CREATED: HITL approval challenge generated
 * - APPROVED: Human confirmation approved
 * - REJECTED: Human confirmation declined
 * - EXPIRED: TTL elapsed without approval
 * - EXECUTED: Successfully completed domain mutation
 * - FAILED: Error during execution
 */

import type { AgentCapability } from "../permissions/types";

export type AgentAuditStatus =
  | "REQUESTED"
  | "DENIED"
  | "CHALLENGE_CREATED"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "EXECUTED"
  | "FAILED";

export interface AgentAuditLogEntry {
  userId: string;
  agentTokenId?: string | null;
  agentName?: string | null;
  provider?: string | null;
  sessionId?: string | null;
  toolName: string;
  capability: AgentCapability;
  operation: string;
  resource?: string | null;
  arguments?: Record<string, unknown> | null;
  argumentsHash?: string | null;
  challengeId?: string | null;
  challengeStatus?: string | null;
  status: AgentAuditStatus;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  stateDiff?: Record<string, unknown> | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}
