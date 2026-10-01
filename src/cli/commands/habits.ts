/**
 * CLI Habit Commands: list, get, create, update, delete, log, toggle
 *
 * Strictly delegates to canonical habit service (@/server/habits/service)
 * and canonical Zod validation schemas (createHabitSchema, updateHabitSchema, logHabitEntrySchema).
 */

import {
  listHabits,
  getHabit,
  createHabit,
  updateHabit,
  deleteHabit,
  logHabitEntry,
  toggleHabitEntry,
  createHabitSchema,
  updateHabitSchema,
  logHabitEntrySchema,
} from "@/server/habits/service";
import { assertNoCallerSpoofing } from "../auth";
import { UsageError, NotFoundError } from "../errors";
import type { CommandResult, ParsedArgs, CommandContext } from "../types";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

async function runHabitAction(
  action: string,
  parsed: ParsedArgs,
  userId: string
): Promise<CommandResult<unknown>> {
  switch (action) {
    case "list": {
      const filters = {
        status: (parsed.flags.status as any) || undefined,
        frequency: (parsed.flags.frequency as any) || undefined,
      };

      const items = await listHabits(userId, filters);

      const rows = items.map((h) => ({
        id: h.id,
        title: h.title,
        frequency: h.frequency,
        streak: `${h.currentStreak} days`,
        status: h.status,
      }));

      return {
        data: items,
        tableData: {
          columns: [
            { key: "id", label: "ID", width: 14 },
            { key: "title", label: "Habit Title", width: 32 },
            { key: "frequency", label: "Frequency", width: 14 },
            { key: "streak", label: "Streak", width: 12 },
            { key: "status", label: "Status", width: 10 },
          ],
          rows,
          emptyMessage: "(no habits found)",
          title: "Habits",
        },
      };
    }

    case "get": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Habit ID is required: 'lifeos habits get <id>'");
      }

      const habit = await getHabit(userId, id);
      if (!habit) {
        throw new NotFoundError(`Habit not found: ${id}`);
      }

      return {
        data: habit,
        tableData: {
          columns: [
            { key: "field", label: "Field", width: 18 },
            { key: "value", label: "Value", width: 44 },
          ],
          rows: [
            { field: "ID", value: habit.id },
            { field: "Title", value: habit.title },
            { field: "Frequency", value: habit.frequency },
            { field: "Status", value: habit.status },
            { field: "Current Streak", value: `${habit.currentStreak} days` },
            { field: "Longest Streak", value: `${habit.longestStreak} days` },
            { field: "Target Value", value: `${habit.targetValue} ${habit.unit || ""}` },
            { field: "Description", value: habit.description || "-" },
          ],
          title: `Habit Details: ${habit.title}`,
        },
      };
    }

    case "create": {
      const title = (parsed.flags.title as string) || (parsed.flags.name as string);
      const rawInput: Record<string, unknown> = {
        title,
        description: parsed.flags.description || undefined,
        frequency: parsed.flags.frequency || undefined,
        targetValue: parsed.flags.targetValue !== undefined || parsed.flags["target-value"] !== undefined
          ? Number(parsed.flags.targetValue ?? parsed.flags["target-value"])
          : undefined,
        unit: parsed.flags.unit || undefined,
        timeOfDay: parsed.flags.timeOfDay || parsed.flags["time-of-day"] || undefined,
        status: parsed.flags.status || undefined,
      };

      const validated = createHabitSchema.parse(rawInput);
      const created = await createHabit(userId, validated);

      return {
        data: created,
        message: `Habit created successfully: [${created.id}] ${created.title}`,
      };
    }

    case "update": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Habit ID is required: 'lifeos habits update <id>'");
      }

      const rawInput: Record<string, unknown> = {};
      if (parsed.flags.title !== undefined || parsed.flags.name !== undefined) {
        rawInput.title = parsed.flags.title || parsed.flags.name;
      }
      if (parsed.flags.description !== undefined) rawInput.description = parsed.flags.description;
      if (parsed.flags.frequency !== undefined) rawInput.frequency = parsed.flags.frequency;
      if (parsed.flags.status !== undefined) rawInput.status = parsed.flags.status;
      if (parsed.flags.targetValue !== undefined || parsed.flags["target-value"] !== undefined) {
        rawInput.targetValue = Number(parsed.flags.targetValue ?? parsed.flags["target-value"]);
      }
      if (parsed.flags.unit !== undefined) rawInput.unit = parsed.flags.unit;
      if (parsed.flags.timeOfDay !== undefined || parsed.flags["time-of-day"] !== undefined) {
        rawInput.timeOfDay = parsed.flags.timeOfDay || parsed.flags["time-of-day"];
      }

      const validated = updateHabitSchema.parse(rawInput);
      const updated = await updateHabit(userId, id, validated);

      return {
        data: updated,
        message: `Habit updated successfully: [${updated.id}] ${updated.title}`,
      };
    }

    case "delete": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Habit ID is required: 'lifeos habits delete <id>'");
      }

      await deleteHabit(userId, id);
      return {
        data: { id, deleted: true },
        message: `Habit ${id} deleted successfully.`,
      };
    }

    case "log": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Habit ID is required: 'lifeos habits log <id>'");
      }

      const date = (parsed.flags.date as string) || new Date().toISOString().slice(0, 10);
      const rawInput: Record<string, unknown> = {
        date,
        value: parsed.flags.value !== undefined ? Number(parsed.flags.value) : 1,
        notes: parsed.flags.notes || undefined,
      };

      const validated = logHabitEntrySchema.parse(rawInput);
      const result = await logHabitEntry(userId, id, validated);

      return {
        data: result,
        message: `Habit entry logged for ${date}. Current streak: ${result.stats.currentStreak} days.`,
      };
    }

    case "toggle": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Habit ID is required: 'lifeos habits toggle <id>'");
      }

      const date = (parsed.flags.date as string) || new Date().toISOString().slice(0, 10);
      const result = await toggleHabitEntry(userId, id, date);

      return {
        data: result,
        message: `Habit ${result.completed ? "completed" : "uncompleted"} for ${date}. Current streak: ${result.stats.currentStreak} days.`,
      };
    }

    default:
      throw new UsageError(
        `Unknown habit action: '${action}'. Valid actions: list, get, create, update, delete, log, toggle.`
      );
  }
}

export async function handleHabits(
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
    const op = `habits.${action}`;
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
      executor: () => runHabitAction(action, parsed, userId),
    });

    if (result.status === "CHALLENGE_REQUIRED") {
      return {
        data: result,
        message: result.message,
      };
    }

    return result.data as CommandResult<unknown>;
  }

  return runHabitAction(action, parsed, userId);
}

