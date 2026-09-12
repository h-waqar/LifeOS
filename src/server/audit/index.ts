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
    const sanitizedAction =
      typeof params.action === "string" ? params.action.trim() : "";
    if (!sanitizedAction) {
      console.warn("⚠️ Invalid audit log action: must be a non-empty string.");
      return;
    }

    const sanitizedUserId =
      typeof params.userId === "string" && params.userId.trim().length > 0
        ? params.userId.trim()
        : null;

    const sanitizedIp =
      typeof params.ipAddress === "string" && params.ipAddress.trim().length > 0
        ? params.ipAddress.trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 128)
        : null;

    const sanitizedUserAgent =
      typeof params.userAgent === "string" && params.userAgent.trim().length > 0
        ? params.userAgent.trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 512)
        : null;

    const sanitizedActor =
      typeof params.actor === "string" && params.actor.trim().length > 0
        ? params.actor.trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 128)
        : sanitizedUserId
        ? `user:${sanitizedUserId}`
        : "system";

    await db.insert(auditLog).values({
      userId: sanitizedUserId,
      category: params.category,
      action: sanitizedAction.slice(0, 128),
      status: params.status,
      actor: sanitizedActor,
      details: params.details ?? null,
      ipAddress: sanitizedIp,
      userAgent: sanitizedUserAgent,
    });
  } catch (error) {
    // Log error to server console without breaking caller flow
    console.error("❌ Failed to write audit log entry:", error);
  }
}
