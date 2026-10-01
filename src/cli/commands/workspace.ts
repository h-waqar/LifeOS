/**
 * CLI Workspace Commands: run, verify, materialize
 *
 * Exposes the controlled project workspace execution harness and pre-commit
 * verification gate to the LifeOS CLI.
 *
 * Enforces:
 * - Authentication requirement
 * - Strict parameter validation via Zod and command allowlists
 * - Zero caller identity spoofing
 * - Full sandboxed containment
 */

import { assertNoCallerSpoofing } from "../auth";
import { UsageError } from "../errors";
import type { CommandResult, ParsedArgs, CommandContext } from "../types";
import { EXIT_CODES } from "../types";
import type { AgentSafetyContext } from "@/server/agents/permissions/types";
import {
  runSandboxedWorkspaceCommand,
  runSandboxedPreCommitVerification,
  runSandboxedPlanMaterialization,
  getPlanExecutionStatus,
  getNextReadyPlanTask,
  executePlanStep,
  runSandboxedPlanStepExecution,
  runSandboxedWorkspaceCommit,
  issueVerificationLease,
  getVerificationLease,
  listVerificationLeases,
  runSandboxedHookInstall,
  runSandboxedHookUninstall,
  runSandboxedHookStatus,
  assertSandboxPath,
  developmentPlanSchema,
  ALLOWED_WORKSPACE_COMMANDS,
  type WorkspaceCommand,
} from "@/server/agents/workspace";
import fs from "fs";

