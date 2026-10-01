/**
 * Pre-Commit Verification Gate
 *
 * Requirements:
 * - WORK-04: System enforces that agent-generated code changes pass TypeScript
 *   compilation and relevant unit/integration tests before allowing git commit execution.
 *
 * Security & Reliability Invariants:
 * - Deterministic verification sequence (typecheck -> test -> build -> lint).
 * - Uses existing validated workspace command runner (no duplicate subprocess spawning).
 * - Complete fail-closed semantics: any failed check or error halts the pipeline and blocks commit.
 * - Narrowly scoped, read-only git status inspection (no arbitrary git commands, no commit authority).
 * - Hard bounds on execution timeout and output buffering.
 * - Zero-trust execution boundary integration via executeAgentOperation (EXECUTE tier).
 * - Financial shield preserved (cannot mutate finances).
 */

import { spawn } from "child_process";
import { executeAgentOperation, type AgentOperationResult } from "../safety-boundary";
import type { AgentSafetyContext } from "../permissions/types";
import { assertSandboxPath, getCanonicalProjectRoot } from "./sandbox";
import { executeWorkspaceCommand } from "./command-runner";
import {
  ALLOWED_WORKSPACE_COMMANDS,
  type PreCommitVerificationInput,
  type PreCommitVerificationResult,
  type VerificationCheckSummary,
  type GitStatusSummary,
  type WorkspaceCommand,
  type WorkspaceRunnerConfig,
  WorkspaceSecurityError,
  VerificationGateError,
} from "./types";

export const DEFAULT_VERIFICATION_SEQUENCE: WorkspaceCommand[] = [
  "typecheck",
  "test",
  "build",
  "lint",
];

/**
 * Narrowly scoped, read-only git status inspection.
 * Strictly uses fixed arguments `git status --porcelain`, shell: false, and sandbox root.
 * Does not expose arbitrary git arguments, modify hooks, or commit code.
 */
export async function inspectGitStatus(projectRoot: string): Promise<GitStatusSummary> {
  return new Promise<GitStatusSummary>((resolve) => {
    try {
      const sanitizedEnv: NodeJS.ProcessEnv = {
        ...process.env,
        CI: "true",
      };

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn("git", ["status", "--porcelain"], {
          cwd: projectRoot,
          shell: false,
          env: sanitizedEnv,
        });
      } catch (err: any) {
        return resolve({
          clean: false,
          hasStagedChanges: false,
          hasUnstagedChanges: false,
          untrackedCount: 0,
          conflictDetected: false,
          summary: `Failed to spawn git: ${err.message}`,
        });
      }

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (d: Buffer | string) => {
        stdout += d.toString();
      });

      child.stderr?.on("data", (d: Buffer | string) => {
        stderr += d.toString();
      });

      child.on("close", (code: number | null) => {
        if (code !== 0) {
          return resolve({
            clean: false,
            hasStagedChanges: false,
            hasUnstagedChanges: false,
            untrackedCount: 0,
            conflictDetected: false,
            summary: `git status check failed (exit code ${code}): ${stderr.trim()}`,
          });
        }

        const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
        let hasStaged = false;
        let hasUnstaged = false;
        let untracked = 0;
        let conflict = false;

        for (const line of lines) {
          const x = line[0];
          const y = line[1];

          if (line.startsWith("??")) {
            untracked++;
          } else if (
            line.startsWith("UU") ||
            line.startsWith("AA") ||
            line.startsWith("UD") ||
            line.startsWith("DU") ||
            line.startsWith("DD") ||
            line.startsWith("AU") ||
            line.startsWith("UA")
          ) {
            conflict = true;
          } else {
            if (x && x !== " " && x !== "?") hasStaged = true;
            if (y && y !== " " && y !== "?") hasUnstaged = true;
          }
        }

        const isClean = lines.length === 0;
        let summary: string;
        if (conflict) {
          summary = "Unresolved merge conflicts detected in working tree.";
        } else if (isClean) {
          summary = "Git repository working tree is clean.";
        } else {
          summary = `Working tree changes detected: ${lines.length} file(s) modified/untracked.`;
        }

        resolve({
          clean: isClean,
          hasStagedChanges: hasStaged,
          hasUnstagedChanges: hasUnstaged,
          untrackedCount: untracked,
          conflictDetected: conflict,
          summary,
        });
      });

      child.on("error", (err: Error) => {
        resolve({
          clean: false,
          hasStagedChanges: false,
          hasUnstagedChanges: false,
          untrackedCount: 0,
          conflictDetected: false,
          summary: `git execution error: ${err.message}`,
        });
      });
    } catch (err: any) {
      resolve({
        clean: false,
        hasStagedChanges: false,
        hasUnstagedChanges: false,
        untrackedCount: 0,
        conflictDetected: false,
        summary: `Failed to inspect git status: ${err.message}`,
      });
    }
  });
}

/**
 * Validates verification gate input parameters.
 */
