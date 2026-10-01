/**
 * Agent Capability & Permissions Types
 *
 * Implements explicit 5-tier classification:
 * - READ: Non-mutating queries and inspections
 * - WRITE: Ordinary resource additions and updates
 * - EXECUTE: Running workflows, code execution, automated jobs
 * - DESTRUCTIVE: Hard deletions and truncations (mandatory HITL)
 * - SENSITIVE: Credential updates, system auth alterations (mandatory HITL)
 */

export const AGENT_CAPABILITIES = [
  "READ",
  "WRITE",
  "EXECUTE",
  "DESTRUCTIVE",
  "SENSITIVE",
] as const;

export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export type AgentStatus = "active" | "revoked" | "expired";

export interface AgentPermissionRule {
  capability: AgentCapability;
  resource: string; // e.g. "tasks", "projects", "finance", "*"
  action: string;   // e.g. "list", "get", "create", "delete", "*"
  allowed: boolean;
}

export interface AgentIdentity {
  id: string; // agent_tokens.id
  userId: string; // user.id
  name: string;
  tokenPrefix: string;
  provider: string;
  status: AgentStatus;
  expiresAt: Date | null;
  capabilities: Set<AgentCapability>;
  permissions: AgentPermissionRule[];
}

export interface OperationClassification {
  toolOrAction: string;
  capability: AgentCapability;
  domain: string;
  isFinancialMutation: boolean;
  isDestructive: boolean;
  isSensitive: boolean;
}

export interface PermissionDecision {
  granted: boolean;
  reason: string;
  requiresChallenge: boolean;
  classification: OperationClassification;
}

export interface AgentSafetyContext {
  isAgent: boolean;
  agent?: AgentIdentity;
  user: {
    id: string;
    email?: string;
    name?: string;
  };
  sessionId?: string;
  provider?: string;
}
