/**
 * CLI Authentication Commands: login, logout, whoami
 */

import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { session, user } from "@/server/db/schema/auth";
import { and, eq, gt, desc } from "drizzle-orm";
import { saveCredentials, clearCredentials, resolveToken } from "../config";
import { resolveAuthenticatedUser, assertNoCallerSpoofing } from "../auth";
import { AuthError, UsageError } from "../errors";
import type { CommandResult, ParsedArgs, CommandContext } from "../types";
import { executeAgentOperation } from "@/server/agents/safety-boundary";

/**
 * Handles 'lifeos login'
 */
export async function handleLogin(
  parsed: ParsedArgs
): Promise<CommandResult<{ user: { id: string; name: string; email: string }; expiresAt: string }>> {
  assertNoCallerSpoofing(parsed.flags);

  const email = (parsed.flags.email as string) || (parsed.subcommands[1] as string);
  const password = parsed.flags.password as string;

  if (!email || !password) {
    throw new UsageError("Missing required credentials: both --email and --password must be provided.");
  }

  let res: Response;
  try {
    res = await auth.api.signInEmail({
      body: {
        email: email.trim(),
        password: password.trim(),
      },
      asResponse: true,
    });
  } catch (err) {
    throw new AuthError(
      `Login failed: ${err instanceof Error ? err.message : "Invalid credentials"}`
    );
  }

  if (!res.ok) {
    throw new AuthError("Login failed: Invalid email or password.");
  }

  // Extract session token from set-cookie header or database
  let sessionToken: string | null = null;
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const match = setCookie.match(/better-auth\.session_token=([^;]+)/);
    if (match && match[1]) {
      // If signed, token is before '.'
      sessionToken = match[1].split(".")[0];
    }
  }

  // Fallback: query active session for this user from DB
  const [userRow] = await db
    .select()
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()))
    .limit(1);

  if (!userRow) {
    throw new AuthError("User not found after sign-in.");
  }

  if (!sessionToken) {
    const [latestSession] = await db
      .select()
      .from(session)
      .where(and(eq(session.userId, userRow.id), gt(session.expiresAt, new Date())))
      .orderBy(desc(session.createdAt))
      .limit(1);

    if (latestSession) {
      sessionToken = latestSession.token;
    }
  }

  if (!sessionToken) {
    throw new AuthError("Failed to obtain a valid session token after authentication.");
  }

  // Query session expiration
  const [activeSession] = await db
    .select()
    .from(session)
    .where(eq(session.token, sessionToken))
    .limit(1);

  const expiresAt = activeSession?.expiresAt
    ? activeSession.expiresAt.toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const userDTO = {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
  };

  // Securely save credentials
  saveCredentials({
    token: sessionToken,
    user: userDTO,
  }, parsed.options.config);

  return {
    data: {
      user: userDTO,
      expiresAt,
    },
    message: `Successfully authenticated as ${userDTO.email}. Credentials saved.`,
    tableData: {
      columns: [
        { key: "field", label: "Property", width: 16 },
        { key: "value", label: "Value", width: 40 },
      ],
      rows: [
        { field: "User ID", value: userDTO.id },
        { field: "Name", value: userDTO.name },
        { field: "Email", value: userDTO.email },
        { field: "Session Expires", value: expiresAt },
      ],
      title: "Authentication Successful",
    },
  };
}

/**
 * Handles 'lifeos logout'
 */
export async function handleLogout(
  parsed: ParsedArgs
): Promise<CommandResult<{ success: boolean }>> {
  assertNoCallerSpoofing(parsed.flags);

  const token = resolveToken(parsed.options);

  if (token) {
    try {
      // Invalidate session in database
      await db.delete(session).where(eq(session.token, token));
    } catch {
      // Ignore database errors during logout cleanup
    }

    try {
      await auth.api.revokeSession({
        body: { token },
        headers: new Headers({
          authorization: `Bearer ${token}`,
        }),
      });
    } catch {
      // Best-effort Better Auth revocation
    }
  }

  clearCredentials(parsed.options.config);

  return {
    data: { success: true },
    message: "Logged out successfully. Stored credentials removed.",
  };
}

/**
 * Handles 'lifeos whoami'
 */
export async function handleWhoami(
  parsed: ParsedArgs,
  context?: CommandContext
): Promise<CommandResult<{ user: { id: string; name: string; email: string }; expiresAt: string }>> {
  assertNoCallerSpoofing(parsed.flags);

  const ctx = context || (await resolveAuthenticatedUser(parsed.options.token, parsed.options));

  const runWhoami = async () => {
    const expiresAt = ctx.session?.expiresAt
      ? (ctx.session.expiresAt instanceof Date
          ? ctx.session.expiresAt.toISOString()
          : new Date(ctx.session.expiresAt).toISOString())
      : "N/A";

    return {
      data: {
        user: ctx.user,
        expiresAt,
      },
      message: `Logged in as ${ctx.user.email} (${ctx.user.name})`,
      tableData: {
        columns: [
          { key: "field", label: "Property", width: 16 },
          { key: "value", label: "Value", width: 40 },
        ],
        rows: [
          { field: "User ID", value: ctx.user.id },
          { field: "Name", value: ctx.user.name },
          { field: "Email", value: ctx.user.email },
          { field: "Session Expires", value: expiresAt },
        ],
        title: "Authenticated User",
      },
    };
  };

  if (ctx.isAgent) {
    const result = await executeAgentOperation({
      context: {
        isAgent: true,
        agent: ctx.agent,
        user: ctx.user,
        sessionId: ctx.session?.id,
      },
      toolName: "whoami",
      arguments: parsed.flags as Record<string, unknown>,
      targetUserId: ctx.user.id,
      executor: runWhoami,
    });

    if (result.status === "CHALLENGE_REQUIRED") {
      return {
        data: result as any,
        message: result.message,
      };
    }

    return result.data as CommandResult<{ user: { id: string; name: string; email: string }; expiresAt: string }>;
  }

  return await runWhoami();
}

