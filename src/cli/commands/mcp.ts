/**
 * CLI Subcommand: lifeos mcp
 *
 * Launches the Model Context Protocol (MCP) server over stdio.
 * Preserves absolute stream discipline:
 * - process.stdout is dedicated strictly to JSON-RPC protocol frames.
 * - Diagnostics, auth failures, and lifecycle events write strictly to process.stderr.
 */

import { startStdioServer } from "@/server/mcp/transport";
import type { ParsedArgs } from "../types";

export async function handleMcp(parsed: ParsedArgs): Promise<void> {
  await startStdioServer({
    token: parsed.options.token,
    config: parsed.options.config,
  });
}
