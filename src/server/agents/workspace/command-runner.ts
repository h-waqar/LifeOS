/**
 * Validated Workspace Command Runner
 *
 * Requirements:
 * - WORK-01: Agent development execution is restricted to project root directory.
 * - WORK-02: Validated runners exist for test, typecheck, build, and lint with structured reporting.
 *
 * Security Invariants:
 * - Finite command allowlist (test, typecheck, build, lint).
 * - No arbitrary shell execution (shell: false, fixed executables and argument vectors).
 * - Subprocess working directory strictly confined to project root sandbox.
 * - Hard subprocess timeouts with graceful SIGTERM and forced SIGKILL.
 * - Bounded stdout/stderr output capture (capped at 1 MB by default).
 * - Zero-trust execution boundary integration via executeAgentOperation.
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { executeAgentOperation, type AgentOperationResult } from "../safety-boundary";
import type { AgentSafetyContext } from "../permissions/types";
import { assertSandboxPath, getCanonicalProjectRoot } from "./sandbox";
import {
  ALLOWED_WORKSPACE_COMMANDS,
  type RunWorkspaceCommandInput,
  type WorkspaceCommand,
  type WorkspaceCommandResult,
  type WorkspaceCommandSpec,
  type WorkspaceRunnerConfig,
  WorkspaceSecurityError,
} from "./types";

export const DEFAULT_TIMEOUTS_MS: Record<WorkspaceCommand, number> = {
  test: 60_000,
  typecheck: 60_000,
  lint: 60_000,
  build: 120_000,
};

export const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB default output limit
const DEFAULT_GRACE_PERIOD_MS = 1_000;

const PROHIBITED_TOKENS = new Set([
  "rm",
  "rmdir",
  "unlink",
  "curl",
  "wget",
  "sh",
  "bash",
  "zsh",
  "dash",
  "sudo",
  "su",
  "chmod",
  "chown",
  "mkfs",
  "dd",
  "eval",
  "python",
  "python3",
  "node",
  "perl",
  "ruby",
  "nohup",
  "kill",
  "pkill",
  "killall",
  "shutdown",
  "reboot",
  "poweroff",
  "systemctl",
  "service",
  "iptables",
  "ufw",
  "nc",
  "netcat",
  "ncat",
]);

const PROHIBITED_FILE_TARGETS = [
  ".env",
  ".env.local",
  ".env.production",
  ".git/hooks",
  "/etc",
  "/tmp",
  "/var",
];

/**
 * Resolves default lint arguments based on repository package.json scripts.
 */
function resolveLintBaseArgs(projectRoot: string): string[] {
  try {
    const pkgPath = path.join(projectRoot, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.scripts && typeof pkg.scripts.lint === "string") {
        return ["lint"];
      }
    }
  } catch {}
  return ["exec", "tsc", "--noEmit"];
}

/**
 * Returns default command specs mapped to the canonical project root.
 */
export function getDefaultCommandSpecs(projectRoot: string): Record<WorkspaceCommand, WorkspaceCommandSpec> {
  return {
    test: {
      executable: "pnpm",
      baseArgs: ["test"],
      defaultTimeoutMs: DEFAULT_TIMEOUTS_MS.test,
    },
    typecheck: {
      executable: "pnpm",
      baseArgs: ["exec", "tsc", "--noEmit"],
      defaultTimeoutMs: DEFAULT_TIMEOUTS_MS.typecheck,
    },
    build: {
      executable: "pnpm",
      baseArgs: ["build"],
      defaultTimeoutMs: DEFAULT_TIMEOUTS_MS.build,
    },
    lint: {
      executable: "pnpm",
      baseArgs: resolveLintBaseArgs(projectRoot),
      defaultTimeoutMs: DEFAULT_TIMEOUTS_MS.lint,
    },
  };
}

/**
 * Validates command inputs and arguments against security boundaries.
 */
