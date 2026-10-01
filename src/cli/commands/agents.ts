/**
 * CLI Agent Management Commands
 *
 * Provides administrative controls for agent tokens, human approval challenges,
 * and forensic audit logs:
 * - lifeos agent token create --name <name> [--capabilities READ,WRITE] [--provider <p>] [--expiresInDays <n>]
 * - lifeos agent token list
 * - lifeos agent token revoke <id>
 * - lifeos agent challenge list
 * - lifeos agent challenge approve <id>
 * - lifeos agent challenge reject <id> [--reason <reason>]
 * - lifeos agent audit [--limit <limit>]
 */

import { UsageError, NotFoundError } from "../errors";
import { assertNoCallerSpoofing } from "../auth";
import type { CommandResult, ParsedArgs, CommandContext } from "../types";
import {
  createAgentToken,
  listAgentTokens,
  revokeAgentToken,
} from "@/server/agents/token-service";
import {
  listChallenges,
  approveChallenge,
  rejectChallenge,
} from "@/server/agents/challenges/challenge-service";
import { queryAgentAuditLogs } from "@/server/agents/audit/attribution-logger";
import type { AgentCapability } from "@/server/agents/permissions/types";

export async function handleAgents(
  parsed: ParsedArgs,
  context?: CommandContext
): Promise<CommandResult<unknown>> {
  assertNoCallerSpoofing(parsed.flags);

  if (!context) {
    throw new Error("Command requires an authenticated context.");
  }

  if (context.isAgent) {
    throw new UsageError(
      "Security violation: Autonomous agents cannot manage agent tokens, challenges, or audit logs."
    );
  }

  const userId = context.user.id;
  const target = parsed.subcommands[1]?.toLowerCase();

  if (!target) {
    throw new UsageError(
      "Agent target required: 'token', 'challenge', or 'audit'. Run 'lifeos agent --help' for usage."
    );
  }

  // --- TOKEN SUBCOMMANDS ---
  if (target === "token") {
    const action = parsed.subcommands[2]?.toLowerCase() || "list";

    switch (action) {
      case "create": {
        const name = parsed.flags.name as string | undefined;
        if (!name || !name.trim()) {
          throw new UsageError("Agent name is required: '--name <name>'");
        }

        let capabilities: AgentCapability[] | undefined;
        if (parsed.flags.capabilities) {
          capabilities = String(parsed.flags.capabilities)
            .split(",")
            .map((c) => c.trim().toUpperCase()) as AgentCapability[];
        }

        const provider = (parsed.flags.provider as string) || "custom";
        const expiresInDays = parsed.flags.expiresInDays
          ? Number(parsed.flags.expiresInDays)
          : undefined;

        const result = await createAgentToken(userId, {
          name,
          provider,
          capabilities,
          expiresInDays,
        });

        return {
          data: result,
          message: `Agent token created successfully for '${result.agent.name}'.\nRaw Bearer Token (STORE SECURELY, NOT RECOVERABLE):\n  ${result.token}`,
        };
      }

      case "list": {
        const tokens = await listAgentTokens(userId);

        const rows = tokens.map((t) => ({
          id: t.id,
          name: t.name,
          prefix: t.tokenPrefix,
          provider: t.provider,
          status: t.status,
          expiresAt: t.expiresAt ? t.expiresAt.toISOString().slice(0, 10) : "never",
        }));

        return {
          data: tokens,
          tableData: {
            columns: [
              { key: "id", label: "ID", width: 14 },
              { key: "name", label: "Name", width: 24 },
              { key: "prefix", label: "Prefix", width: 16 },
              { key: "provider", label: "Provider", width: 14 },
              { key: "status", label: "Status", width: 10 },
              { key: "expiresAt", label: "Expires", width: 12 },
            ],
            rows,
            emptyMessage: "(no agent tokens found)",
            title: "Agent Tokens",
          },
        };
      }

      case "revoke": {
        const id = parsed.subcommands[3] || (parsed.flags.id as string);
        if (!id) {
          throw new UsageError("Agent token ID is required: 'lifeos agent token revoke <id>'");
        }

        await revokeAgentToken(userId, id);
        return {
          data: { id, revoked: true },
          message: `Agent token '${id}' has been revoked.`,
        };
      }

      default:
        throw new UsageError(
          `Unknown agent token action: '${action}'. Valid actions: create, list, revoke.`
        );
    }
  }

  // --- CHALLENGE SUBCOMMANDS ---
  if (target === "challenge") {
    const action = parsed.subcommands[2]?.toLowerCase() || "list";

    switch (action) {
      case "list": {
        const challenges = await listChallenges(userId);

        const rows = challenges.map((c) => ({
          id: c.id,
          operation: c.operation,
          capability: c.capability,
          status: c.status,
          expiresAt: c.expiresAt.toISOString().slice(11, 19),
        }));

        return {
          data: challenges,
          tableData: {
            columns: [
              { key: "id", label: "ID", width: 14 },
              { key: "operation", label: "Operation", width: 26 },
              { key: "capability", label: "Tier", width: 14 },
              { key: "status", label: "Status", width: 12 },
              { key: "expiresAt", label: "Expires At", width: 12 },
            ],
            rows,
            emptyMessage: "(no challenges found)",
            title: "HITL Challenges",
          },
        };
      }

      case "approve": {
        const id = parsed.subcommands[3] || (parsed.flags.id as string);
        if (!id) {
          throw new UsageError("Challenge ID is required: 'lifeos agent challenge approve <id>'");
        }

        const approved = await approveChallenge(userId, id);
        return {
          data: approved,
          message: `Challenge '${id}' for operation '${approved.operation}' APPROVED. Ready for execution.`,
        };
      }

      case "reject": {
        const id = parsed.subcommands[3] || (parsed.flags.id as string);
        if (!id) {
          throw new UsageError("Challenge ID is required: 'lifeos agent challenge reject <id>'");
        }

        const reason = (parsed.flags.reason as string) || "Rejected by user via CLI";
        const rejected = await rejectChallenge(userId, id, reason);
        return {
          data: rejected,
          message: `Challenge '${id}' for operation '${rejected.operation}' REJECTED.`,
        };
      }

      default:
        throw new UsageError(
          `Unknown agent challenge action: '${action}'. Valid actions: list, approve, reject.`
        );
    }
  }

  // --- AUDIT SUBCOMMAND ---
  if (target === "audit") {
    const limit = parsed.flags.limit ? Number(parsed.flags.limit) : 50;
    const toolName = parsed.flags.tool as string | undefined;
    const status = parsed.flags.status as string | undefined;

    const logs = await queryAgentAuditLogs(userId, {
      toolName,
      status,
      limit,
    });

    const rows = logs.map((l) => ({
      id: l.id,
      tool: l.toolName,
      capability: l.capability,
      status: l.status,
      duration: l.durationMs !== null ? `${l.durationMs}ms` : "-",
      createdAt: l.createdAt.toISOString().slice(11, 19),
    }));

    return {
      data: logs,
      tableData: {
        columns: [
          { key: "id", label: "ID", width: 14 },
          { key: "tool", label: "Tool", width: 24 },
          { key: "capability", label: "Capability", width: 14 },
          { key: "status", label: "Status", width: 14 },
          { key: "duration", label: "Duration", width: 10 },
          { key: "createdAt", label: "Time", width: 10 },
        ],
        rows,
        emptyMessage: "(no agent audit logs found)",
        title: "Agent Attribution Audit Log",
      },
    };
  }

  throw new UsageError(
    `Unknown agent target: '${target}'. Valid targets: token, challenge, audit.`
  );
}
