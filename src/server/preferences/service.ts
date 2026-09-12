import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { userPreferences, type UserPreferences } from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Preferences service cannot be initialized in the browser."
  );
}

export const updatePreferencesSchema = z
  .object({
    theme: z.enum(["dark", "light", "system"]).optional(),
    dateFormat: z.string().trim().min(1, "Date format cannot be empty or whitespace").max(32).optional(),
    timeFormat: z.enum(["12h", "24h"]).optional(),
    workingHoursStart: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format must be HH:mm")
      .optional(),
    workingHoursEnd: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format must be HH:mm")
      .optional(),
    // Explicitly disallow client-controlled userId to prevent spoofing
    userId: z.never({ message: "Client cannot specify userId in payload" }).optional(),
  })
  .strict();

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

/**
 * Retrieves preferences for the authenticated user.
 * Strictly uses query-level filtering: `WHERE user_id = authenticatedUserId`.
 * Never relies on in-memory ownership filtering.
 */
export async function getUserPreferences(
  authenticatedUserId: string
): Promise<UserPreferences | null> {
  if (
    !authenticatedUserId ||
    typeof authenticatedUserId !== "string" ||
    !authenticatedUserId.trim()
  ) {
    throw new AuthorizationError("Authenticated user ID is required to read preferences.");
  }

  const results = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, authenticatedUserId.trim()))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Updates preferences for the authenticated user.
 * Strictly uses query-level condition: `WHERE user_id = authenticatedUserId`.
 * Client payload is validated via Zod (.strict()), discarding any client-injected userId.
 * Employs an atomic single-statement upsert to prevent concurrent creation/update races.
 */
export async function updateUserPreferences(
  authenticatedUserId: string,
  input: UpdatePreferencesInput,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<UserPreferences> {
  if (
    !authenticatedUserId ||
    typeof authenticatedUserId !== "string" ||
    !authenticatedUserId.trim()
  ) {
    throw new AuthorizationError("Authenticated user ID is required to update preferences.");
  }

  const safeUserId = authenticatedUserId.trim();
  const validated = updatePreferencesSchema.parse(input);

  // Enforce server-controlled fields
  const safeUpdates: Partial<Omit<UserPreferences, "id" | "userId" | "createdAt">> = {};
  if (validated.theme !== undefined) safeUpdates.theme = validated.theme;
  if (validated.dateFormat !== undefined) safeUpdates.dateFormat = validated.dateFormat;
  if (validated.timeFormat !== undefined) safeUpdates.timeFormat = validated.timeFormat;
  if (validated.workingHoursStart !== undefined) safeUpdates.workingHoursStart = validated.workingHoursStart;
  if (validated.workingHoursEnd !== undefined) safeUpdates.workingHoursEnd = validated.workingHoursEnd;

  const now = new Date();

  // Atomically upsert preferences strictly anchored to safeUserId
  const [finalRecord] = await db
    .insert(userPreferences)
    .values({
      userId: safeUserId,
      theme: safeUpdates.theme ?? "dark",
      dateFormat: safeUpdates.dateFormat ?? "YYYY-MM-DD",
      timeFormat: safeUpdates.timeFormat ?? "24h",
      workingHoursStart: safeUpdates.workingHoursStart ?? "09:00",
      workingHoursEnd: safeUpdates.workingHoursEnd ?? "18:00",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        ...safeUpdates,
        updatedAt: now,
      },
    })
    .returning();

  // Record mutation in audit log
  await createAuditLog({
    userId: safeUserId,
    category: "mutation",
    action: "preferences.updated",
    status: "success",
    actor: `user:${safeUserId}`,
    details: safeUpdates as Record<string, unknown>,
    ipAddress: actorInfo?.ipAddress,
    userAgent: actorInfo?.userAgent,
  });

  return finalRecord;
}
