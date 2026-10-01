/**
 * LifeOS Model Context Protocol (MCP) Types & Interfaces
 *
 * Defines the authenticated MCP context, server options,
 * and capability negotiation types.
 */

export interface McpUser {
  id: string;
  name: string;
  email: string;
}

export interface McpSession {
  id: string;
  userId: string;
  expiresAt: Date;
}

/**
 * Authenticated context available to all MCP resource, tool, and prompt handlers.
 * Identity is strictly derived from the verified Better Auth database session.
 * Plaintext session tokens and credentials are intentionally excluded from McpContext
 * to prevent secret leakage into handlers or runtime objects.
 */
import type { AgentIdentity } from "@/server/agents/permissions/types";

export interface McpContext {
  user: McpUser;
  session: McpSession;
  agent?: AgentIdentity;
  isAgent?: boolean;
}

export interface LifeOSMcpServerOptions {
  name?: string;
  version?: string;
}
