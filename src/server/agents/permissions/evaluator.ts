/**
 * Agent Capability Classifier & Permission Evaluator
 *
 * Implements:
 * 1. Explicit operation classification across 5 capability tiers:
 *    READ, WRITE, EXECUTE, DESTRUCTIVE, SENSITIVE.
 * 2. Denial by default for unknown or unclassified actions.
 * 3. Strict privilege separation (no implicit escalation from WRITE to DESTRUCTIVE or EXECUTE to SENSITIVE).
 * 4. Tenant isolation and expiration / revocation enforcement.
 * 5. Deterministic authorization decisions.
 */

import type {
  AgentCapability,
  AgentIdentity,
  OperationClassification,
  PermissionDecision,
} from "./types";

/**
 * Registry of canonical domain operations and their security classifications.
 */
const KNOWN_OPERATIONS: Record<string, Omit<OperationClassification, "toolOrAction">> = {
  // --- READ Operations ---
  "lifeos_list_tasks": { capability: "READ", domain: "tasks", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_get_task": { capability: "READ", domain: "tasks", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "tasks.list": { capability: "READ", domain: "tasks", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "tasks.get": { capability: "READ", domain: "tasks", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "listTasks": { capability: "READ", domain: "tasks", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "getTask": { capability: "READ", domain: "tasks", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  "lifeos_list_projects": { capability: "READ", domain: "projects", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_get_project": { capability: "READ", domain: "projects", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "projects.list": { capability: "READ", domain: "projects", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "projects.get": { capability: "READ", domain: "projects", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "listProjects": { capability: "READ", domain: "projects", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "getProject": { capability: "READ", domain: "projects", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  "lifeos_list_goals": { capability: "READ", domain: "goals", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_get_goal": { capability: "READ", domain: "goals", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "goals.list": { capability: "READ", domain: "goals", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "goals.get": { capability: "READ", domain: "goals", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "listGoals": { capability: "READ", domain: "goals", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "getGoal": { capability: "READ", domain: "goals", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  "lifeos_list_notes": { capability: "READ", domain: "notes", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_get_note": { capability: "READ", domain: "notes", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "notes.list": { capability: "READ", domain: "notes", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "notes.get": { capability: "READ", domain: "notes", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "listNotes": { capability: "READ", domain: "notes", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "getNote": { capability: "READ", domain: "notes", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  "lifeos_get_habit": { capability: "READ", domain: "habits", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "habits.list": { capability: "READ", domain: "habits", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "habits.get": { capability: "READ", domain: "habits", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "listHabits": { capability: "READ", domain: "habits", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "getHabit": { capability: "READ", domain: "habits", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  "lifeos_search": { capability: "READ", domain: "search", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "search": { capability: "READ", domain: "search", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  "lifeos_list_skills": { capability: "READ", domain: "skills", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_get_skill": { capability: "READ", domain: "skills", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_match_skills": { capability: "READ", domain: "skills", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "skills.list": { capability: "READ", domain: "skills", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "skills.get": { capability: "READ", domain: "skills", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "skills.match": { capability: "READ", domain: "skills", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  "lifeos_docs_search": { capability: "READ", domain: "docs", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_docs_get": { capability: "READ", domain: "docs", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_docs_planning": { capability: "READ", domain: "docs", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_search_docs": { capability: "READ", domain: "docs", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_get_doc": { capability: "READ", domain: "docs", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_get_planning_state": { capability: "READ", domain: "docs", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "docs.search": { capability: "READ", domain: "docs", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "docs.get": { capability: "READ", domain: "docs", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "docs.planning": { capability: "READ", domain: "docs", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  "status": { capability: "READ", domain: "system", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "context": { capability: "READ", domain: "system", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "whoami": { capability: "READ", domain: "system", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "plan.status": { capability: "READ", domain: "planning", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "plan.get": { capability: "READ", domain: "planning", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "plan.view": { capability: "READ", domain: "planning", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  // Read-only financial query
  "finance.summary": { capability: "READ", domain: "finance", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "finance.getAccount": { capability: "READ", domain: "finance", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "finance.listTransactions": { capability: "READ", domain: "finance", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "finance.getBudget": { capability: "READ", domain: "finance", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  // --- WRITE Operations ---
  "lifeos_create_task": { capability: "WRITE", domain: "tasks", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_update_task": { capability: "WRITE", domain: "tasks", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "tasks.create": { capability: "WRITE", domain: "tasks", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "tasks.update": { capability: "WRITE", domain: "tasks", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "createTask": { capability: "WRITE", domain: "tasks", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "updateTask": { capability: "WRITE", domain: "tasks", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  "lifeos_create_project": { capability: "WRITE", domain: "projects", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_update_project": { capability: "WRITE", domain: "projects", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "projects.create": { capability: "WRITE", domain: "projects", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "projects.update": { capability: "WRITE", domain: "projects", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "createProject": { capability: "WRITE", domain: "projects", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "updateProject": { capability: "WRITE", domain: "projects", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  "lifeos_create_goal": { capability: "WRITE", domain: "goals", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_update_goal": { capability: "WRITE", domain: "goals", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "goals.create": { capability: "WRITE", domain: "goals", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "goals.update": { capability: "WRITE", domain: "goals", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "createGoal": { capability: "WRITE", domain: "goals", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "updateGoal": { capability: "WRITE", domain: "goals", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  "lifeos_create_note": { capability: "WRITE", domain: "notes", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_update_note": { capability: "WRITE", domain: "notes", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "notes.create": { capability: "WRITE", domain: "notes", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "notes.update": { capability: "WRITE", domain: "notes", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "createNote": { capability: "WRITE", domain: "notes", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "updateNote": { capability: "WRITE", domain: "notes", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  "lifeos_log_habit": { capability: "WRITE", domain: "habits", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "lifeos_toggle_habit": { capability: "WRITE", domain: "habits", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "habits.create": { capability: "WRITE", domain: "habits", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "habits.update": { capability: "WRITE", domain: "habits", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "habits.log": { capability: "WRITE", domain: "habits", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "habits.toggle": { capability: "WRITE", domain: "habits", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "createHabit": { capability: "WRITE", domain: "habits", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "updateHabit": { capability: "WRITE", domain: "habits", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "logHabit": { capability: "WRITE", domain: "habits", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  "plan.morning": { capability: "WRITE", domain: "planning", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "plan.evening": { capability: "WRITE", domain: "planning", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  // --- EXECUTE Operations ---
  "workspace.run": { capability: "EXECUTE", domain: "workspace", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "automations.trigger": { capability: "EXECUTE", domain: "automations", isFinancialMutation: false, isDestructive: false, isSensitive: false },
  "executeAutomation": { capability: "EXECUTE", domain: "automations", isFinancialMutation: false, isDestructive: false, isSensitive: false },

  // --- DESTRUCTIVE Operations (Mandatory HITL) ---
  "lifeos_delete_task": { capability: "DESTRUCTIVE", domain: "tasks", isFinancialMutation: false, isDestructive: true, isSensitive: false },
  "tasks.delete": { capability: "DESTRUCTIVE", domain: "tasks", isFinancialMutation: false, isDestructive: true, isSensitive: false },
  "deleteTask": { capability: "DESTRUCTIVE", domain: "tasks", isFinancialMutation: false, isDestructive: true, isSensitive: false },

  "lifeos_delete_project": { capability: "DESTRUCTIVE", domain: "projects", isFinancialMutation: false, isDestructive: true, isSensitive: false },
  "projects.delete": { capability: "DESTRUCTIVE", domain: "projects", isFinancialMutation: false, isDestructive: true, isSensitive: false },
  "deleteProject": { capability: "DESTRUCTIVE", domain: "projects", isFinancialMutation: false, isDestructive: true, isSensitive: false },

  "lifeos_delete_goal": { capability: "DESTRUCTIVE", domain: "goals", isFinancialMutation: false, isDestructive: true, isSensitive: false },
  "goals.delete": { capability: "DESTRUCTIVE", domain: "goals", isFinancialMutation: false, isDestructive: true, isSensitive: false },
  "deleteGoal": { capability: "DESTRUCTIVE", domain: "goals", isFinancialMutation: false, isDestructive: true, isSensitive: false },

  "lifeos_delete_note": { capability: "DESTRUCTIVE", domain: "notes", isFinancialMutation: false, isDestructive: true, isSensitive: false },
  "notes.delete": { capability: "DESTRUCTIVE", domain: "notes", isFinancialMutation: false, isDestructive: true, isSensitive: false },
  "deleteNote": { capability: "DESTRUCTIVE", domain: "notes", isFinancialMutation: false, isDestructive: true, isSensitive: false },

  "lifeos_delete_habit": { capability: "DESTRUCTIVE", domain: "habits", isFinancialMutation: false, isDestructive: true, isSensitive: false },
  "habits.delete": { capability: "DESTRUCTIVE", domain: "habits", isFinancialMutation: false, isDestructive: true, isSensitive: false },
  "deleteHabit": { capability: "DESTRUCTIVE", domain: "habits", isFinancialMutation: false, isDestructive: true, isSensitive: false },

  // --- SENSITIVE Operations (Mandatory HITL) ---
  "security.updateCredentials": { capability: "SENSITIVE", domain: "security", isFinancialMutation: false, isDestructive: false, isSensitive: true },
  "security.rotateKey": { capability: "SENSITIVE", domain: "security", isFinancialMutation: false, isDestructive: false, isSensitive: true },
  "agent.revokeToken": { capability: "SENSITIVE", domain: "security", isFinancialMutation: false, isDestructive: true, isSensitive: true },
  "system.purgeAudit": { capability: "SENSITIVE", domain: "security", isFinancialMutation: false, isDestructive: true, isSensitive: true },

  // --- Financial Mutations (Prohibited for Agents) ---
  "finance.createTransaction": { capability: "WRITE", domain: "finance", isFinancialMutation: true, isDestructive: false, isSensitive: true },
  "finance.updateTransaction": { capability: "WRITE", domain: "finance", isFinancialMutation: true, isDestructive: false, isSensitive: true },
  "finance.deleteTransaction": { capability: "DESTRUCTIVE", domain: "finance", isFinancialMutation: true, isDestructive: true, isSensitive: true },
  "finance.createAccount": { capability: "WRITE", domain: "finance", isFinancialMutation: true, isDestructive: false, isSensitive: true },
  "finance.updateAccount": { capability: "WRITE", domain: "finance", isFinancialMutation: true, isDestructive: false, isSensitive: true },
  "finance.deleteAccount": { capability: "DESTRUCTIVE", domain: "finance", isFinancialMutation: true, isDestructive: true, isSensitive: true },
  "finance.transfer": { capability: "WRITE", domain: "finance", isFinancialMutation: true, isDestructive: false, isSensitive: true },
  "finance.createBudget": { capability: "WRITE", domain: "finance", isFinancialMutation: true, isDestructive: false, isSensitive: true },
  "finance.updateBudget": { capability: "WRITE", domain: "finance", isFinancialMutation: true, isDestructive: false, isSensitive: true },
  "finance.deleteBudget": { capability: "DESTRUCTIVE", domain: "finance", isFinancialMutation: true, isDestructive: true, isSensitive: true },
  "createTransaction": { capability: "WRITE", domain: "finance", isFinancialMutation: true, isDestructive: false, isSensitive: true },
  "updateTransaction": { capability: "WRITE", domain: "finance", isFinancialMutation: true, isDestructive: false, isSensitive: true },
  "deleteTransaction": { capability: "DESTRUCTIVE", domain: "finance", isFinancialMutation: true, isDestructive: true, isSensitive: true },
  "createAccount": { capability: "WRITE", domain: "finance", isFinancialMutation: true, isDestructive: false, isSensitive: true },
  "updateAccount": { capability: "WRITE", domain: "finance", isFinancialMutation: true, isDestructive: false, isSensitive: true },
  "deleteAccount": { capability: "DESTRUCTIVE", domain: "finance", isFinancialMutation: true, isDestructive: true, isSensitive: true },
  "transferFunds": { capability: "WRITE", domain: "finance", isFinancialMutation: true, isDestructive: false, isSensitive: true },
};

/**
 * Classifies an incoming tool, CLI command, or service action.
 * Fails closed for any unclassified or unrecognized operation by marking it as SENSITIVE.
 */
export function classifyOperation(toolOrAction: string): OperationClassification {
  const normalized = toolOrAction.trim();
  const known = KNOWN_OPERATIONS[normalized];

  if (known) {
    return {
      toolOrAction: normalized,
      ...known,
    };
  }

  // Heuristic safety classification for unregistered operations
  const lower = normalized.toLowerCase();

  // Financial mutation pattern detection
  const isFinance =
    lower.startsWith("finance.") ||
    lower.includes("transaction") ||
    lower.includes("transfer") ||
    lower.includes("account") ||
    lower.includes("balance") ||
    lower.includes("ledger");

  const isMutating =
    lower.includes("create") ||
    lower.includes("update") ||
    lower.includes("delete") ||
    lower.includes("insert") ||
    lower.includes("drop") ||
    lower.includes("transfer") ||
    lower.includes("set") ||
    lower.includes("mutate");

  if (isFinance && isMutating) {
    return {
      toolOrAction: normalized,
      capability: lower.includes("delete") || lower.includes("drop") ? "DESTRUCTIVE" : "WRITE",
      domain: "finance",
      isFinancialMutation: true,
      isDestructive: lower.includes("delete") || lower.includes("drop"),
      isSensitive: true,
    };
  }

  // Destructive pattern detection
  if (lower.includes("delete") || lower.includes("destroy") || lower.includes("purge") || lower.includes("drop")) {
    return {
      toolOrAction: normalized,
      capability: "DESTRUCTIVE",
      domain: "unknown",
      isFinancialMutation: false,
      isDestructive: true,
      isSensitive: false,
    };
  }

  // Sensitive pattern detection
  if (
    lower.includes("token") ||
    lower.includes("key") ||
    lower.includes("secret") ||
    lower.includes("credential") ||
    lower.includes("auth") ||
    lower.includes("permission")
  ) {
    return {
      toolOrAction: normalized,
      capability: "SENSITIVE",
      domain: "security",
      isFinancialMutation: false,
      isDestructive: false,
      isSensitive: true,
    };
  }

  // Unknown operations fail closed as SENSITIVE
  return {
    toolOrAction: normalized,
    capability: "SENSITIVE",
    domain: "unclassified",
    isFinancialMutation: false,
    isDestructive: false,
    isSensitive: true,
  };
}

/**
 * Deterministically evaluates whether an agent identity is authorized to perform
 * a requested operation against a target user's resources.
 */
export function evaluateAgentPermission(
  agent: AgentIdentity,
  operation: string,
  targetUserId: string
): PermissionDecision {
  const classification = classifyOperation(operation);

  // 1. Cross-Tenant Isolation: Agent must belong to the target user
  if (agent.userId !== targetUserId) {
    return {
      granted: false,
      reason: `Cross-tenant access forbidden. Agent '${agent.name}' (${agent.id}) belongs to a different user.`,
      requiresChallenge: false,
      classification,
    };
  }

  // 2. Revocation & Expiration Status
  if (agent.status === "revoked") {
    return {
      granted: false,
      reason: `Agent '${agent.name}' is revoked.`,
      requiresChallenge: false,
      classification,
    };
  }

  if (agent.status === "expired" || (agent.expiresAt && new Date() >= new Date(agent.expiresAt))) {
    return {
      granted: false,
      reason: `Agent '${agent.name}' has expired.`,
      requiresChallenge: false,
      classification,
    };
  }

  // 3. Prohibit Unclassified Operations (Fail-Closed)
  if (classification.domain === "unclassified") {
    return {
      granted: false,
      reason: `Operation '${operation}' is unclassified and rejected by default.`,
      requiresChallenge: false,
      classification,
    };
  }

  // 4. Financial Mutation Shield Assertion
  if (classification.isFinancialMutation) {
    return {
      granted: false,
      reason: `Financial shield violation: autonomous agent mutation '${operation}' is prohibited.`,
      requiresChallenge: false,
      classification,
    };
  }

  // 5. Capability Tier Check: Explicit Grants Only (No Implicit Escalation)
  // An agent with WRITE does NOT get DESTRUCTIVE.
  // An agent with EXECUTE does NOT get SENSITIVE.
  const requiredCapability = classification.capability;

  if (!agent.capabilities.has(requiredCapability)) {
    return {
      granted: false,
      reason: `Agent '${agent.name}' lacks required capability '${requiredCapability}' for operation '${operation}'.`,
      requiresChallenge: false,
      classification,
    };
  }

  // 6. Granular Permission Rules Overrides
  if (agent.permissions && agent.permissions.length > 0) {
    // Check if an explicit denial matches the domain/action
    const explicitDenial = agent.permissions.find(
      (p) =>
        p.capability === requiredCapability &&
        (p.resource === "*" || p.resource === classification.domain) &&
        (p.action === "*" || p.action === operation) &&
        p.allowed === false
    );

    if (explicitDenial) {
      return {
        granted: false,
        reason: `Explicit permission rule prohibits agent '${agent.name}' from performing '${operation}'.`,
        requiresChallenge: false,
        classification,
      };
    }
  }

  // 7. Human-In-The-Loop Challenge Requirement
  // All DESTRUCTIVE and SENSITIVE operations must be gated by a human approval challenge
  const requiresChallenge = classification.isDestructive || classification.isSensitive;

  return {
    granted: true,
    reason: requiresChallenge
      ? `Operation requires human approval challenge (${requiredCapability}).`
      : `Granted: Agent possesses valid capability '${requiredCapability}'.`,
    requiresChallenge,
    classification,
  };
}