function validateCommandInput(
  input: RunWorkspaceCommandInput,
  projectRoot: string
): void {
  // 1. Finite command allowlist assertion
  if (!ALLOWED_WORKSPACE_COMMANDS.includes(input.command)) {
    throw new WorkspaceSecurityError(
      `Prohibited or unknown workspace command: '${String(input.command)}'. Allowed commands: ${ALLOWED_WORKSPACE_COMMANDS.join(", ")}`,
      "PROHIBITED_COMMAND"
    );
  }

  // 2. Extra argument validation
  if (input.args !== undefined) {
    if (!Array.isArray(input.args)) {
      throw new WorkspaceSecurityError(
        "Arguments must be provided as an array of strings",
        "INVALID_ARGUMENTS_FORMAT"
      );
    }

    // Only 'test' allows optional targeted file/filter arguments
    if (input.command !== "test" && input.args.length > 0) {
      throw new WorkspaceSecurityError(
        `Additional arguments are prohibited for workspace command '${input.command}'`,
        "UNEXPECTED_ARGUMENTS"
      );
    }

    if (input.args.length > 10) {
      throw new WorkspaceSecurityError(
        "Excessive argument count: maximum 10 arguments allowed",
        "ARGUMENT_LIMIT_EXCEEDED"
      );
    }

    for (const arg of input.args) {
      if (typeof arg !== "string") {
        throw new WorkspaceSecurityError(
          "All arguments must be non-empty strings",
          "INVALID_ARGUMENT_TYPE"
        );
      }

      const trimmed = arg.trim();
      if (!trimmed) {
        throw new WorkspaceSecurityError(
          "Empty arguments are prohibited",
          "EMPTY_ARGUMENT"
        );
      }

      // Prohibit null bytes, control characters, and newlines
      if (/[\0\r\n]/.test(trimmed)) {
        throw new WorkspaceSecurityError(
          "Argument contains forbidden control characters",
          "CONTROL_CHAR_INJECTION"
        );
      }

      // Prohibit shell metacharacters
      if (/[;&|`$()<>{}"'\\*?~]/.test(trimmed)) {
        throw new WorkspaceSecurityError(
          `Argument '${trimmed}' contains forbidden shell metacharacters`,
          "SHELL_METACHAR_INJECTION"
        );
      }

      // Prohibit option/flag injection (e.g. --inspect, -e, --eval)
      if (trimmed.startsWith("-")) {
        throw new WorkspaceSecurityError(
          `Argument flag injection rejected: '${trimmed}' starts with '-'`,
          "FLAG_INJECTION"
        );
      }

      // Prohibit path traversal patterns
      if (trimmed.includes("..") || trimmed.toLowerCase().includes("%2e")) {
        throw new WorkspaceSecurityError(
          `Path traversal sequence rejected in argument: '${trimmed}'`,
          "ARGUMENT_TRAVERSAL"
        );
      }

      // Strict token blocklist (defense-in-depth)
      const lower = trimmed.toLowerCase();
      if (PROHIBITED_TOKENS.has(lower)) {
        throw new WorkspaceSecurityError(
          `Prohibited command token rejected in argument: '${trimmed}'`,
          "BLOCKED_TOKEN"
        );
      }

      for (const target of PROHIBITED_FILE_TARGETS) {
        if (lower === target || lower.startsWith(`${target}/`) || lower.endsWith(`/${target}`)) {
          throw new WorkspaceSecurityError(
            `Sensitive path access rejected in argument: '${trimmed}'`,
            "SENSITIVE_TARGET_ACCESS"
          );
        }
      }

      // Verify that if argument resembles a project path, it is contained
      if (trimmed.includes("/") || trimmed.endsWith(".ts") || trimmed.endsWith(".js") || trimmed.endsWith(".json")) {
        assertSandboxPath(trimmed, projectRoot);
      }
    }
  }
}

/**
 * Sanitizes process environment to avoid dangerous injection variables.
 */
function createSanitizedEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const dangerousVars = [
    "NODE_OPTIONS",
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH",
    "PYTHONPATH",
    "PERL5LIB",
  ];

  for (const v of dangerousVars) {
    delete env[v];
  }

  env.CI = "true";
  env.FORCE_COLOR = "0";

  return env;
}

/**
 * Executes a validated workspace command with strict isolation, timeouts, and bounded output.
 */
export async function executeWorkspaceCommand(
  input: RunWorkspaceCommandInput,
  config?: WorkspaceRunnerConfig
): Promise<WorkspaceCommandResult> {
  const projectRoot = getCanonicalProjectRoot(config?.projectRoot);

  // 1. Validate command, arguments, and defense-in-depth invariants
  validateCommandInput(input, projectRoot);

  // 2. Validate and enforce working directory inside project sandbox
  const cwd = input.subpath
    ? assertSandboxPath(input.subpath, projectRoot)
    : projectRoot;

  // 3. Resolve command specification
  const defaultSpecs = getDefaultCommandSpecs(projectRoot);
  const spec = config?.commandSpecs?.[input.command] ?? defaultSpecs[input.command];

  if (!spec) {
    throw new WorkspaceSecurityError(
      `No execution specification configured for command '${input.command}'`,
      "MISSING_COMMAND_SPEC"
    );
  }

  // 4. Determine and bound timeout
  const configuredTimeout =
    input.timeoutMs ??
    config?.defaultTimeouts?.[input.command] ??
    spec.defaultTimeoutMs;

  const timeoutMs = Math.max(50, Math.min(300_000, configuredTimeout));
  const maxOutputBytes = config?.maxOutputBytes ?? MAX_OUTPUT_BYTES;

  // 5. Build final argv without shell interpolation
  const finalArgs = [...spec.baseArgs, ...(input.args ?? [])];
  const sanitizedEnv = createSanitizedEnvironment();

  const startTime = Date.now();

  return new Promise<WorkspaceCommandResult>((resolve) => {
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let settled = false;

    let timeoutTimer: NodeJS.Timeout | null = null;
    let forceKillTimer: NodeJS.Timeout | null = null;

    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(spec.executable, finalArgs, {
        cwd,
        shell: false,
        env: sanitizedEnv,
        detached: true,
      });
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      return resolve({
        command: input.command,
        exitCode: null,
        stdout: "",
        stderr: err.message ?? "Spawn invocation error",
        durationMs,
        passed: false,
        summary: `Command '${input.command}' failed to launch: ${err.message}`,
        timedOut: false,
        stdoutTruncated: false,
        stderrTruncated: false,
        executionError: err.message,
      });
    }

    const cleanupTimers = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
        forceKillTimer = null;
      }
    };

    const killProcessTree = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {}
      }
    };

    // Setup timeout handler
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      killProcessTree("SIGTERM");

      forceKillTimer = setTimeout(() => {
        killProcessTree("SIGKILL");
      }, DEFAULT_GRACE_PERIOD_MS);
    }, timeoutMs);

    // Stream capture with bounded capacity
    child.stdout?.on("data", (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      if (stdoutBytes < maxOutputBytes) {
        const remaining = maxOutputBytes - stdoutBytes;
        if (buf.length <= remaining) {
          stdoutBuffer += buf.toString("utf-8");
          stdoutBytes += buf.length;
        } else {
          stdoutBuffer += buf.subarray(0, remaining).toString("utf-8");
          stdoutBytes = maxOutputBytes;
          stdoutTruncated = true;
        }
      } else {
        stdoutTruncated = true;
      }
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      if (stderrBytes < maxOutputBytes) {
        const remaining = maxOutputBytes - stderrBytes;
        if (buf.length <= remaining) {
          stderrBuffer += buf.toString("utf-8");
          stderrBytes += buf.length;
        } else {
          stderrBuffer += buf.subarray(0, remaining).toString("utf-8");
          stderrBytes = maxOutputBytes;
          stderrTruncated = true;
        }
      } else {
        stderrTruncated = true;
      }
    });

    const finalize = (exitCode: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      cleanupTimers();

      const durationMs = Date.now() - startTime;

      if (stdoutTruncated) {
        stdoutBuffer += `\n[LifeOS Output truncated: exceeded limit of ${maxOutputBytes} bytes]`;
      }
      if (stderrTruncated) {
        stderrBuffer += `\n[LifeOS Output truncated: exceeded limit of ${maxOutputBytes} bytes]`;
      }

      const passed = exitCode === 0 && !timedOut;

      let summary: string;
      if (timedOut) {
        summary = `Command '${input.command}' timed out after ${durationMs}ms (limit: ${timeoutMs}ms) and was terminated.`;
      } else if (passed) {
        summary = `Command '${input.command}' completed successfully in ${durationMs}ms (exit code 0).`;
      } else {
        summary = `Command '${input.command}' failed in ${durationMs}ms with exit code ${exitCode ?? signal ?? "unknown"}.`;
      }

      resolve({
        command: input.command,
        exitCode: timedOut ? null : exitCode,
        stdout: stdoutBuffer,
        stderr: stderrBuffer,
        durationMs,
        passed,
        summary,
        timedOut,
        stdoutTruncated,
        stderrTruncated,
      });
    };

    child.on("close", (code, signal) => {
      finalize(code, signal);
    });

    child.on("error", (err: Error) => {
      if (settled) return;
      settled = true;
      cleanupTimers();

      const durationMs = Date.now() - startTime;
      resolve({
        command: input.command,
        exitCode: null,
        stdout: stdoutBuffer,
        stderr: stderrBuffer ? `${stderrBuffer}\n${err.message}` : err.message,
        durationMs,
        passed: false,
        summary: `Command '${input.command}' failed to execute: ${err.message}`,
        timedOut: false,
        stdoutTruncated,
        stderrTruncated,
        executionError: err.message,
      });
    });
  });
}

/**
 * Canonical authorized workspace execution entry point.
 * Enforces agent safety boundary, anti-spoofing, capability checks, and forensic audit logging.
 */
export async function runSandboxedWorkspaceCommand(
  context: AgentSafetyContext,
  input: RunWorkspaceCommandInput,
  targetUserId: string,
  runnerConfig?: WorkspaceRunnerConfig,
  dbClient?: any
): Promise<AgentOperationResult<WorkspaceCommandResult>> {
  const operationName = `workspace.${input.command}`;

  return await executeAgentOperation<RunWorkspaceCommandInput, WorkspaceCommandResult>({
    context,
    toolName: operationName,
    operation: operationName,
    arguments: input,
    targetUserId,
    dbClient,
    executor: async () => {
      return await executeWorkspaceCommand(input, runnerConfig);
    },
  });
}
