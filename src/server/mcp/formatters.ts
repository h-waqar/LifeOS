/**
 * MCP Deterministic Serialization & Secret-Scrubbing Boundary
 *
 * Enforces canonical formatting rules across all MCP resources and tools:
 * 1. Deterministic key ordering for predictable agent parsing.
 * 2. Deep secret scrubbing: tokens, passwords, cookies, encryption keys redacted.
 * 3. ISO 8601 formatting for dates.
 * 4. Safe error mapping without internal database connection strings or secret leaks.
 */

import { scrubSecrets, serializeDeterministic, resolveCliError } from "@/cli/errors";
import type { ReadResourceResult, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Serializes any payload into deterministic JSON with automatic secret scrubbing.
 */
export function serializeMcpJson(data: unknown): string {
  const deterministic = serializeDeterministic(data);
  const json = JSON.stringify(deterministic, null, 2);
  return scrubSecrets(json);
}

/**
 * Constructs an MCP ReadResourceResult with deterministic JSON and secret scrubbing.
 */
export function formatMcpResource(uri: string, data: unknown): ReadResourceResult {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: serializeMcpJson(data),
      },
    ],
  };
}

/**
 * Constructs an MCP CallToolResult with deterministic JSON content.
 */
export function formatMcpToolSuccess(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: serializeMcpJson(data),
      },
    ],
  };
}

/**
 * Constructs an MCP CallToolResult for an error with secret scrubbing and canonical code mapping.
 */
export function formatMcpToolError(error: unknown): CallToolResult {
  const resolved = resolveCliError(error);
  const errorPayload = {
    error: {
      code: resolved.code,
      message: resolved.message,
      ...(resolved.details !== undefined ? { details: resolved.details } : {}),
    },
  };

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: serializeMcpJson(errorPayload),
      },
    ],
  };
}