export async function handleWorkspace(
  parsed: ParsedArgs,
  context?: CommandContext
): Promise<CommandResult<unknown>> {
  if (!context?.user) {
    throw new UsageError("Authentication required. Please log in or provide --token.");
  }

  assertNoCallerSpoofing(parsed.flags);

  const subcommands = parsed.subcommands.slice(1);
  const action = subcommands[0]?.toLowerCase();

  if (!action) {
    throw new UsageError(
      "Missing workspace action. Available actions: run, verify, materialize, status, next-task, step, commit, lease, hook.\n" +
        "Run 'lifeos workspace --help' for usage."
    );
  }

  const safetyContext: AgentSafetyContext = {
    isAgent: false,
    user: {
      id: context.user.id,
      email: context.user.email,
      name: context.user.name,
    },
    sessionId: context.token,
    provider: "cli",
  };

  switch (action) {
    case "run": {
      const commandName = subcommands[1]?.toLowerCase();
      if (!commandName) {
        throw new UsageError(
          `Missing command name. Allowed commands: ${ALLOWED_WORKSPACE_COMMANDS.join(", ")}`
        );
      }

      if (!ALLOWED_WORKSPACE_COMMANDS.includes(commandName as WorkspaceCommand)) {
        throw new UsageError(
          `Invalid command '${commandName}'. Allowed commands: ${ALLOWED_WORKSPACE_COMMANDS.join(", ")}`
        );
      }

      const subpath = (parsed.flags.subpath as string) || undefined;
      let args: string[] | undefined;
      if (parsed.flags.args) {
        if (Array.isArray(parsed.flags.args)) {
          args = parsed.flags.args.map(String);
        } else if (typeof parsed.flags.args === "string") {
          args = parsed.flags.args.split(",").map((s) => s.trim()).filter(Boolean);
        }
      }

      const timeoutMs = parsed.flags.timeout ? Number(parsed.flags.timeout) : undefined;

      const opResult = await (runSandboxedWorkspaceCommand as any)(
        safetyContext,
        {
          command: commandName as WorkspaceCommand,
          subpath,
          args,
          timeoutMs,
        },
        context.user.id
      );

      const result =
        opResult && typeof opResult === "object" && "status" in opResult && opResult.status === "EXECUTED"
          ? opResult.data
          : opResult;

      const tableData = {
        columns: [
          { key: "command", label: "Command", width: 14 },
          { key: "passed", label: "Passed", width: 10 },
          { key: "exitCode", label: "Exit Code", width: 12 },
          { key: "durationMs", label: "Duration", width: 12 },
          { key: "summary", label: "Summary", width: 40 },
        ],
        rows: [
          {
            command: result.command,
            passed: result.passed ? "YES" : "NO",
            exitCode: String(result.exitCode),
            durationMs: `${result.durationMs}ms`,
            summary: result.summary,
          },
        ],
        title: "Workspace Command Execution",
      };

      return {
        data: result,
        tableData,
        message: result.summary,
        exitCode: result.passed ? EXIT_CODES.SUCCESS : EXIT_CODES.ERROR_GENERAL,
      };
    }

    case "verify": {
      let checks: WorkspaceCommand[] | undefined;
      if (parsed.flags.checks) {
        if (Array.isArray(parsed.flags.checks)) {
          checks = parsed.flags.checks as WorkspaceCommand[];
        } else if (typeof parsed.flags.checks === "string") {
          checks = parsed.flags.checks
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean) as WorkspaceCommand[];
        }
      }

      const subpath = (parsed.flags.subpath as string) || undefined;
      const timeoutMs = parsed.flags.timeout ? Number(parsed.flags.timeout) : undefined;

      const opResult = await (runSandboxedPreCommitVerification as any)(
        safetyContext,
        {
          checks,
          subpath,
          timeoutMs,
        },
        context.user.id
      );

      const result =
        opResult && typeof opResult === "object" && "status" in opResult && opResult.status === "EXECUTED"
          ? opResult.data
          : opResult;

      const checkList = result.results || result.checks || [];
      const rows = checkList.map((c: any) => ({
        check: c.command || c.check,
        passed: c.status === "skipped" || c.skipped ? "SKIPPED" : c.status === "passed" || c.passed ? "YES" : "NO",
        exitCode: c.exitCode === null || c.skipped ? "-" : String(c.exitCode),
        durationMs: `${c.durationMs}ms`,
      }));

      const tableData = {
        columns: [
          { key: "check", label: "Verification Check", width: 20 },
          { key: "passed", label: "Passed", width: 12 },
          { key: "exitCode", label: "Exit Code", width: 12 },
          { key: "durationMs", label: "Duration", width: 12 },
        ],
        rows,
        title: `Pre-Commit Verification (${result.canCommit ? "COMMIT ELIGIBLE" : "COMMIT BLOCKED"})`,
      };

      const checksRunCount = (result.checksRun || result.executedChecks || []).length;
      return {
        data: result,
        tableData,
        message: result.failureReason || result.failureSummary || `All ${checksRunCount} checks passed. Commit permitted.`,
        exitCode: result.canCommit ? EXIT_CODES.SUCCESS : EXIT_CODES.ERROR_GENERAL,
      };
    }

    case "materialize": {
      const projectId =
        (parsed.flags.projectId as string) ||
        (parsed.flags["project-id"] as string) ||
        (parsed.flags.project as string);

      if (!projectId) {
        throw new UsageError("Flag '--project-id' is required for plan materialization.");
      }

      const planFilePath =
        (parsed.flags.planFile as string) ||
        (parsed.flags["plan-file"] as string) ||
        (parsed.flags.plan as string);

      if (!planFilePath) {
        throw new UsageError("Flag '--plan-file' is required for plan materialization.");
      }

      const canonicalPath = assertSandboxPath(planFilePath);
      if (!fs.existsSync(canonicalPath)) {
        throw new UsageError(`Plan file not found: '${planFilePath}'.`);
      }

      let planContentRaw: string;
      try {
        planContentRaw = fs.readFileSync(canonicalPath, "utf-8");
      } catch (err) {
        throw new UsageError(`Failed to read plan file: ${err instanceof Error ? err.message : String(err)}`);
      }

      let rawJson: unknown;
      try {
        rawJson = JSON.parse(planContentRaw);
      } catch (err) {
        throw new UsageError(`Plan file contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
      }

      let parsedPlan;
      try {
        if (rawJson && typeof rawJson === "object" && !("projectId" in rawJson)) {
          (rawJson as Record<string, unknown>).projectId = projectId;
        }
        parsedPlan = developmentPlanSchema.parse(rawJson);
      } catch (err) {
        throw new UsageError(`Plan schema validation error: ${err instanceof Error ? err.message : String(err)}`);
      }

      const opResult = await (runSandboxedPlanMaterialization as any)(
        safetyContext,
        {
          projectId,
          plan: parsedPlan,
        },
        context.user.id
      );

      const result =
        opResult && typeof opResult === "object" && "status" in opResult && opResult.status === "EXECUTED"
          ? opResult.data
          : opResult;

      const rows = (result.tasks || []).map((t: any) => ({
        stepId: t.stepId,
        taskId: t.taskId,
        title: t.title,
        priority: t.priority,
        order: String(t.orderIndex ?? "-"),
      }));

      const depCount = result.dependencyCount ?? result.dependenciesCreated ?? 0;
      const tableData = {
        columns: [
          { key: "order", label: "#", width: 6 },
          { key: "stepId", label: "Step ID", width: 16 },
          { key: "taskId", label: "Task ID", width: 38 },
          { key: "title", label: "Title", width: 30 },
          { key: "priority", label: "Priority", width: 10 },
        ],
        rows,
        title: `Plan Materialized: '${result.planId}' (${result.taskCount} tasks, ${depCount} dependencies)`,
      };

      return {
        data: result,
        tableData,
        message: `Plan '${result.planId}' successfully materialized with ${result.taskCount} tasks.`,
        exitCode: EXIT_CODES.SUCCESS,
      };
    }

    case "status": {
      const planId =
        (parsed.flags.planId as string) ||
        (parsed.flags["plan-id"] as string) ||
        (parsed.flags.plan as string);

      if (!planId) {
        throw new UsageError("Flag '--plan-id' is required for workspace status.");
      }

      const projectId =
        (parsed.flags.projectId as string) ||
        (parsed.flags["project-id"] as string) ||
        (parsed.flags.project as string) ||
        undefined;

      const result = await getPlanExecutionStatus(context.user.id, planId, projectId);

      let readyLine = "";
      if (result.nextReadyTask) {
        readyLine = `\n\nREADY:\n  ${result.nextReadyTask.stepId} — ${result.nextReadyTask.title}`;
      } else if (result.status === "BLOCKED" && result.blockedReasons.length > 0) {
        readyLine = `\n\nBlocked by:\n  ${result.blockedReasons.join("\n  ")}`;
      } else if (result.status === "COMPLETED") {
        readyLine = `\n\nAll plan steps are complete.`;
      }

      const message = `Plan: ${result.planId}\nProgress: ${result.completedSteps}/${result.totalSteps} (${result.progressPercent}%)\nStatus: ${result.status}${readyLine}`;

      const rows = result.steps.map((s) => ({
        stepId: s.stepId,
        taskId: s.taskId,
        title: s.title,
        status: s.status,
        priority: s.priority,
      }));

      const tableData = {
        columns: [
          { key: "stepId", label: "Step ID", width: 16 },
          { key: "title", label: "Title", width: 32 },
          { key: "status", label: "Status", width: 14 },
          { key: "priority", label: "Priority", width: 10 },
          { key: "taskId", label: "Task ID", width: 38 },
        ],
        rows,
        title: `Plan Execution Status: '${result.planId}' (${result.status})`,
      };

      return {
        data: result,
        tableData,
        message,
        exitCode: result.status === "INVALID" ? EXIT_CODES.ERROR_GENERAL : EXIT_CODES.SUCCESS,
      };
    }

    case "next-task":
    case "next_task":
    case "next": {
      const planId =
        (parsed.flags.planId as string) ||
        (parsed.flags["plan-id"] as string) ||
        (parsed.flags.plan as string);

      if (!planId) {
        throw new UsageError("Flag '--plan-id' is required for workspace next-task.");
      }

      const projectId =
        (parsed.flags.projectId as string) ||
        (parsed.flags["project-id"] as string) ||
        (parsed.flags.project as string) ||
        undefined;

      const result = await getNextReadyPlanTask(context.user.id, planId, projectId);

      let message = "";
      if (result.state === "READY" && result.task) {
        message = `READY\nTask: ${result.task.taskId}\nStep: ${result.task.stepId}\nTitle: ${result.task.title}`;
      } else if (result.state === "BLOCKED") {
        const reasons =
          result.blockedReasons && result.blockedReasons.length > 0
            ? result.blockedReasons.join("\n  ")
            : "No dependencies met";
        message = `BLOCKED\nNo executable task is currently available.\n\nBlocked by:\n  ${reasons}`;
      } else if (result.state === "COMPLETE") {
        message = `COMPLETE\nAll plan steps are complete.`;
      } else if (result.state === "INVALID") {
        const errs =
          result.errors && result.errors.length > 0
            ? result.errors.join("\n  ")
            : "Unknown plan integrity error";
        message = `INVALID\nPlan integrity violation:\n  ${errs}`;
      }

      return {
        data: result,
        message,
        exitCode: result.state === "INVALID" ? EXIT_CODES.ERROR_GENERAL : EXIT_CODES.SUCCESS,
      };
    }

    case "step":
    case "execute-step":
    case "execute_step": {
      const planId =
        (parsed.flags.planId as string) ||
        (parsed.flags["plan-id"] as string) ||
        (parsed.flags.plan as string);

      if (!planId) {
        throw new UsageError("Flag '--plan-id' is required for workspace step execution.");
      }

      const projectId =
        (parsed.flags.projectId as string) ||
        (parsed.flags["project-id"] as string) ||
        (parsed.flags.project as string) ||
        undefined;

      const taskId =
        (parsed.flags.taskId as string) ||
        (parsed.flags["task-id"] as string) ||
        undefined;

      const stepId =
        (parsed.flags.stepId as string) ||
        (parsed.flags["step-id"] as string) ||
        undefined;

      let verificationChecks: WorkspaceCommand[] | undefined;
      if (parsed.flags.checks) {
        if (Array.isArray(parsed.flags.checks)) {
          verificationChecks = parsed.flags.checks.map(String) as WorkspaceCommand[];
        } else if (typeof parsed.flags.checks === "string") {
          verificationChecks = parsed.flags.checks.split(",").map((s) => s.trim()) as WorkspaceCommand[];
        }
      }

      const maxRetries = parsed.flags["max-retries"] || parsed.flags.maxRetries
        ? Number(parsed.flags["max-retries"] || parsed.flags.maxRetries)
        : undefined;

      const opResult = await (runSandboxedPlanStepExecution as any)(
        safetyContext,
        {
          planId,
          projectId,
          taskId,
          stepId,
          verificationChecks,
          maxRetries,
        },
        context.user.id
      );

      const result =
        opResult && typeof opResult === "object" && "status" in opResult && opResult.status === "EXECUTED"
          ? opResult.data
          : opResult;

      let message = `Step Execution: ${result.outcome}\nPlan: ${result.planId} (${result.planStatus})`;
      if (result.taskId) {
        message += `\nTask: ${result.taskId} (Step: ${result.stepId || "-"}) — ${result.taskTitle || "Untitled"}`;
        message += `\nStatus: ${result.taskStatus} (Attempt: ${result.attempts}/${result.maxRetries})`;
      }
      if (result.failureReason) {
        message += `\nReason: ${result.failureReason}`;
      }
      if (result.nextReadyTask) {
        message += `\nNext Ready: ${result.nextReadyTask.stepId} — ${result.nextReadyTask.title}`;
      }

      const tableData = {
        columns: [
          { key: "property", label: "Property", width: 16 },
          { key: "value", label: "Value", width: 40 },
        ],
        rows: [
          { property: "Outcome", value: result.outcome },
          { property: "Plan ID", value: result.planId },
          { property: "Plan Status", value: result.planStatus },
          { property: "Step ID", value: result.stepId || "-" },
          { property: "Task ID", value: result.taskId || "-" },
          { property: "Task Status", value: result.taskStatus },
          { property: "Attempts", value: `${result.attempts}/${result.maxRetries}` },
          { property: "Next Ready", value: result.nextReadyTask ? `${result.nextReadyTask.stepId} (${result.nextReadyTask.title})` : "-" },
        ],
        title: `Plan Step Execution: '${result.planId}' (${result.outcome})`,
      };

      const exitCode = result.success ? EXIT_CODES.SUCCESS : EXIT_CODES.ERROR_GENERAL;

      return {
        data: result,
        tableData,
        message,
        exitCode,
      };
    }

    case "commit": {
      const message =
        (parsed.flags.message as string) ||
        (parsed.flags.m as string) ||
        subcommands[1];

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        throw new UsageError("Flag '--message' (or '-m') is required for workspace commit.");
      }

      const leaseId = (parsed.flags["lease-id"] as string) || (parsed.flags.lease as string) || undefined;
      const autoVerify = Boolean(parsed.flags["auto-verify"] || parsed.flags.verify);
      const subpath = (parsed.flags.subpath as string) || undefined;
      const timeoutMs = parsed.flags.timeout ? Number(parsed.flags.timeout) : undefined;

      const opResult = await runSandboxedWorkspaceCommit(
        safetyContext,
        {
          message: message.trim(),
          leaseId,
          autoVerify,
          subpath,
          timeoutMs,
        },
        context.user.id
      );

      const result =
        opResult && typeof opResult === "object" && "status" in opResult && opResult.status === "EXECUTED"
          ? (opResult as any).data
          : opResult;

      const tableData = {
        columns: [
          { key: "property", label: "Property", width: 18 },
          { key: "value", label: "Value", width: 44 },
        ],
        rows: [
          { property: "Outcome", value: result.outcome },
          { property: "Success", value: result.success ? "YES" : "NO" },
          { property: "Commit Hash", value: result.commitHash || "-" },
          { property: "Lease ID", value: result.leaseId || "-" },
          { property: "Message", value: result.message },
          { property: "Duration", value: `${result.durationMs}ms` },
          { property: "Summary", value: result.summary },
        ],
        title: `Workspace Git Commit (${result.outcome})`,
      };

      return {
        data: result,
        tableData,
        message: result.summary,
        exitCode: result.success ? EXIT_CODES.SUCCESS : EXIT_CODES.ERROR_GENERAL,
      };
    }

    case "lease": {
      const subaction = subcommands[1]?.toLowerCase() || "list";

      switch (subaction) {
        case "create": {
          const verifyResult = await runSandboxedPreCommitVerification(
            safetyContext,
            {},
            context.user.id
          );
          const vData = (verifyResult as any)?.data || verifyResult;
          if (!vData.passed) {
            throw new UsageError(
              `Cannot issue verification lease: pre-commit verification failed (${vData.failureReason || "check failed"}).`
            );
          }
          const lease = await issueVerificationLease({
            projectRoot: process.cwd(),
            verificationResult: vData,
            userId: context.user.id,
            sessionId: context.token,
          });

          return {
            data: lease,
            message: `Verification lease issued: ${lease.leaseId} (valid for 10 min)`,
            exitCode: EXIT_CODES.SUCCESS,
          };
        }

        case "get": {
          const leaseId = subcommands[2] || (parsed.flags["lease-id"] as string);
          if (!leaseId) {
            throw new UsageError("Missing lease ID. Usage: lifeos workspace lease get <leaseId>");
          }
          const lease = await getVerificationLease(process.cwd(), leaseId);
          if (!lease) {
            throw new UsageError(`Verification lease '${leaseId}' not found.`);
          }
          return {
            data: lease,
            message: `Lease ${lease.leaseId}: consumed=${lease.consumed}, expires=${new Date(lease.expiresAt).toISOString()}`,
            exitCode: EXIT_CODES.SUCCESS,
          };
        }

        case "list":
        default: {
          const leases = await listVerificationLeases(process.cwd());
          const rows = leases.slice(0, 10).map((l) => ({
            leaseId: l.leaseId.slice(0, 8),
            status: l.consumed ? "CONSUMED" : Date.now() > l.expiresAt ? "EXPIRED" : "ACTIVE",
            created: new Date(l.createdAt).toLocaleTimeString(),
            checks: l.checksRun.join(", "),
            commit: l.commitHash ? l.commitHash.slice(0, 7) : "-",
          }));

          const tableData = {
            columns: [
              { key: "leaseId", label: "Lease ID", width: 12 },
              { key: "status", label: "Status", width: 12 },
              { key: "created", label: "Created", width: 14 },
              { key: "checks", label: "Checks", width: 24 },
              { key: "commit", label: "Commit", width: 10 },
            ],
            rows,
            title: `Verification Leases (${leases.length} total)`,
          };

          return {
            data: leases,
            tableData,
            message: `${leases.length} verification lease(s) found.`,
            exitCode: EXIT_CODES.SUCCESS,
          };
        }
      }
    }

    case "hook": {
      const subaction = subcommands[1]?.toLowerCase() || "status";

      switch (subaction) {
        case "install": {
          const opResult = await runSandboxedHookInstall(safetyContext, context.user.id, process.cwd());
          const res = (opResult as any)?.data || opResult;
          return {
            data: res,
            message: res.message,
            exitCode: res.success ? EXIT_CODES.SUCCESS : EXIT_CODES.ERROR_GENERAL,
          };
        }

        case "uninstall": {
          const opResult = await runSandboxedHookUninstall(safetyContext, context.user.id, process.cwd());
          const res = (opResult as any)?.data || opResult;
          return {
            data: res,
            message: res.message,
            exitCode: res.success ? EXIT_CODES.SUCCESS : EXIT_CODES.ERROR_GENERAL,
          };
        }

        case "status":
        default: {
          const opResult = await runSandboxedHookStatus(safetyContext, context.user.id, process.cwd());
          const res = (opResult as any)?.data || opResult;
          const tableData = {
            columns: [
              { key: "property", label: "Property", width: 18 },
              { key: "value", label: "Value", width: 44 },
            ],
            rows: [
              { property: "Hook Installed", value: res.installed ? "YES" : "NO" },
              { property: "LifeOS Managed", value: res.lifeosManaged ? "YES" : "NO" },
              { property: "Backup Exists", value: res.backupExists ? "YES" : "NO" },
              { property: "Hook Path", value: res.hookPath },
              { property: "Backup Path", value: res.backupPath || "-" },
            ],
            title: "Git Pre-Commit Hook Status",
          };

          return {
            data: res,
            tableData,
            message: `Git pre-commit hook is ${
              res.installed
                ? res.lifeosManaged
                  ? "active (LifeOS managed)"
                  : "active (custom)"
                : "not installed"
            }.`,
            exitCode: EXIT_CODES.SUCCESS,
          };
        }
      }
    }

    default:
      throw new UsageError(
        `Unknown workspace action '${action}'. Available actions: run, verify, materialize, status, next-task, step, commit, lease, hook.`
      );
  }
}
