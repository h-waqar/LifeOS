/**
 * CLI Subcommand: lifeos skills
 *
 * Implements headless CLI commands for procedural skills discovery and retrieval:
 * - lifeos skills list [--tag <tag>] [--query <q>] [--json]
 * - lifeos skills get <name> [--json]
 * - lifeos skills match <intent> [--json]
 */

import { UsageError } from "../errors";
import { skillsRegistry } from "@/server/skills/registry";
import type { CommandResult, ParsedArgs, CommandContext } from "../types";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

async function runSkillsAction(parsed: ParsedArgs): Promise<CommandResult<unknown>> {
  const action = parsed.subcommands[1]?.toLowerCase() || "list";

  switch (action) {
    case "list": {
      const tag = typeof parsed.flags.tag === "string" ? parsed.flags.tag : undefined;
      const query = typeof parsed.flags.query === "string" ? parsed.flags.query : undefined;

      const skills = await skillsRegistry.listSkills({ tag, query });

      return {
        data: {
          count: skills.length,
          skills,
        },
        tableData: {
          title: "Available Procedural Skills",
          columns: [
            { key: "name", label: "Skill Name", width: 20 },
            { key: "version", label: "Version", width: 10 },
            { key: "description", label: "Description", width: 50 },
            { key: "tags", label: "Tags", width: 25 },
          ],
          rows: skills.map((s) => ({
            ...s,
            tags: s.tags.join(", "),
          })) as unknown as Record<string, unknown>[],
          emptyMessage: "No procedural skills match the specified criteria.",
        },
      };
    }

    case "get": {
      const name = parsed.subcommands[2];
      if (!name || !name.trim()) {
        throw new UsageError("Skill name is required. Usage: lifeos skills get <name> [--json]");
      }

      const skill = await skillsRegistry.getSkill(name.trim());

      const humanSummary = [
        `================================================================================`,
        `Skill: ${skill.name} (v${skill.version})`,
        `================================================================================`,
        `Description: ${skill.description}`,
        `Tags:        ${skill.tags.join(", ") || "none"}`,
        `Allowed Ops: ${skill.allowed_operations.join(", ")}`,
        `Context:     ${skill.required_context.join(", ") || "none"}`,
        `\nTriggers:`,
        ...skill.trigger_when.map((t) => `  - ${t}`),
        `\nVerification Requirements:`,
        ...skill.verification_requirements.map((v) => `  - ${v}`),
        `\n--------------------------------------------------------------------------------`,
        `Instructions:`,
        `--------------------------------------------------------------------------------\n`,
        skill.body,
      ].join("\n");

      return {
        data: skill,
        message: humanSummary,
      };
    }

    case "match": {
      // Intent query can be provided as subcommands or flag
      const queryArgs = parsed.subcommands.slice(2).join(" ").trim();
      const flagQuery = typeof parsed.flags.intent === "string" ? parsed.flags.intent : undefined;
      const query = queryArgs || flagQuery;

      if (!query) {
        throw new UsageError("Intent query is required. Usage: lifeos skills match <query> [--json]");
      }

      const matches = await skillsRegistry.matchSkillsForIntent(query);

      return {
        data: {
          query,
          count: matches.length,
          matches,
        },
        tableData: {
          title: `Matching Skills for: "${query}"`,
          columns: [
            { key: "score", label: "Score", width: 8 },
            { key: "name", label: "Skill Name", width: 20 },
            { key: "description", label: "Description", width: 45 },
            { key: "triggers", label: "Matched Triggers", width: 35 },
          ],
          rows: matches.map((m) => ({
            score: m.score,
            name: m.skill.name,
            description: m.skill.description,
            triggers: m.matchedTriggers.slice(0, 2).join("; "),
          })) as unknown as Record<string, unknown>[],
          emptyMessage: `No procedural skills found matching intent: "${query}".`,
        },
      };
    }

    default:
      throw new UsageError(
        `Unknown skills action: '${action}'. Valid actions are: list, get, match.`
      );
  }
}

export async function handleSkills(
  parsed: ParsedArgs,
  context?: CommandContext
): Promise<CommandResult<unknown>> {
  if (context?.isAgent) {
    const action = parsed.subcommands[1]?.toLowerCase() || "list";
    const op = `skills.${action}`;

    const result = await executeAgentOperation({
      context: {
        isAgent: true,
        agent: context.agent,
        user: context.user,
        sessionId: context.session?.id,
      },
      toolName: op,
      arguments: { ...parsed.flags, subcommands: parsed.subcommands } as Record<string, unknown>,
      targetUserId: context.user.id,
      executor: () => runSkillsAction(parsed),
    });

    if (result.status === "CHALLENGE_REQUIRED") {
      return {
        data: result,
        message: result.message,
      };
    }

    return result.data as CommandResult<unknown>;
  }

  return runSkillsAction(parsed);
}