function validateVerificationInput(
  input: PreCommitVerificationInput,
  projectRoot: string
): WorkspaceCommand[] {
  // Validate subpath containment if supplied
  if (input.subpath) {
    assertSandboxPath(input.subpath, projectRoot);
  }

  // Validate check sequence
  const requestedChecks = input.checks ?? DEFAULT_VERIFICATION_SEQUENCE;

  if (!Array.isArray(requestedChecks) || requestedChecks.length === 0) {
    throw new VerificationGateError(
      "Verification sequence must be a non-empty array of valid checks",
      "EMPTY_VERIFICATION_SEQUENCE"
    );
  }

  for (const cmd of requestedChecks) {
    if (!ALLOWED_WORKSPACE_COMMANDS.includes(cmd)) {
      throw new WorkspaceSecurityError(
        `Invalid or prohibited verification check: '${cmd}'. Allowed checks: ${ALLOWED_WORKSPACE_COMMANDS.join(", ")}`,
        "PROHIBITED_VERIFICATION_COMMAND"
      );
    }
  }

  return requestedChecks;
}

/**
 * Executes the complete pre-commit verification sequence.
 * Fails closed upon the first failing check or error.
 */
export async function runPreCommitVerification(
  input: PreCommitVerificationInput = {},
  runnerConfig?: WorkspaceRunnerConfig
): Promise<PreCommitVerificationResult> {
  const startTime = Date.now();
  const projectRoot = getCanonicalProjectRoot(runnerConfig?.projectRoot);

  // 1. Validate inputs and determine sequence
  const sequence = validateVerificationInput(input, projectRoot);

  const checksRun: WorkspaceCommand[] = [];
  const checksPassed: WorkspaceCommand[] = [];
  const checksFailed: WorkspaceCommand[] = [];
  const checksSkipped: WorkspaceCommand[] = [];
  const results: Record<WorkspaceCommand, VerificationCheckSummary | null> = {
    test: null,
    typecheck: null,
    build: null,
    lint: null,
  };

  let failureReason: string | undefined;
  let gatePassed = true;

  // 2. Optional Git status check
  let gitStatus: GitStatusSummary | undefined;
  if (input.inspectGit !== false) {
    gitStatus = await inspectGitStatus(projectRoot);
    if (gitStatus.conflictDetected) {
      gatePassed = false;
      failureReason = `Pre-commit verification blocked: ${gitStatus.summary}`;
      // All checks are marked as skipped due to git conflict
      for (const cmd of sequence) {
        checksSkipped.push(cmd);
      }

      return {
        started: true,
        passed: false,
        canCommit: false,
        totalDurationMs: Date.now() - startTime,
        checksRun,
        checksPassed,
        checksFailed,
        checksSkipped,
        results,
        failureReason,
        gitStatus,
      };
    }
  }

  // 3. Sequential Execution of Verification Checks
  for (let i = 0; i < sequence.length; i++) {
    const cmd = sequence[i];

    if (!gatePassed) {
      // Prior check failed -> mark remaining checks as skipped
      checksSkipped.push(cmd);
      results[cmd] = {
        command: cmd,
        status: "skipped",
        exitCode: null,
        durationMs: 0,
        stdout: "",
        stderr: "",
        summary: `Check '${cmd}' was skipped because a prior check failed.`,
        timedOut: false,
      };
      continue;
    }

    checksRun.push(cmd);

    // Build check invocation input
    const checkArgs = cmd === "test" && input.testArgs ? input.testArgs : undefined;
    const timeoutMs = input.timeoutOverrides?.[cmd];

    try {
      const commandResult = await executeWorkspaceCommand(
        {
          command: cmd,
          subpath: input.subpath,
          args: checkArgs,
          timeoutMs,
        },
        runnerConfig
      );

      const checkSummary: VerificationCheckSummary = {
        command: cmd,
        status: commandResult.passed ? "passed" : "failed",
        exitCode: commandResult.exitCode,
        durationMs: commandResult.durationMs,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
        summary: commandResult.summary,
        timedOut: commandResult.timedOut,
      };

      results[cmd] = checkSummary;

      if (commandResult.passed) {
        checksPassed.push(cmd);
      } else {
        checksFailed.push(cmd);
        gatePassed = false;
        failureReason = `Verification check '${cmd}' failed: ${commandResult.summary}`;
      }
    } catch (err: any) {
      checksFailed.push(cmd);
      gatePassed = false;
      failureReason = `Verification check '${cmd}' encountered an execution error: ${err.message}`;

      results[cmd] = {
        command: cmd,
        status: "failed",
        exitCode: null,
        durationMs: 0,
        stdout: "",
        stderr: err.message,
        summary: failureReason,
        timedOut: false,
      };
    }
  }

  const totalDurationMs = Date.now() - startTime;

  return {
    started: true,
    passed: gatePassed,
    canCommit: gatePassed,
    totalDurationMs,
    checksRun,
    checksPassed,
    checksFailed,
    checksSkipped,
    results,
    failureReason,
    gitStatus,
  };
}

/**
 * Authorized Agent Operation Entry Point for Pre-Commit Verification Gate.
 * Evaluates caller permissions under EXECUTE tier, records forensic audit log,
 * enforces financial shield, and fail-closed semantics.
 */
export async function runSandboxedPreCommitVerification(
  context: AgentSafetyContext,
  input: PreCommitVerificationInput,
  targetUserId: string,
  runnerConfig?: WorkspaceRunnerConfig,
  dbClient?: any
): Promise<AgentOperationResult<PreCommitVerificationResult>> {
  const operationName = "workspace.verify";

  return await executeAgentOperation<PreCommitVerificationInput, PreCommitVerificationResult>({
    context,
    toolName: operationName,
    operation: operationName,
    arguments: input,
    targetUserId,
    dbClient,
    executor: async () => {
      return await runPreCommitVerification(input, runnerConfig);
    },
  });
}
