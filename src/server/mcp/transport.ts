/**
 * LifeOS MCP Stdio Transport & Lifecycle Runner
 *
 * Implements strict stdio stream discipline:
 * - process.stdout is strictly reserved for framed JSON-RPC 2.0 messages from StdioServerTransport.
 * - process.stderr is used exclusively for operational diagnostics, lifecycle notices, and errors.
 * - Drains database connections and gracefully cleans up resources upon shutdown.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { teardownResources } from "@/cli/lifecycle";
import { resolveMcpAuth } from "./auth";
import { createLifeOSMcpServer } from "./server";
import type { McpContext } from "./types";

export interface StdioServerOptions {
  token?: string;
  config?: string;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  stderr?: NodeJS.WriteStream;
}

export async function startStdioServer(
  options?: StdioServerOptions,
  preloadedContext?: McpContext
): Promise<void> {
  const errStream = options?.stderr ?? process.stderr;
  const context = preloadedContext ?? (await resolveMcpAuth(options?.token, options?.config));

  errStream.write(
    `[lifeos-mcp] Authenticated session established for ${context.user.email} (${context.user.id})\n`
  );

  const server = createLifeOSMcpServer(context);
  const transport = new StdioServerTransport(options?.stdin, options?.stdout);

  return new Promise<void>((resolve, reject) => {
    let closed = false;

    const cleanup = async () => {
      if (closed) return;
      closed = true;
      errStream.write("[lifeos-mcp] Disconnecting and draining database connections...\n");
      try {
        await server.close();
      } catch {
        // Suppress errors during close
      }
      try {
        await teardownResources();
      } catch {
        // Suppress errors during teardown
      }
      resolve();
    };

    transport.onclose = () => {
      void cleanup();
    };

    transport.onerror = (err) => {
      errStream.write(`[lifeos-mcp] Transport error: ${err.message}\n`);
    };

    const stdinStream = options?.stdin ?? process.stdin;
    stdinStream.once("end", () => {
      void cleanup();
    });
    stdinStream.once("close", () => {
      void cleanup();
    });

    const sigintHandler = () => {
      void cleanup().then(() => process.exit(130));
    };

    const sigtermHandler = () => {
      void cleanup().then(() => process.exit(143));
    };

    process.once("SIGINT", sigintHandler);
    process.once("SIGTERM", sigtermHandler);

    server.connect(transport).catch((err) => {
      void cleanup().then(() => reject(err));
    });
  });
}
