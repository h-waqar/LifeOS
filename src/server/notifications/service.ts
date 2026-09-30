import { eq, and, desc, sql, count } from "drizzle-orm";
import { db } from "@/server/db";
import { notifications, type Notification } from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";

export class NotFoundError extends Error {
  readonly status = 404;
  readonly code = "NOT_FOUND";
  constructor(message = "Notification not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}
import { getUserPreferences } from "@/server/preferences/service";
import { createAuditLog } from "@/server/audit";
import { eventBus } from "@/server/events/event-bus";
import { createDomainEvent } from "@/server/events/types";
import {
  createNotificationSchema,
  type CreateNotificationInput,
  type NotificationDTO,
  type ListNotificationsOptions,
  type QuietHoursConfig,
} from "./types";
import {
  evaluateNotificationEligibility,
} from "./quiet-hours";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Notification service cannot be initialized in the browser."
  );
}

/**
 * Transforms a raw database notification row into a clean, typed NotificationDTO.
 */
export function mapNotificationToDTO(row: Notification): NotificationDTO {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    message: row.message,
    type: row.type,
    entityType: row.entityType,
    entityId: row.entityId,
    linkUrl: row.linkUrl,
    isRead: row.isRead,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Creates an in-app notification for a user.
 *
 * Enforces:
 * - Server-side user ownership validation.
 * - Quiet Hours evaluation based on user preferences.
 * - Silencing of standard notifications during active quiet hours.
 * - Audit logging for high-priority or error alerts.
 * - Event Bus dispatch of "notification.created".
 */
export async function createNotification(
  userId: string,
  input: CreateNotificationInput,
  options?: {
    atDate?: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
): Promise<NotificationDTO> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError(
      "Authenticated user ID is required to create a notification."
    );
  }

  const safeUserId = userId.trim();
  const validated = createNotificationSchema.parse(input);

  // Retrieve user quiet hours preferences
  const userPrefs = await getUserPreferences(safeUserId);
  const quietHoursConfig: QuietHoursConfig = {
    quietHoursEnabled: userPrefs?.quietHoursEnabled ?? false,
    quietHoursStart: userPrefs?.quietHoursStart ?? "22:00",
    quietHoursEnd: userPrefs?.quietHoursEnd ?? "08:00",
    timezone: userPrefs?.timezone ?? "UTC",
  };

  // Evaluate quiet hours eligibility
  const eligibility = evaluateNotificationEligibility(
    validated,
    quietHoursConfig,
    options?.atDate ?? new Date()
  );

  const enrichedMetadata: Record<string, unknown> = {
    ...(validated.metadata ?? {}),
    duringQuietHours: eligibility.inQuietHours,
    silenced: eligibility.isSilenced,
    eligibilityReason: eligibility.reason ?? null,
  };

  // Insert notification record strictly anchored to safeUserId
  const [created] = await db
    .insert(notifications)
    .values({
      userId: safeUserId,
      title: validated.title,
      message: validated.message,
      type: validated.type,
      entityType: validated.entityType ?? null,
      entityId: validated.entityId ?? null,
      linkUrl: validated.linkUrl ?? null,
      isRead: false,
      readAt: null,
      metadata: enrichedMetadata,
    })
    .returning();

  const dto = mapNotificationToDTO(created);

  // Optionally log audit entry for high-priority alerts
  if (validated.type === "error" || validated.urgent === true) {
    try {
      await createAuditLog({
        userId: safeUserId,
        category: "system",
        action: "notification.high_priority_alert",
        status: "success",
        actor: `user:${safeUserId}`,
        details: {
          notificationId: dto.id,
          type: dto.type,
          title: dto.title,
          silenced: eligibility.isSilenced,
          duringQuietHours: eligibility.inQuietHours,
        },
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent,
      });
    } catch (auditErr) {
      console.error(
        "[NotificationService] Non-fatal audit log error:",
        auditErr
      );
    }
  }

  // Publish notification.created event on the Event Bus
  try {
    await eventBus.publish(
      createDomainEvent("notification.created", safeUserId, {
        notification: dto,
        silenced: eligibility.isSilenced,
      })
    );
  } catch (eventErr) {
    console.error(
      "[NotificationService] Non-fatal event dispatch error:",
      eventErr
    );
  }

  return dto;
}

