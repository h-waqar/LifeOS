/**
 * Controlled Project Workspace & Execution Harness Types
 *
 * Requirements:
 * - WORK-01: Agent development execution is restricted to project root directory.
 * - WORK-02: Validated runners exist for test, typecheck, build, and lint with structured reporting.
 */

export const ALLOWED_WORKSPACE_COMMANDS = [
  "test",
  "typecheck",
  "build",
  "lint",
] as const;

export type WorkspaceCommand = (typeof ALLOWED_WORKSPACE_COMMANDS)[number];

export interface RunWorkspaceCommandInput {
  command: WorkspaceCommand;
  subpath?: string;
  args?: string[];
  timeoutMs?: number;
  [key: string]: unknown;
}

export interface WorkspaceCommandSpec {
  executable: string;
  baseArgs: string[];
  defaultTimeoutMs: number;
}

export interface WorkspaceRunnerConfig {
  projectRoot?: string;
  maxOutputBytes?: number;
  defaultTimeouts?: Partial<Record<WorkspaceCommand, number>>;
  commandSpecs?: Partial<Record<WorkspaceCommand, WorkspaceCommandSpec>>;
}

export interface WorkspaceCommandResult {
  command: WorkspaceCommand;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  passed: boolean;
  summary: string;
  timedOut: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  executionError?: string;
}

export interface SandboxPathResolution {
  valid: boolean;
  canonicalPath?: string;
  relativePath?: string;
  error?: string;
}

export class WorkspaceSecurityError extends Error {
  public readonly code: string;

  constructor(message: string, code = "WORKSPACE_SECURITY_VIOLATION") {
    super(message);
    this.name = "WorkspaceSecurityError";
    this.code = code;
  }
}

export class WorkspaceExecutionError extends Error {
  public readonly code: string;

  constructor(message: string, code = "WORKSPACE_EXECUTION_FAILURE") {
    super(message);
    this.name = "WorkspaceExecutionError";
    this.code = code;
  }
}

/**
 * Plan-to-Task Materialization Types (WORK-03)
 */
export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface PlanStepInput {
  stepId: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  estimatedDuration?: number | null; // in minutes (0 - 10080)
  dependsOnStepIds?: string[];
  tags?: string[];
}

export interface MaterializeDevelopmentPlanInput {
  planId: string;
  title: string;
  version?: number | string;
  projectId: string;
  description?: string | null;
  steps: PlanStepInput[];
  [key: string]: unknown;
}

export interface PlanMaterializationTaskSummary {
  stepId: string;
  taskId: string;
  title: string;
  priority: TaskPriority;
  estimatedDuration: number | null;
  status: string;
  tags: string[];
  orderIndex?: number;
}

export interface PlanMaterializationDependencySummary {
  fromStepId: string;
  toStepId: string;
  taskId: string;
  dependsOnTaskId: string;
}

export interface PlanMaterializationResult {
  success: boolean;
  planId: string;
  version: string | number;
  projectId: string;
  taskCount: number;
  dependencyCount: number;
  tasks: PlanMaterializationTaskSummary[];
  dependencies: PlanMaterializationDependencySummary[];
  idempotent: boolean;
  auditLogged: boolean;
}

export class PlanValidationError extends Error {
  public readonly code: string;

  constructor(message: string, code = "PLAN_VALIDATION_ERROR") {
    super(message);
    this.name = "PlanValidationError";
    this.code = code;
  }
}

export class PlanMaterializationError extends Error {
  public readonly code: string;

  constructor(message: string, code = "PLAN_MATERIALIZATION_FAILURE") {
    super(message);
    this.name = "PlanMaterializationError";
    this.code = code;
  }
}

/**
 * Plan Observability & Next-Task Resolution Types (Phase 18 Plan 18-01)
 */
export type PlanStepExecutionState =
  | "READY"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED";

export type PlanExecutionOverallStatus =
  | "NOT_STARTED"
  | "EXECUTING"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED"
  | "INVALID";

