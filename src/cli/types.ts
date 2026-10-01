/**
 * Pure TypeScript Standalone CLI Types & Exit Codes
 *
 * Defines the core interfaces for command routing, context resolution,
 * output formatting, and deterministic POSIX exit codes.
 */

export const EXIT_CODES = {
  SUCCESS: 0,
  ERROR_GENERAL: 1,
  ERROR_VALIDATION: 2,
  ERROR_AUTH: 3,
  ERROR_NOT_FOUND: 4,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export interface GlobalOptions {
  json?: boolean;
  help?: boolean;
  version?: boolean;
  token?: string;
  config?: string;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthenticatedSession {
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
}

import type { AgentIdentity } from "@/server/agents/permissions/types";

export interface CommandContext {
  user: AuthenticatedUser;
  session: AuthenticatedSession;
  token: string;
  options: GlobalOptions;
  agent?: AgentIdentity;
  isAgent?: boolean;
}

export interface TableColumn {
  key: string;
  label: string;
  width?: number;
}

export interface TableOutput {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  emptyMessage?: string;
  title?: string;
}

export interface CommandResult<T = unknown> {
  data?: T;
  message?: string;
  tableData?: TableOutput;
  exitCode?: ExitCode;
}

export interface ParsedArgs {
  subcommands: string[];
  flags: Record<string, string | boolean | number | (string | boolean | number)[]>;
  options: GlobalOptions;
}

export interface CommandHandler {
  name: string;
  description: string;
  requiresAuth?: boolean;
  run: (
    parsed: ParsedArgs,
    context?: CommandContext
  ) => Promise<CommandResult<unknown> | void>;
}
