/**
 * Central LifeOS CLI Router & Command Dispatcher
 *
 * Implements deterministic argument parsing, global flags (--json, --token, --config),
 * structured error handling, lifecycle teardown, and POSIX exit code discipline.
 */

import { formatCliError, UsageError } from "./errors";
import { formatJson, formatTable } from "./formatters";
import { withLifecycle } from "./lifecycle";
import { resolveAuthenticatedUser, assertNoCallerSpoofing } from "./auth";
import { handleLogin, handleLogout, handleWhoami } from "./commands/auth";
import { handleStatus, handleContext } from "./commands/context";
import { handleTasks } from "./commands/tasks";
import { handleProjects } from "./commands/projects";
import { handleGoals } from "./commands/goals";
import { handleNotes } from "./commands/notes";
import { handleHabits } from "./commands/habits";
import { handlePlan } from "./commands/plan";
import { handleMcp } from "./commands/mcp";
import { handleSkills } from "./commands/skills";
import { handleDocs } from "./commands/docs";
import { handleAgents } from "./commands/agents";
import { handleWorkspace } from "./commands/workspace";
import type {
  CommandContext,
  CommandResult,
  GlobalOptions,
  ParsedArgs,
} from "./types";
import { EXIT_CODES, type ExitCode } from "./types";

const CLI_VERSION = "0.1.0";

/**
 * Parses raw command-line arguments into subcommands, flags, and global options.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const subcommands: string[] = [];
  const flags: Record<string, string | boolean | number | (string | boolean | number)[]> = {};
  const options: GlobalOptions = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--json") {
      options.json = true;
      flags.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
      flags.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
      flags.version = true;
    } else if (arg.startsWith("--token=")) {
      const val = arg.slice("--token=".length);
      options.token = val;
      flags.token = val;
    } else if (arg === "--token") {
      const val = argv[++i];
      if (!val || val.startsWith("-")) {
        throw new UsageError("Flag '--token' requires an argument.");
      }
      options.token = val;
      flags.token = val;
    } else if (arg.startsWith("--config=")) {
      const val = arg.slice("--config=".length);
      options.config = val;
      flags.config = val;
    } else if (arg === "--config") {
      const val = argv[++i];
      if (!val || val.startsWith("-")) {
        throw new UsageError("Flag '--config' requires an argument.");
      }
      options.config = val;
      flags.config = val;
    } else if (arg.startsWith("--no-")) {
      const key = arg.slice(5);
      flags[key] = false;
      flags[toCamelCase(key)] = false;
    } else if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const val = arg.slice(eqIdx + 1);
        flags[key] = val;
        flags[toCamelCase(key)] = val;
      } else {
        const key = arg.slice(2);
        const nextArg = argv[i + 1];
        if (nextArg !== undefined && !nextArg.startsWith("-")) {
          flags[key] = nextArg;
          flags[toCamelCase(key)] = nextArg;
          i++;
        } else {
          flags[key] = true;
          flags[toCamelCase(key)] = true;
        }
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      // Short flag
      const key = arg.slice(1);
      flags[key] = true;
    } else {
      subcommands.push(arg);
    }
  }

  // Guard against identity spoofing in arguments
  assertNoCallerSpoofing(flags);

  return { subcommands, flags, options };
}

function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Global help documentation.
 */
export function getHelpText(): string {
  return `LifeOS Headless CLI - Personal Operating System Command-Line Interface

Usage:
  lifeos [command] [subcommand] [flags]
  lifeos [group] [action] [arguments]

Global Flags:
  --json             Emit output in machine-readable deterministic JSON format
  --token <token>    Explicit session token override (or set LIFEOS_TOKEN)
  --config <path>    Custom configuration directory path
  --help, -h         Display help information for command or CLI
  --version, -v      Display CLI version

Core Commands:
  login              Authenticate with email and password and store session token
  logout             Revoke active session and remove stored credentials
  whoami             Display authenticated user identity and session details
  status             View consolidated life status and priorities
  context            View rich aggregated life context for AI agents
  tasks              Manage tasks (list, get, create, update, delete)
  projects           Manage projects (list, get, create, update, delete)
  goals              Manage goals (list, get, create, update, delete)
  notes              Manage notes (list, get, create, update, delete)
  habits             Manage habits and entries (list, get, create, update, delete, log)
  plan morning       Daily morning planning workflow
  plan evening       Daily evening review and task rollover workflow
  mcp                Start Model Context Protocol (MCP) server over stdio
  skills             Discover and retrieve procedural skills guidance (list, get, match)
  docs               Search and inspect documentation, specs, and planning state
  agent              Manage agent tokens, approval challenges, and audit logs
  workspace          Execute sandboxed workspace commands, verify code, and materialize plans

For command-specific help, run:
  lifeos [command] --help
`;
}

/**
 * Command registry type
 */
type CommandFn = (
  parsed: ParsedArgs,
  context?: CommandContext
) => Promise<CommandResult<unknown> | void>;