export type NextTaskResolutionState =
  | "READY"
  | "COMPLETE"
  | "BLOCKED"
  | "INVALID";

export interface PlanStepExecutionSummary {
  stepId: string;
  taskId: string;
  title: string;
  status: PlanStepExecutionState;
  taskStatus: string;
  priority: TaskPriority;
  estimatedDuration: number | null;
  tags: string[];
  orderIndex?: number;
  dependencies: string[];
  blockedBySteps: string[];
}

export interface PlanBottleneck {
  stepId: string;
  taskId: string;
  title: string;
  status: PlanStepExecutionState;
  blockingStepCount: number;
  blockedStepIds: string[];
}

export interface NextTaskDetails {
  taskId: string;
  stepId: string;
  title: string;
  status: string;
  executionState: PlanStepExecutionState;
  priority: TaskPriority;
  estimatedDuration: number | null;
  tags: string[];
  orderIndex?: number;
}

export interface PlanExecutionStatus {
  planId: string;
  projectId: string;
  totalSteps: number;
  completedSteps: number;
  inProgressSteps: number;
  todoSteps: number;
  blockedSteps: number;
  cancelledSteps: number;
  progressPercent: number;
  status: PlanExecutionOverallStatus;
  steps: PlanStepExecutionSummary[];
  nextReadyTask: NextTaskDetails | null;
  blockedReasons: string[];
  bottlenecks: PlanBottleneck[];
  errors?: string[];
}

export interface NextReadyPlanTaskResult {
  state: NextTaskResolutionState;
  task: NextTaskDetails | null;
  blockedReasons?: string[];
  errors?: string[];
}

export interface PlanInspectorInput {
  planId: string;
  projectId?: string;
  [key: string]: unknown;
}

export class PlanInspectorError extends Error {
  public readonly code: string;

  constructor(message: string, code = "PLAN_INSPECTOR_ERROR") {
    super(message);
    this.name = "PlanInspectorError";
    this.code = code;
  }
}

/**
 * Pre-Commit Verification Gate Types (WORK-04)
 */
export type VerificationCheckStatus = "passed" | "failed" | "skipped";

export interface VerificationCheckSummary {
  command: WorkspaceCommand;
  status: VerificationCheckStatus;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  summary: string;
  timedOut: boolean;
}

export interface GitStatusSummary {
  clean: boolean;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
  untrackedCount: number;
  conflictDetected: boolean;
  summary: string;
}

export interface PreCommitVerificationInput {
  subpath?: string;
  checks?: WorkspaceCommand[];
  testArgs?: string[];
  timeoutOverrides?: Partial<Record<WorkspaceCommand, number>>;
  inspectGit?: boolean;
  [key: string]: unknown;
}

export interface PreCommitVerificationResult {
  started: boolean;
  passed: boolean;
  canCommit: boolean;
  totalDurationMs: number;
  checksRun: WorkspaceCommand[];
  checksPassed: WorkspaceCommand[];
  checksFailed: WorkspaceCommand[];
  checksSkipped: WorkspaceCommand[];
  results: Record<WorkspaceCommand, VerificationCheckSummary | null>;
  failureReason?: string;
  gitStatus?: GitStatusSummary;
}

export class VerificationGateError extends Error {
  public readonly code: string;

  constructor(message: string, code = "VERIFICATION_GATE_FAILURE") {
    super(message);
    this.name = "VerificationGateError";
    this.code = code;
  }
}

/**
 * Closed-Loop Step Execution & Reconciliation Types (Phase 18 Plan 18-01)
 */
export type StepExecutionOutcome =
  | "EXECUTION_SUCCESS"
  | "VERIFICATION_FAILURE"
  | "RECOVERABLE_FAILURE"
  | "TERMINAL_FAILURE"
  | "BLOCKED_DEPENDENCY"
  | "INVALID_PLAN"
  | "ALREADY_COMPLETED";

export interface ExecutePlanStepInput {
  planId: string;
  projectId?: string;
  taskId?: string;
  stepId?: string;
  verificationChecks?: WorkspaceCommand[];
  timeoutOverrides?: Partial<Record<WorkspaceCommand, number>>;
  maxRetries?: number;
  subpath?: string;
  testArgs?: string[];
  [key: string]: unknown;
}

