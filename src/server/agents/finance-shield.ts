/**
 * Zero-Trust Financial Shield
 *
 * Active runtime security boundary located BELOW the MCP and CLI registries.
 * Strictly blocks all autonomous agent-originated mutations to financial ledgers,
 * transactions, accounts, transfers, and balances while permitting read-only financial access.
 *
 * Employs AsyncLocalStorage context propagation so that canonical financial services
 * and nested domain functions automatically inherit agent restrictions.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { AgentSafetyContext } from "./permissions/types";

export class FinancialShieldViolationError extends Error {
  public readonly code = "FINANCIAL_SHIELD_VIOLATION";
  public readonly operation?: string;

  constructor(
    message = "Financial shield violation: autonomous agent-originated mutations to financial ledgers, accounts, or transactions are strictly prohibited.",
    operation?: string
  ) {
    super(message);
    this.name = "FinancialShieldViolationError";
    this.operation = operation;
  }
}

/**
 * AsyncLocalStorage holding the active AgentSafetyContext for in-flight executions.
 */
const agentSafetyStorage = new AsyncLocalStorage<AgentSafetyContext>();

/**
 * Runs an asynchronous task within an isolated AgentSafetyContext.
 */
export async function withAgentSafetyContext<T>(
  context: AgentSafetyContext,
  fn: () => Promise<T>
): Promise<T> {
  return agentSafetyStorage.run(context, fn);
}

/**
 * Retrieves the current in-flight AgentSafetyContext, if present.
 */
export function getAgentSafetyContext(): AgentSafetyContext | undefined {
  return agentSafetyStorage.getStore();
}

/**
 * Prohibited financial mutation verbs and terms.
 */
const FINANCIAL_MUTATION_TERMS = [
  "create",
  "update",
  "delete",
  "insert",
  "modify",
  "patch",
  "adjust",
  "transfer",
  "deposit",
  "withdraw",
  "rollover",
  "reconcile",
  "seed",
  "purge",
  "drop",
];

const FINANCIAL_DOMAINS = [
  "transaction",
  "account",
  "budget",
  "balance",
  "money",
  "wallet",
  "ledger",
  "transfer",
];

/**
 * Evaluates whether an operation name constitutes a financial mutation.
 */
export function isFinancialMutation(operation: string): boolean {
  const normalized = operation.toLowerCase().trim();

  // Explicit known financial mutation keys
  const exactKnownMutations = new Set([
    "finance.createtransaction",
    "finance.updatetransaction",
    "finance.deletetransaction",
    "finance.createaccount",
    "finance.updateaccount",
    "finance.deleteaccount",
    "finance.transfer",
    "finance.createbudget",
    "finance.updatebudget",
    "finance.deletebudget",
    "createtransaction",
    "updatetransaction",
    "deletetransaction",
    "createaccount",
    "updateaccount",
    "deleteaccount",
    "createtransfer",
    "transferfunds",
    "adjustbalance",
  ]);

  if (exactKnownMutations.has(normalized)) {
    return true;
  }

  // Check if it combines a financial domain term and a mutating term
  const hasFinanceDomain = FINANCIAL_DOMAINS.some((term) => normalized.includes(term));
  const hasMutationVerb = FINANCIAL_MUTATION_TERMS.some((term) => normalized.includes(term));

  return hasFinanceDomain && hasMutationVerb;
}

/**
 * Synchronous and active financial shield check.
 * Throws FinancialShieldViolationError if the active context is an agent attempting a financial mutation.
 */
export function assertFinancialShield(
  context: AgentSafetyContext | undefined,
  operation: string
): void {
  // If no context passed, check the AsyncLocalStorage ambient context
  const activeContext = context ?? getAgentSafetyContext();

  if (activeContext?.isAgent && isFinancialMutation(operation)) {
    throw new FinancialShieldViolationError(
      `Financial shield violation: Autonomous agent '${activeContext.agent?.name ?? "unknown"}' attempted unauthorized financial mutation '${operation}'. All agent mutations to financial ledgers are blocked. Direct autonomous modification of financial state is strictly prohibited.`,
      operation
    );
  }
}

/**
 * Universal runtime guard to be placed at the entry point of financial mutation services.
 * Automatically checks the ambient AsyncLocalStorage context and fails closed.
 */
export function guardFinancialMutation(operationName: string): void {
  const ambientContext = getAgentSafetyContext();
  if (ambientContext?.isAgent) {
    throw new FinancialShieldViolationError(
      `Financial shield violation: Direct call to financial domain service '${operationName}' by agent '${ambientContext.agent?.name ?? "unknown"}' is prohibited. Direct autonomous modification of financial state is strictly prohibited.`,
      operationName
    );
  }
}