export const COMMAND_REGISTRY: Record<string, { run: CommandFn; requiresAuth: boolean; help?: string }> = {
  login: {
    run: handleLogin,
    requiresAuth: false,
    help: "lifeos login --email <email> --password <password>",
  },
  logout: {
    run: handleLogout,
    requiresAuth: false,
    help: "lifeos logout",
  },
  mcp: {
    run: handleMcp,
    requiresAuth: false,
    help: "lifeos mcp [--token <token>] [--config <path>]",
  },
  whoami: {
    run: handleWhoami,
    requiresAuth: true,
    help: "lifeos whoami [--json]",
  },
  status: {
    run: handleStatus,
    requiresAuth: true,
    help: "lifeos status [--date <YYYY-MM-DD>] [--json]",
  },
  context: {
    run: handleContext,
    requiresAuth: true,
    help: "lifeos context [--date <YYYY-MM-DD>] [--json]",
  },
  tasks: {
    run: handleTasks,
    requiresAuth: true,
    help: "lifeos tasks [list|get|create|update|delete] [flags]",
  },
  projects: {
    run: handleProjects,
    requiresAuth: true,
    help: "lifeos projects [list|get|create|update|delete] [flags]",
  },
  goals: {
    run: handleGoals,
    requiresAuth: true,
    help: "lifeos goals [list|get|create|update|delete] [flags]",
  },
  notes: {
    run: handleNotes,
    requiresAuth: true,
    help: "lifeos notes [list|get|create|update|delete] [flags]",
  },
  habits: {
    run: handleHabits,
    requiresAuth: true,
    help: "lifeos habits [list|get|create|update|delete|log|toggle] [flags]",
  },
  plan: {
    run: handlePlan,
    requiresAuth: true,
    help: "lifeos plan [morning|evening] [flags]",
  },
  skills: {
    run: handleSkills,
    requiresAuth: false,
    help: "lifeos skills [list|get|match] [flags]",
  },
  docs: {
    run: handleDocs,
    requiresAuth: false,
    help: "lifeos docs [search|get|planning] [flags]",
  },
  agent: {
    run: handleAgents,
    requiresAuth: true,
    help: "lifeos agent [token|challenge|audit] [action] [flags]",
  },
  workspace: {
    run: handleWorkspace,
    requiresAuth: true,
    help: "lifeos workspace [run|verify|materialize|status|next-task] [flags]",
  },
};

/**
 * Registers an additional command in the CLI router.
 */
export function registerCommand(
  name: string,
  config: { run: CommandFn; requiresAuth: boolean; help?: string }
): void {
  COMMAND_REGISTRY[name] = config;
}

/**
 * Main execution dispatcher.
 */
export async function runCli(argv: string[]): Promise<ExitCode> {
  let parsed: ParsedArgs;

  try {
    parsed = parseArgs(argv);
  } catch (error) {
    const isMcp = argv.some((a) => a.toLowerCase() === "mcp");
    const formatted = formatCliError(error, isMcp ? false : argv.includes("--json"));
    if (formatted.isJson) {
      process.stdout.write(formatted.output + "\n");
    } else {
      process.stderr.write(formatted.output + "\n");
    }
    return formatted.exitCode;
  }

  const isJson = Boolean(parsed.options.json);

  // Handle version flag (database connection NOT required)
  if (parsed.options.version) {
    if (isJson) {
      process.stdout.write(formatJson({ version: CLI_VERSION }) + "\n");
    } else {
      process.stdout.write(`LifeOS CLI v${CLI_VERSION}\n`);
    }
    return EXIT_CODES.SUCCESS;
  }

  // Handle help flag or empty command (database connection NOT required)
  if (parsed.options.help || parsed.subcommands.length === 0) {
    if (isJson) {
      process.stdout.write(formatJson({ help: getHelpText() }) + "\n");
    } else {
      process.stdout.write(getHelpText() + "\n");
    }
    return EXIT_CODES.SUCCESS;
  }

  const primaryCommand = parsed.subcommands[0].toLowerCase();
  const commandEntry = COMMAND_REGISTRY[primaryCommand];

  if (!commandEntry) {
    const error = new UsageError(`Unknown command: '${primaryCommand}'. Run 'lifeos --help' for available commands.`);
    const formatted = formatCliError(error, isJson);
    if (formatted.isJson) {
      process.stdout.write(formatted.output + "\n");
    } else {
      process.stderr.write(formatted.output + "\n");
    }
    return formatted.exitCode;
  }

  // Execute within lifecycle wrapper
  return await withLifecycle(async () => {
    try {
      let context: CommandContext | undefined;
      if (commandEntry.requiresAuth) {
        context = await resolveAuthenticatedUser(parsed.options.token, parsed.options);
      } else if (parsed.options.token && primaryCommand !== "mcp" && primaryCommand !== "login" && primaryCommand !== "logout") {
        context = await resolveAuthenticatedUser(parsed.options.token, parsed.options);
      }

      const result = await commandEntry.run(parsed, context);

      if (result) {
        if (isJson) {
          const payload = result.data !== undefined ? result.data : { message: result.message };
          process.stdout.write(formatJson(payload) + "\n");
        } else {
          if (result.tableData) {
            process.stdout.write(
              formatTable(result.tableData.columns, result.tableData.rows, {
                emptyMessage: result.tableData.emptyMessage,
                title: result.tableData.title,
              }) + "\n"
            );
          } else if (result.message) {
            process.stdout.write(result.message + "\n");
          }
        }
        return result.exitCode ?? EXIT_CODES.SUCCESS;
      }

      return EXIT_CODES.SUCCESS;
    } catch (error) {
      const isMcp = primaryCommand === "mcp";
      const formatted = formatCliError(error, isMcp ? false : isJson);
      if (formatted.isJson) {
        process.stdout.write(formatted.output + "\n");
      } else {
        process.stderr.write(formatted.output + "\n");
      }
      return formatted.exitCode;
    }
  });
}

/**
 * CLI executable entry point.
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const exitCode = await runCli(argv);
  process.exitCode = exitCode;
}
