/**
 * CLI Note Commands: list, get, create, update, delete
 *
 * Strictly delegates to canonical note service (@/server/notes/service)
 * and canonical Zod validation schemas (createNoteSchema, updateNoteSchema).
 */

import {
  listNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  createNoteSchema,
  updateNoteSchema,
} from "@/server/notes/service";
import { assertNoCallerSpoofing } from "../auth";
import { UsageError } from "../errors";
import type { CommandResult, ParsedArgs, CommandContext } from "../types";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

async function runNoteAction(
  action: string,
  parsed: ParsedArgs,
  userId: string
): Promise<CommandResult<unknown>> {
  switch (action) {
    case "list": {
      const filters: Record<string, unknown> = {};
      if (parsed.flags.type || parsed.flags.noteType) {
        filters.noteType = parsed.flags.type || parsed.flags.noteType;
      }
      if (parsed.flags.area) {
        filters.area = parsed.flags.area;
      }
      if (parsed.flags.tag) {
        filters.tag = parsed.flags.tag;
      }

      const res = await listNotes(userId, filters);
      const items = res.notes;

      const rows = items.map((n) => ({
        id: n.id,
        title: n.title,
        noteType: n.noteType,
        area: n.area || "-",
        updatedAt: n.updatedAt ? n.updatedAt.slice(0, 10) : "-",
      }));

      return {
        data: items,
        tableData: {
          columns: [
            { key: "id", label: "ID", width: 14 },
            { key: "title", label: "Title", width: 34 },
            { key: "noteType", label: "Type", width: 12 },
            { key: "area", label: "Area", width: 14 },
            { key: "updatedAt", label: "Updated", width: 12 },
          ],
          rows,
          emptyMessage: "(no notes found)",
          title: `Notes (Total: ${res.total})`,
        },
      };
    }

    case "get": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Note ID is required: 'lifeos notes get <id>'");
      }

      const note = await getNoteById(userId, id);
      return {
        data: note,
        tableData: {
          columns: [
            { key: "field", label: "Field", width: 16 },
            { key: "value", label: "Value", width: 44 },
          ],
          rows: [
            { field: "ID", value: note.id },
            { field: "Title", value: note.title },
            { field: "Type", value: note.noteType },
            { field: "Area", value: note.area || "-" },
            { field: "Tags", value: note.tags?.join(", ") || "-" },
            { field: "Pinned", value: note.isPinned ? "yes" : "no" },
            { field: "Content", value: note.content || "-" },
          ],
          title: `Note: ${note.title}`,
        },
      };
    }

    case "create": {
      let tags: string[] = [];
      if (parsed.flags.tags) {
        tags = Array.isArray(parsed.flags.tags)
          ? (parsed.flags.tags as string[])
          : String(parsed.flags.tags).split(",").map((t) => t.trim()).filter(Boolean);
      } else if (parsed.flags.tag) {
        tags = [String(parsed.flags.tag).trim()];
      }

      const rawInput: Record<string, unknown> = {
        title: parsed.flags.title,
        content: parsed.flags.content || "",
        noteType: parsed.flags.type || parsed.flags.noteType || undefined,
        area: parsed.flags.area || undefined,
        tags,
      };

      const validated = createNoteSchema.parse(rawInput);
      const created = await createNote(userId, validated);

      return {
        data: created,
        message: `Note created successfully: [${created.id}] ${created.title}`,
      };
    }

    case "update": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Note ID is required: 'lifeos notes update <id>'");
      }

      const rawInput: Record<string, unknown> = {};
      if (parsed.flags.title !== undefined) rawInput.title = parsed.flags.title;
      if (parsed.flags.content !== undefined) rawInput.content = parsed.flags.content;
      if (parsed.flags.type !== undefined || parsed.flags.noteType !== undefined) {
        rawInput.noteType = parsed.flags.type || parsed.flags.noteType;
      }
      if (parsed.flags.area !== undefined) rawInput.area = parsed.flags.area;
      if (parsed.flags.tags !== undefined) {
        rawInput.tags = Array.isArray(parsed.flags.tags)
          ? parsed.flags.tags
          : String(parsed.flags.tags).split(",").map((t) => t.trim()).filter(Boolean);
      }

      const validated = updateNoteSchema.parse(rawInput);
      const updated = await updateNote(userId, id, validated);

      return {
        data: updated,
        message: `Note updated successfully: [${updated.id}] ${updated.title}`,
      };
    }

    case "delete": {
      const id = parsed.subcommands[2];
      if (!id) {
        throw new UsageError("Note ID is required: 'lifeos notes delete <id>'");
      }

      await deleteNote(userId, id);
      return {
        data: { id, deleted: true },
        message: `Note ${id} deleted successfully.`,
      };
    }

    default:
      throw new UsageError(
        `Unknown note action: '${action}'. Valid actions: list, get, create, update, delete.`
      );
  }
}

export async function handleNotes(
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
    const op = `notes.${action}`;
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
      executor: () => runNoteAction(action, parsed, userId),
    });

    if (result.status === "CHALLENGE_REQUIRED") {
      return {
        data: result,
        message: result.message,
      };
    }

    return result.data as CommandResult<unknown>;
  }

  return runNoteAction(action, parsed, userId);
}