/**
 * Lists paginated notifications for the authenticated user with unread counts.
 * Strictly scopes all queries by `user_id = userId`.
 */
export async function listNotifications(
  userId: string,
  options: ListNotificationsOptions = {}
): Promise<{
  notifications: NotificationDTO[];
  total: number;
  unreadCount: number;
}> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError(
      "Authenticated user ID is required to list notifications."
    );
  }

  const safeUserId = userId.trim();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const filters = [eq(notifications.userId, safeUserId)];

  if (options.unreadOnly) {
    filters.push(eq(notifications.isRead, false));
  }

  if (options.type) {
    filters.push(eq(notifications.type, options.type));
  }

  if (options.entityType) {
    filters.push(eq(notifications.entityType, options.entityType));
  }

  const whereClause = and(...filters);

  // Execute query for items and counts
  const [items, [totalResult], [unreadResult]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(notifications)
      .where(whereClause),
    db
      .select({ count: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, safeUserId),
          eq(notifications.isRead, false)
        )
      ),
  ]);

  return {
    notifications: items.map(mapNotificationToDTO),
    total: totalResult?.count ?? 0,
    unreadCount: unreadResult?.count ?? 0,
  };
}

/**
 * Returns the count of unread notifications for the user.
 * Index-accelerated via `notifications_user_read_created_idx`.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError(
      "Authenticated user ID is required to get unread count."
    );
  }

  const safeUserId = userId.trim();
  const [result] = await db
    .select({ count: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, safeUserId),
        eq(notifications.isRead, false)
      )
    );

  return result?.count ?? 0;
}

/**
 * Marks a single notification as read.
 * Scoped strictly to `user_id = safeUserId` to prevent cross-tenant mutations.
 */
export async function markAsRead(
  userId: string,
  notificationId: string
): Promise<NotificationDTO | null> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError(
      "Authenticated user ID is required to mark notification as read."
    );
  }
  if (!notificationId || typeof notificationId !== "string" || !notificationId.trim()) {
    throw new NotFoundError("Notification not found.");
  }

  const safeUserId = userId.trim();
  const safeNotificationId = notificationId.trim();

  const [updated] = await db
    .update(notifications)
    .set({
      isRead: true,
      readAt: new Date(),
    })
    .where(
      and(
        eq(notifications.id, safeNotificationId),
        eq(notifications.userId, safeUserId)
      )
    )
    .returning();

  return updated ? mapNotificationToDTO(updated) : null;
}

/**
 * Marks all unread notifications as read in a single batch operation.
 * Scoped strictly to `user_id = safeUserId`.
 */
export async function markAllAsRead(
  userId: string
): Promise<{ count: number }> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError(
      "Authenticated user ID is required to mark all notifications as read."
    );
  }

  const safeUserId = userId.trim();
  const updatedRows = await db
    .update(notifications)
    .set({
      isRead: true,
      readAt: new Date(),
    })
    .where(
      and(
        eq(notifications.userId, safeUserId),
        eq(notifications.isRead, false)
      )
    )
    .returning({ id: notifications.id });

  return { count: updatedRows.length };
}

/**
 * Deletes a single notification.
 * Scoped strictly to `user_id = safeUserId`.
 */
export async function deleteNotification(
  userId: string,
  notificationId: string
): Promise<boolean> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError(
      "Authenticated user ID is required to delete a notification."
    );
  }
  if (!notificationId || typeof notificationId !== "string" || !notificationId.trim()) {
    return false;
  }

  const safeUserId = userId.trim();
  const safeNotificationId = notificationId.trim();

  const deletedRows = await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.id, safeNotificationId),
        eq(notifications.userId, safeUserId)
      )
    )
    .returning({ id: notifications.id });

  return deletedRows.length > 0;
}

/**
 * Clears all notifications for the authenticated user.
 */
export async function clearAllNotifications(
  userId: string
): Promise<{ count: number }> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError(
      "Authenticated user ID is required to clear notifications."
    );
  }

  const safeUserId = userId.trim();
  const deletedRows = await db
    .delete(notifications)
    .where(eq(notifications.userId, safeUserId))
    .returning({ id: notifications.id });

  return { count: deletedRows.length };
}