export interface ExecutePlanStepResult {
  outcome: StepExecutionOutcome;
  success: boolean;
  planId: string;
  projectId: string;
  stepId: string | null;
  taskId: string | null;
  taskTitle: string | null;
  taskStatus: string;
  attempts: number;
  maxRetries: number;
  verification: PreCommitVerificationResult | null;
  failureReason?: string;
  nextReadyTask: NextTaskDetails | null;
  planStatus: PlanExecutionOverallStatus;
  auditLogged?: boolean;
}

export class StepExecutionError extends Error {
  public readonly code: string;

  constructor(message: string, code = "STEP_EXECUTION_ERROR") {
    super(message);
    this.name = "StepExecutionError";
    this.code = code;
  }
}

/**
 * Verification Qualification Leases & Verified Commit Types (Phase 18 Plan 18-02)
 */

export interface WorkingTreeFingerprint {
  headCommit: string;
  indexHash: string;
  statusPorcelain: string;
  unstagedDiffHash: string;
  untrackedHash: string;
  fingerprint: string;
  timestamp: number;
}

export interface VerificationLease {
  leaseId: string;
  createdAt: number;
  expiresAt: number;
  projectRoot: string;
  userId: string;
  agentId?: string | null;
  sessionId?: string | null;
  checksRun: WorkspaceCommand[];
  verificationResult: {
    passed: boolean;
    totalDurationMs: number;
    checksPassed: WorkspaceCommand[];
    checksFailed: WorkspaceCommand[];
  };
  candidateState: WorkingTreeFingerprint;
  consumed: boolean;
  consumedAt?: number | null;
  commitHash?: string | null;
}

export interface IssueLeaseInput {
  projectRoot?: string;
  verificationResult: PreCommitVerificationResult;
  ttlMs?: number;
  userId: string;
  agentId?: string | null;
  sessionId?: string | null;
}

export interface ValidateLeaseResult {
  valid: boolean;
  reason?: string;
  lease?: VerificationLease;
}

export type WorkspaceCommitOutcome =
  | "COMMIT_SUCCESS"
  | "NO_STAGED_CHANGES"
  | "MERGE_CONFLICT"
  | "INVALID_LEASE"
  | "EXPIRED_LEASE"
  | "FINGERPRINT_MISMATCH"
  | "VERIFICATION_FAILED"
  | "EXECUTION_FAILURE"
  | "RECONCILED_SUCCESS";

export interface WorkspaceCommitInput {
  message: string;
  leaseId?: string;
  autoVerify?: boolean;
  verificationChecks?: WorkspaceCommand[];
  testArgs?: string[];
  subpath?: string;
  author?: { name: string; email: string };
  timeoutMs?: number;
  [key: string]: unknown;
}

export interface WorkspaceCommitResult {
  outcome: WorkspaceCommitOutcome;
  success: boolean;
  commitHash?: string | null;
  message: string;
  leaseId?: string | null;
  summary: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  headCommitBefore: string;
  headCommitAfter: string;
  auditLogged?: boolean;
}

export interface GitHookStatusResult {
  installed: boolean;
  lifeosManaged: boolean;
  backupExists: boolean;
  hookPath: string;
  backupPath?: string;
}

export interface GitHookManageResult {
  success: boolean;
  action: "install" | "uninstall";
  installed: boolean;
  backedUp: boolean;
  restored: boolean;
  message: string;
}

export class LeaseSecurityError extends Error {
  public readonly code: string;

  constructor(message: string, code = "LEASE_SECURITY_ERROR") {
    super(message);
    this.name = "LeaseSecurityError";
    this.code = code;
  }
}

export class CommitExecutionError extends Error {
  public readonly code: string;

  constructor(message: string, code = "COMMIT_EXECUTION_ERROR") {
    super(message);
    this.name = "CommitExecutionError";
    this.code = code;
  }
}


