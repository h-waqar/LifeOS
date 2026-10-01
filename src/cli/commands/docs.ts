/**
 * CLI Subcommand: lifeos docs
 *
 * Implements headless CLI commands for documentation search, document reading,
 * and planning graph inspection:
 * - lifeos docs search <query> [--source <source>] [--limit <n>] [--json]
 * - lifeos docs get <path> [--section <name>] [--json]
 * - lifeos docs planning [status|decisions|summary|roadmap] [--phase <phase>] [--json]
 */

import { UsageError } from "../errors";
import { docSearchService } from "@/server/docs/search-service";
import { planningInspector } from "@/server/docs/planning-inspector";
import type { CommandResult, ParsedArgs, CommandContext } from "../types";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

async function runDocsAction(parsed: ParsedArgs): Promise<CommandResult<unknown>> {
  const action = parsed.subcommands[1]?.toLowerCase() || "search";

  switch (action) {
    case "search": {
      const queryArgs = parsed.subcommands.slice(2).join(" ").trim();
      const flagQuery = typeof parsed.flags.q === "string" ? parsed.flags.q : undefined;
      const query = queryArgs || flagQuery;

      if (!query) {
        throw new UsageError("Search query is required. Usage: lifeos docs search <query> [--json]");
      }

      const source = typeof parsed.flags.source === "string" ? (parsed.flags.source as any) : undefined;
      const limitRaw = parsed.flags.limit;
      const limit = typeof limitRaw === "number" ? limitRaw : typeof limitRaw === "string" ? parseInt(limitRaw, 10) : undefined;

      const results = await docSearchService.searchDocs({
        q: query,
        source,
        limit,
      });

      return {
        data: {
          query,
          count: results.length,
          results,
        },
        tableData: {
          title: `Documentation Search Results: "${query}"`,
          columns: [
            { key: "score", label: "Score", width: 8 },
            { key: "source", label: "Source", width: 10 },
            { key: "title", label: "Title", width: 35 },
            { key: "path", label: "Path", width: 40 },
            { key: "snippet", label: "Snippet", width: 45 },
          ],
          rows: results as unknown as Record<string, unknown>[],
          emptyMessage: `No documentation matches found for "${query}".`,
        },
      };
    }

    case "get": {
      const docPath = parsed.subcommands[2];
      if (!docPath || !docPath.trim()) {
        throw new UsageError("Document path is required. Usage: lifeos docs get <path> [--section <name>] [--json]");
      }

      const section = typeof parsed.flags.section === "string" ? parsed.flags.section : undefined;
      const doc = await docSearchService.getDocContent(docPath.trim(), section);

      const humanSummary = [
        `================================================================================`,
        `Document: ${doc.title} (${doc.path})`,
        `Source:   ${doc.source}${doc.section ? ` | Section: ${doc.section}` : ""}`,
        `================================================================================\n`,
        doc.content,
      ].join("\n");

      return {
        data: doc,
        message: humanSummary,
      };
    }

    case "planning": {
      const subView = parsed.subcommands[2]?.toLowerCase() || "status";

      if (subView === "status") {
        const state = await planningInspector.getCurrentPlanningState();
        const humanSummary = [
          `================================================================================`,
          `LifeOS Planning State (Milestone: ${state.milestone})`,
          `================================================================================`,
          `Current Phase: Phase ${state.current_phase} - ${state.current_phase_name}`,
          `Status:        ${state.status}`,
          state.stopped_at ? `Stopped At:    ${state.stopped_at}` : "",
          state.recent_trend ? `Recent Trend:  ${state.recent_trend}` : "",
          state.next_steps && state.next_steps.length > 0
            ? `\nNext Steps:\n${state.next_steps.map((s) => `  - ${s}`).join("\n")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        return {
          data: state,
          message: humanSummary,
        };
      }

      if (subView === "decisions") {
        const decisions = await planningInspector.getMilestoneDecisions();
        return {
          data: {
            count: decisions.length,
            decisions,
          },
          tableData: {
            title: "Milestone Key Architectural Decisions",
            columns: [
              { key: "decision", label: "Decision", width: 35 },
              { key: "rationale", label: "Rationale", width: 55 },
              { key: "outcome", label: "Outcome", width: 25 },
            ],
            rows: decisions as unknown as Record<string, unknown>[],
            emptyMessage: "No architectural decisions recorded.",
          },
        };
      }

      if (subView === "summary") {
        const phaseArg =
          parsed.subcommands[3] ||
          (typeof parsed.flags.phase === "string" ? parsed.flags.phase : undefined);

        if (!phaseArg) {
          throw new UsageError(
            "Phase identifier is required for summary view. Usage: lifeos docs planning summary <phase> [--json]"
          );
        }

        const summary = await planningInspector.getPhaseSummary(phaseArg);
        return {
          data: summary,
          message: [
            `================================================================================`,
            `Phase Summary: ${summary.name} (${summary.path})`,
            `================================================================================\n`,
            summary.summary,
          ].join("\n"),
        };
      }

      if (subView === "roadmap") {
        const roadmap = await planningInspector.getPendingRoadmap();
        return {
          data: roadmap,
          tableData: {
            title: "Upcoming Project Roadmap",
            columns: [
              { key: "phase", label: "Phase", width: 8 },
              { key: "name", label: "Name", width: 45 },
              { key: "status", label: "Status", width: 12 },
              { key: "goal", label: "Goal", width: 55 },
            ],
            rows: roadmap.phases as unknown as Record<string, unknown>[],
            emptyMessage: "No roadmap phases found.",
          },
        };
      }

      throw new UsageError(
        `Unknown planning view: '${subView}'. Valid views are: status, decisions, summary, roadmap.`
      );
    }

    default:
      throw new UsageError(
        `Unknown docs action: '${action}'. Valid actions are: search, get, planning.`
      );
  }
}

export async function handleDocs(
  parsed: ParsedArgs,
  context?: CommandContext
): Promise<CommandResult<unknown>> {
  if (context?.isAgent) {
    const action = parsed.subcommands[1]?.toLowerCase() || "search";
    const op = `docs.${action}`;

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
      executor: () => runDocsAction(parsed),
    });

    if (result.status === "CHALLENGE_REQUIRED") {
      return {
        data: result,
        message: result.message,
      };
    }

    return result.data as CommandResult<unknown>;
  }

  return runDocsAction(parsed);
}

