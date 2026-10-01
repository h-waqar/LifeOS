/**
 * MCP Workspace Tools
 *
 * Exposes canonical workspace execution harness and pre-commit verification gate to agents:
 * - lifeos_workspace_run (EXECUTE)
 * - lifeos_workspace_verify (EXECUTE)
 * - lifeos_workspace_materialize_plan (WRITE)
 *
 * Gated centrally by the Phase 13 Zero-Trust Agent Safety Boundary.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpContext } from "../types";
import type { AgentSafetyContext } from "@/server/agents/permissions/types";
import {
  runSandboxedWorkspaceCommand,
  runSandboxedPreCommitVerification,
  runSandboxedPlanMaterialization,
  runSandboxedPlanStatus,
  runSandboxedNextTask,
  runSandboxedPlanStepExecution,
  runSandboxedWorkspaceCommit,
  issueVerificationLease,
  getPreCommitHookStatus,
  developmentPlanSchema,
  ALLOWED_WORKSPACE_COMMANDS,
  type WorkspaceCommand,
} from "@/server/agents/workspace";
import { verifySessionActive } from "../auth";
import { formatMcpToolSuccess, formatMcpToolError } from "../formatters";

export function registerWorkspaceTools(server: McpServer, context: McpContext): void {
  const register = (
    name: string,
    description: string,
    schema: z.ZodTypeAny,
    handler: (args: any) => Promise<any>
  ) => {
    if (typeof (server as any).registerTool === "function") {
      (server as any).registerTool(
        name,
        {
          description,
          inputSchema: schema,
        },
        handler
      );
    } else if (typeof (server as any).tool === "function") {
      (server as any).tool(name, description, schema, handler);
    }
  };

  const getSafetyContext = (): AgentSafetyContext => ({
    isAgent: Boolean(context.isAgent || context.agent),
    agent: context.agent,
    user: context.user,
    sessionId: context.session?.id,
    provider: context.agent?.provider || "mcp",
  });

  // 1. lifeos_workspace_run
  register(
    "lifeos_workspace_run",
    "Run an allowlisted development command (test, typecheck, build, lint) within the sandboxed project root",
    z
      .object({
        command: z.enum(ALLOWED_WORKSPACE_COMMANDS, {
          errorMap: () => ({
            message: `Command must be one of: ${ALLOWED_WORKSPACE_COMMANDS.join(", ")}`,
          }),
        }),
        subpath: z.string().optional(),
        args: z.array(z.string()).optional(),
        timeoutMs: z.number().int().positive().max(120000).optional(),
      })
      .passthrough(),
    async (args) => {
      try {
        verifySessionActive(context);
        const result = await (runSandboxedWorkspaceCommand as any)(
          getSafetyContext(),
          {
            command: args.command as WorkspaceCommand,
            subpath: args.subpath,
            args: args.args,
            timeoutMs: args.timeoutMs,
          },
          context.user.id
        );
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 2. lifeos_workspace_verify
  register(
    "lifeos_workspace_verify",
    "Execute pre-commit verification sequence (typecheck -> test -> build -> lint) and inspect git status",
    z
      .object({
        checks: z.array(z.enum(ALLOWED_WORKSPACE_COMMANDS)).optional(),
        subpath: z.string().optional(),
        timeoutMs: z.number().int().positive().max(120000).optional(),
      })
      .passthrough(),
    async (args) => {
      try {
        verifySessionActive(context);
        const result = await (runSandboxedPreCommitVerification as any)(
          getSafetyContext(),
          {
            checks: args.checks as WorkspaceCommand[],
            subpath: args.subpath,
            timeoutMs: args.timeoutMs,
          },
          context.user.id
        );
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 3. lifeos_workspace_materialize_plan
  register(
    "lifeos_workspace_materialize_plan",
    "Transform an approved development plan into structured, prioritized LifeOS tasks linked to an active project",
    z
      .object({
        projectId: z.string().uuid("Invalid project UUID").or(z.string().min(1)),
        plan: developmentPlanSchema,
      })
      .passthrough(),
    async (args) => {
      try {
        verifySessionActive(context);
        const result = await (runSandboxedPlanMaterialization as any)(
          getSafetyContext(),
          {
            projectId: args.projectId,
            plan: args.plan,
          },
          context.user.id
        );
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 4. lifeos_workspace_plan_status
  register(
    "lifeos_workspace_plan_status",
    "Inspect the complete execution state, step progress, blockers, and bottlenecks of a development plan",
    z
      .object({
        planId: z.string().trim().min(1, "Plan ID is required"),
        projectId: z.string().trim().min(1).optional(),
      })
      .passthrough(),
    async (args) => {
      try {
        verifySessionActive(context);
        const result = await (runSandboxedPlanStatus as any)(
          getSafetyContext(),
          {
            planId: args.planId,
            projectId: args.projectId,
          },
          context.user.id
        );
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 5. lifeos_workspace_next_task
  register(
    "lifeos_workspace_next_task",
    "Resolve the single deterministic next ready task to execute for a development plan, or return an explicit terminal state (READY, COMPLETE, BLOCKED, INVALID)",
    z
      .object({
        planId: z.string().trim().min(1, "Plan ID is required"),
        projectId: z.string().trim().min(1).optional(),
      })
      .passthrough(),
    async (args) => {
      try {
        verifySessionActive(context);
        const result = await (runSandboxedNextTask as any)(
          getSafetyContext(),
          {
            planId: args.planId,
            projectId: args.projectId,
          },
          context.user.id
        );
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 6. lifeos_workspace_execute_step
  register(
    "lifeos_workspace_execute_step",
    "Execute and verify a single plan step in a closed loop (inspect -> next task -> sandboxed verify -> status reconcile)",
    z
      .object({
        planId: z.string().trim().min(1, "Plan ID is required"),
        projectId: z.string().trim().min(1).optional(),
        taskId: z.string().trim().min(1).optional(),
        stepId: z.string().trim().min(1).optional(),
        verificationChecks: z.array(z.enum(ALLOWED_WORKSPACE_COMMANDS)).optional(),
        maxRetries: z.number().int().positive().max(10).optional(),
        subpath: z.string().optional(),
      })
      .passthrough(),
    async (args) => {
      try {
        verifySessionActive(context);
        const result = await (runSandboxedPlanStepExecution as any)(
          getSafetyContext(),
          {
            planId: args.planId,
            projectId: args.projectId,
            taskId: args.taskId,
            stepId: args.stepId,
            verificationChecks: args.verificationChecks as WorkspaceCommand[],
            maxRetries: args.maxRetries,
            subpath: args.subpath,
          },
          context.user.id
        );
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 7. lifeos_workspace_commit
  register(
    "lifeos_workspace_commit",
    "Execute an audited sandboxed git commit strictly gated by an active Verification Qualification Lease",
    z
      .object({
        message: z.string().trim().min(1, "Commit message cannot be empty").max(2000),
        leaseId: z.string().optional(),
        autoVerify: z.boolean().optional(),
        verificationChecks: z.array(z.enum(ALLOWED_WORKSPACE_COMMANDS)).optional(),
        subpath: z.string().optional(),
        timeoutMs: z.number().int().positive().max(60000).optional(),
      })
      .passthrough(),
    async (args) => {
      try {
        verifySessionActive(context);
        const result = await (runSandboxedWorkspaceCommit as any)(
          getSafetyContext(),
          {
            message: args.message,
            leaseId: args.leaseId,
            autoVerify: args.autoVerify,
            verificationChecks: args.verificationChecks,
            subpath: args.subpath,
            timeoutMs: args.timeoutMs,
          },
          context.user.id
        );
        return formatMcpToolSuccess(result.status === "EXECUTED" ? result.data : result);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 8. lifeos_workspace_acquire_lease
  register(
    "lifeos_workspace_acquire_lease",
    "Run verification checks and issue a time-bound Verification Qualification Lease for the current candidate state",
    z
      .object({
        verificationChecks: z.array(z.enum(ALLOWED_WORKSPACE_COMMANDS)).optional(),
        subpath: z.string().optional(),
        ttlMinutes: z.number().int().positive().max(120).optional(),
      })
      .passthrough(),
    async (args) => {
      try {
        verifySessionActive(context);
        const verifyOp = await (runSandboxedPreCommitVerification as any)(
          getSafetyContext(),
          {
            checks: args.verificationChecks,
            subpath: args.subpath,
          },
          context.user.id
        );

        const vData = verifyOp.status === "EXECUTED" ? verifyOp.data : verifyOp;
        if (!vData.passed) {
          return formatMcpToolError(
            new Error(`Pre-commit verification failed: ${vData.failureReason || "checks failed"}`)
          );
        }

        const lease = await issueVerificationLease({
          projectRoot: process.cwd(),
          verificationResult: vData,
          ttlMs: (args.ttlMinutes || 10) * 60 * 1000,
          userId: context.user.id,
          agentId: context.agent?.id,
          sessionId: context.session?.id,
        });

        return formatMcpToolSuccess(lease);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );

  // 9. lifeos_workspace_hook_status
  register(
    "lifeos_workspace_hook_status",
    "Inspect the installation and active status of the LifeOS git pre-commit hook",
    z.object({}).passthrough(),
    async () => {
      try {
        verifySessionActive(context);
        const status = await getPreCommitHookStatus(process.cwd());
        return formatMcpToolSuccess(status);
      } catch (error) {
        return formatMcpToolError(error);
      }
    }
  );
}

