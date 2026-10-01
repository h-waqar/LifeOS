/**
 * CLI Goal Commands: list, get, create, update, delete
 *
 * Strictly delegates to canonical goal service (@/server/goals/service)
 * and canonical Zod validation schemas (createGoalSchema, updateGoalSchema).
 */

import {
  listGoals,
  getGoal,
  createGoal,
  updateGoal,
  deleteGoal,
  createGoalSchema,
  updateGoalSchema,
} from "@/server/goals/service";
import { assertNoCallerSpoofing } from "../auth";
import { UsageError, NotFoundError } from "../errors";
import type { CommandResult, ParsedArgs, CommandContext } from "../types";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

async function runGoalAction(
  action: string,
  parsed: ParsedArgs,
  userId: string
): Promise<CommandResult<unknown>> {
  switch (action) {
    case "list": {
      const filters = {
        status: (parsed.flags.status as any) || undefined,
        horizon: (parsed.flags.horizon as any) || undefined,
        area: (parsed.flags.area as any) || undefined,
      };

      const items = await listGoals(userId, filters);

      const rows = items.map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        horizon: g.horizon,
        progress: `${Math.round(g.progress ?? 0)}%`,
        targetDate: g.targetDate ? g.targetDate.slice(0, 10) : "-",
      }));

      return {
        data: items,
        tableData: {
          columns: [
            { key: "id", label: "ID", width: 14 },
            { key: "title", label: "Goal Title", width: 32 },
            { key: "status", label: "Status", width: 12 },
            { key: "horizon", label: "Horizon", width: 14 },
            { key: "progress", label: "Progress", width: 10 },
            { key: "targetDate", label: "Target Date", width: 12 },
          ],
          rows,
          emptyMessage: "(no goals found)",
          title: "Goals",
        },
      };
    }

    case "get": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Goal ID is required: 'lifeos goals get <id>'");
      }

      const goal = await getGoal(userId, id);
      if (!goal) {
        throw new NotFoundError(`Goal not found: ${id}`);
      }

      return {
        data: goal,
        tableData: {
          columns: [
            { key: "field", label: "Field", width: 16 },
            { key: "value", label: "Value", width: 44 },
          ],
          rows: [
            { field: "ID", value: goal.id },
            { field: "Title", value: goal.title },
            { field: "Status", value: goal.status },
            { field: "Horizon", value: goal.horizon },
            { field: "Area", value: goal.area || "-" },
            { field: "Progress", value: `${Math.round(goal.progress ?? 0)}%` },
            { field: "Target Date", value: goal.targetDate || "-" },
            { field: "Description", value: goal.description || "-" },
          ],
          title: `Goal Details: ${goal.title}`,
        },
      };
    }

    case "create": {
      const rawTargetDate = parsed.flags.targetDate || parsed.flags["target-date"];
      let targetDate: string | undefined = undefined;
      if (rawTargetDate && typeof rawTargetDate === "string") {
        targetDate = rawTargetDate.includes("T") ? rawTargetDate : `${rawTargetDate}T23:59:59.000Z`;
      }

      const rawInput: Record<string, unknown> = {
        title: parsed.flags.title,
        description: parsed.flags.description || undefined,
        status: parsed.flags.status || undefined,
        horizon: parsed.flags.horizon || undefined,
        area: parsed.flags.area || undefined,
        targetDate,
        metricType: parsed.flags.metricType || parsed.flags["metric-type"] || undefined,
        targetValue: parsed.flags.targetValue !== undefined || parsed.flags["target-value"] !== undefined
          ? Number(parsed.flags.targetValue ?? parsed.flags["target-value"])
          : undefined,
      };

      const validated = createGoalSchema.parse(rawInput);
      const created = await createGoal(userId, validated);

      return {
        data: created,
        message: `Goal created successfully: [${created.id}] ${created.title}`,
      };
    }

    case "update": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Goal ID is required: 'lifeos goals update <id>'");
      }

      const rawTargetDate = parsed.flags.targetDate || parsed.flags["target-date"];
      let targetDate: string | undefined = undefined;
      if (rawTargetDate && typeof rawTargetDate === "string") {
        targetDate = rawTargetDate.includes("T") ? rawTargetDate : `${rawTargetDate}T23:59:59.000Z`;
      }

      const rawInput: Record<string, unknown> = {};
      if (parsed.flags.title !== undefined) rawInput.title = parsed.flags.title;
      if (parsed.flags.description !== undefined) rawInput.description = parsed.flags.description;
      if (parsed.flags.status !== undefined) rawInput.status = parsed.flags.status;
      if (parsed.flags.horizon !== undefined) rawInput.horizon = parsed.flags.horizon;
      if (parsed.flags.area !== undefined) rawInput.area = parsed.flags.area;
      if (targetDate !== undefined) rawInput.targetDate = targetDate;
      if (parsed.flags.currentValue !== undefined || parsed.flags["current-value"] !== undefined) {
        rawInput.currentValue = Number(parsed.flags.currentValue ?? parsed.flags["current-value"]);
      }

      const validated = updateGoalSchema.parse(rawInput);
      const updated = await updateGoal(userId, id, validated);

      return {
        data: updated,
        message: `Goal updated successfully: [${updated.id}] ${updated.title}`,
      };
    }

    case "delete": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Goal ID is required: 'lifeos goals delete <id>'");
      }

      await deleteGoal(userId, id);
      return {
        data: { id, deleted: true },
        message: `Goal ${id} deleted successfully.`,
      };
    }

    default:
      throw new UsageError(
        `Unknown goal action: '${action}'. Valid actions: list, get, create, update, delete.`
      );
  }
}

export async function handleGoals(
  parsed: ParsedArgs,
  context?: CommandContext
): Promise<CommandResult<unknown>> {
  assertNoCallerSpoofing(parsed.flags);
  if (!context) {
    throw new Error("Command requires an authenticated context.");
  }

  const userId = context.user.id;
  const action = parsed.subcommands[1]?.toLowerCase() || "list";

  if (context.isAgent) {
    const op = `goals.${action}`;
    const challengeId = (parsed.flags.challengeId || parsed.flags.challenge) as string | undefined;

    const result = await executeAgentOperation({
      context: {
        isAgent: true,
        agent: context.agent,
        user: context.user,
        sessionId: context.session?.id,
      },
      toolName: op,
      arguments: { ...parsed.flags, subcommands: parsed.subcommands } as Record<string, unknown>,
      challengeId,
      targetUserId: userId,
      executor: () => runGoalAction(action, parsed, userId),
    });

    if (result.status === "CHALLENGE_REQUIRED") {
      return {
        data: result,
        message: result.message,
      };
    }

    return result.data as CommandResult<unknown>;
  }

  return runGoalAction(action, parsed, userId);
}

