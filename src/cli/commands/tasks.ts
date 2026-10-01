/**
 * CLI Task Commands: list, get, create, update, delete
 *
 * Strictly delegates to canonical task service (@/server/tasks/service)
 * and canonical Zod validation schemas (createTaskSchema, updateTaskSchema).
 */

import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  createTaskSchema,
  updateTaskSchema,
} from "@/server/tasks/service";
import { assertNoCallerSpoofing } from "../auth";
import { UsageError, NotFoundError } from "../errors";
import type { CommandResult, ParsedArgs, CommandContext } from "../types";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

async function runTaskAction(
  action: string,
  parsed: ParsedArgs,
  userId: string
): Promise<CommandResult<unknown>> {
  switch (action) {
    case "list": {
      const filters = {
        status: (parsed.flags.status as any) || undefined,
        projectId: (parsed.flags.projectId as string) || (parsed.flags.project as string) || undefined,
        priority: (parsed.flags.priority as any) || undefined,
        energyLevel: (parsed.flags.energyLevel as any) || (parsed.flags.energy as any) || undefined,
        scheduledDate: (parsed.flags.scheduledDate as string) || (parsed.flags.date as string) || undefined,
        overdue: parsed.flags.overdue ? true : undefined,
      };

      const items = await listTasks(userId, filters);

      const rows = items.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        scheduledDate: t.scheduledDate || "-",
      }));

      return {
        data: items,
        tableData: {
          columns: [
            { key: "id", label: "ID", width: 14 },
            { key: "title", label: "Title", width: 34 },
            { key: "status", label: "Status", width: 12 },
            { key: "priority", label: "Priority", width: 10 },
            { key: "scheduledDate", label: "Scheduled", width: 12 },
          ],
          rows,
          emptyMessage: "(no tasks found)",
          title: "Tasks",
        },
      };
    }

    case "get": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Task ID is required: 'lifeos tasks get <id>'");
      }

      const task = await getTask(userId, id);
      if (!task) {
        throw new NotFoundError(`Task not found: ${id}`);
      }
      return {
        data: task,
        tableData: {
          columns: [
            { key: "field", label: "Field", width: 16 },
            { key: "value", label: "Value", width: 44 },
          ],
          rows: [
            { field: "ID", value: task.id },
            { field: "Title", value: task.title },
            { field: "Status", value: task.status },
            { field: "Priority", value: task.priority },
            { field: "Energy Level", value: task.energyLevel || "-" },
            { field: "Scheduled Date", value: task.scheduledDate || "-" },
            { field: "Project ID", value: task.projectId || "-" },
            { field: "Description", value: task.description || "-" },
          ],
          title: `Task Details: ${task.title}`,
        },
      };
    }

    case "create": {
      const rawInput: Record<string, unknown> = {
        title: parsed.flags.title,
        description: parsed.flags.description || undefined,
        status: parsed.flags.status || undefined,
        priority: parsed.flags.priority || undefined,
        energyLevel: parsed.flags.energyLevel || parsed.flags.energy || undefined,
        scheduledDate: parsed.flags.scheduledDate || parsed.flags.date || undefined,
        projectId: parsed.flags.projectId || parsed.flags.project || undefined,
        milestoneId: parsed.flags.milestoneId || undefined,
      };

      if (parsed.flags.estimatedDuration !== undefined) {
        rawInput.estimatedDuration = Number(parsed.flags.estimatedDuration);
      }

      const validated = createTaskSchema.parse(rawInput);
      const created = await createTask(userId, validated);

      return {
        data: created,
        message: `Task created successfully: [${created.id}] ${created.title}`,
      };
    }

    case "update": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Task ID is required: 'lifeos tasks update <id>'");
      }

      const rawInput: Record<string, unknown> = {};
      if (parsed.flags.title !== undefined) rawInput.title = parsed.flags.title;
      if (parsed.flags.description !== undefined) rawInput.description = parsed.flags.description;
      if (parsed.flags.status !== undefined) rawInput.status = parsed.flags.status;
      if (parsed.flags.priority !== undefined) rawInput.priority = parsed.flags.priority;
      if (parsed.flags.energyLevel !== undefined || parsed.flags.energy !== undefined) {
        rawInput.energyLevel = parsed.flags.energyLevel || parsed.flags.energy;
      }
      if (parsed.flags.scheduledDate !== undefined || parsed.flags.date !== undefined) {
        rawInput.scheduledDate = parsed.flags.scheduledDate || parsed.flags.date;
      }
      if (parsed.flags.projectId !== undefined || parsed.flags.project !== undefined) {
        rawInput.projectId = parsed.flags.projectId || parsed.flags.project;
      }

      const validated = updateTaskSchema.parse(rawInput);
      const updated = await updateTask(userId, id, validated);

      return {
        data: updated,
        message: `Task updated successfully: [${updated.id}] ${updated.title}`,
      };
    }

    case "delete": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Task ID is required: 'lifeos tasks delete <id>'");
      }

      await deleteTask(userId, id);
      return {
        data: { id, deleted: true },
        message: `Task ${id} deleted successfully.`,
      };
    }

    default:
      throw new UsageError(
        `Unknown task action: '${action}'. Valid actions: list, get, create, update, delete.`
      );
  }
}

export async function handleTasks(
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
    const op = `tasks.${action}`;
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
      executor: () => runTaskAction(action, parsed, userId),
    });

    if (result.status === "CHALLENGE_REQUIRED") {
      return {
        data: result,
        message: result.message,
      };
    }

    return result.data as CommandResult<unknown>;
  }

  return runTaskAction(action, parsed, userId);
}
