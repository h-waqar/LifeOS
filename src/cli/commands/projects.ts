/**
 * CLI Project Commands: list, get, create, update, delete
 *
 * Strictly delegates to canonical project service (@/server/projects/service)
 * and canonical Zod validation schemas (createProjectSchema, updateProjectSchema).
 */

import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  createProjectSchema,
  updateProjectSchema,
} from "@/server/projects/service";
import { assertNoCallerSpoofing } from "../auth";
import { UsageError, NotFoundError } from "../errors";
import type { CommandResult, ParsedArgs, CommandContext } from "../types";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

async function runProjectAction(
  action: string,
  parsed: ParsedArgs,
  userId: string
): Promise<CommandResult<unknown>> {
  switch (action) {
    case "list": {
      const filters = {
        status: (parsed.flags.status as any) || undefined,
        area: (parsed.flags.area as any) || undefined,
      };

      const items = await listProjects(userId, filters);

      const rows = items.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        area: p.area || "-",
        deadline: p.deadline ? p.deadline.slice(0, 10) : "-",
      }));

      return {
        data: items,
        tableData: {
          columns: [
            { key: "id", label: "ID", width: 14 },
            { key: "name", label: "Project Name", width: 34 },
            { key: "status", label: "Status", width: 12 },
            { key: "area", label: "Area", width: 14 },
            { key: "deadline", label: "Deadline", width: 12 },
          ],
          rows,
          emptyMessage: "(no projects found)",
          title: "Projects",
        },
      };
    }

    case "get": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Project ID is required: 'lifeos projects get <id>'");
      }

      const project = await getProject(userId, id);
      if (!project) {
        throw new NotFoundError(`Project not found: ${id}`);
      }

      return {
        data: project,
        tableData: {
          columns: [
            { key: "field", label: "Field", width: 16 },
            { key: "value", label: "Value", width: 44 },
          ],
          rows: [
            { field: "ID", value: project.id },
            { field: "Name", value: project.name },
            { field: "Status", value: project.status },
            { field: "Area", value: project.area || "-" },
            { field: "Deadline", value: project.deadline || "-" },
            { field: "Description", value: project.description || "-" },
          ],
          title: `Project Details: ${project.name}`,
        },
      };
    }

    case "create": {
      const rawDeadline = parsed.flags.deadline || parsed.flags["target-date"] || parsed.flags.targetDate;
      let deadline: string | undefined = undefined;
      if (rawDeadline && typeof rawDeadline === "string") {
        deadline = rawDeadline.includes("T") ? rawDeadline : `${rawDeadline}T23:59:59.000Z`;
      }

      const rawInput: Record<string, unknown> = {
        name: parsed.flags.name,
        description: parsed.flags.description || undefined,
        status: parsed.flags.status || undefined,
        area: parsed.flags.area || undefined,
        deadline,
      };

      const validated = createProjectSchema.parse(rawInput);
      const created = await createProject(userId, validated);

      return {
        data: created,
        message: `Project created successfully: [${created.id}] ${created.name}`,
      };
    }

    case "update": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Project ID is required: 'lifeos projects update <id>'");
      }

      const rawDeadline = parsed.flags.deadline || parsed.flags["target-date"] || parsed.flags.targetDate;
      let deadline: string | undefined = undefined;
      if (rawDeadline && typeof rawDeadline === "string") {
        deadline = rawDeadline.includes("T") ? rawDeadline : `${rawDeadline}T23:59:59.000Z`;
      }

      const rawInput: Record<string, unknown> = {};
      if (parsed.flags.name !== undefined) rawInput.name = parsed.flags.name;
      if (parsed.flags.description !== undefined) rawInput.description = parsed.flags.description;
      if (parsed.flags.status !== undefined) rawInput.status = parsed.flags.status;
      if (parsed.flags.area !== undefined) rawInput.area = parsed.flags.area;
      if (deadline !== undefined) rawInput.deadline = deadline;

      const validated = updateProjectSchema.parse(rawInput);
      const updated = await updateProject(userId, id, validated);

      return {
        data: updated,
        message: `Project updated successfully: [${updated.id}] ${updated.name}`,
      };
    }

    case "delete": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Project ID is required: 'lifeos projects delete <id>'");
      }

      await deleteProject(userId, id);
      return {
        data: { id, deleted: true },
        message: `Project ${id} deleted successfully.`,
      };
    }

    default:
      throw new UsageError(
        `Unknown project action: '${action}'. Valid actions: list, get, create, update, delete.`
      );
  }
}

export async function handleProjects(
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
    const op = `projects.${action}`;
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
      executor: () => runProjectAction(action, parsed, userId),
    });

    if (result.status === "CHALLENGE_REQUIRED") {
      return {
        data: result,
        message: result.message,
      };
    }

    return result.data as CommandResult<unknown>;
  }

  return runProjectAction(action, parsed, userId);
}

