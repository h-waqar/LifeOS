import { db } from "@/server/db";
import { auditLog } from "@/server/db/schema";

// Server-only runtime protection: audit logging must never be called from browser clients
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Audit logging service cannot be initialized in the browser."
  );
}

export interface CreateAuditLogParams {
  userId?: string | null;
  category: "auth" | "security" | "mutation" | "system";
  action: string;
  status: "success" | "failure";
  actor?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Creates an immutable audit log record in PostgreSQL.
 * Captures security events, authentication lifecycle changes, and sensitive mutations.
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<void> {
  try {
    const sanitizedUserId =
      typeof params.userId === "string" && params.userId.trim().length > 0
        ? params.userId.trim()
        : null;

    await db.insert(auditLog).values({
      userId: sanitizedUserId,
      category: params.category,
      action: params.action,
      status: params.status,
      actor:
        params.actor ??
        (sanitizedUserId ? `user:${sanitizedUserId}` : "system"),
      details: params.details ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    });
  } catch (error) {
    // Log error to server console without breaking caller flow
    console.error("❌ Failed to write audit log entry:", error);
  }
}
