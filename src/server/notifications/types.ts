import { z } from "zod";

export type NotificationType =
  | "info"
  | "warning"
  | "success"
  | "error"
  | "reminder";

export type NotificationEntityType =
  | "task"
  | "project"
  | "goal"
  | "habit"
  | "finance"
  | "content"
  | "system";

export interface NotificationDTO {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  entityType: NotificationEntityType | null;
  entityId: string | null;
  linkUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface QuietHoursConfig {
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "HH:mm" (24-hour format)
  quietHoursEnd: string;   // "HH:mm" (24-hour format)
  timezone: string;        // IANA timezone string, e.g. "UTC", "America/New_York", "Asia/Karachi"
}

export interface NotificationEligibilityResult {
  inQuietHours: boolean;
  isEligibleForImmediateAlert: boolean;
  isSilenced: boolean;
  reason?: string;
}

export const createNotificationSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Notification title is required")
      .max(255, "Notification title cannot exceed 255 characters"),
    message: z
      .string()
      .trim()
      .min(1, "Notification message is required")
      .max(5000, "Notification message cannot exceed 5000 characters"),
    type: z
      .enum(["info", "warning", "success", "error", "reminder"])
      .default("info"),
    entityType: z
      .enum(["task", "project", "goal", "habit", "finance", "content", "system"])
      .optional()
      .nullable(),
    entityId: z.string().trim().min(1).optional().nullable(),
    linkUrl: z
      .string()
      .trim()
      .max(1024, "Link URL cannot exceed 1024 characters")
      .optional()
      .nullable(),
    metadata: z.record(z.unknown()).optional().default({}),
    bypassQuietHours: z.boolean().optional(),
    urgent: z.boolean().optional(),
    // Client cannot specify ownership or read status
    userId: z.never({ message: "userId cannot be provided in payload" }).optional(),
    id: z.never({ message: "id cannot be provided in payload" }).optional(),
    isRead: z.never({ message: "isRead cannot be provided in payload" }).optional(),
    readAt: z.never({ message: "readAt cannot be provided in payload" }).optional(),
    createdAt: z.never({ message: "createdAt cannot be provided in payload" }).optional(),
  })
  .strict();

export type CreateNotificationInput = z.input<typeof createNotificationSchema>;
export type ValidatedNotificationPayload = z.output<typeof createNotificationSchema>;

export const listNotificationsQuerySchema = z
  .object({
    unreadOnly: z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((val) => val === "true" || val === "1"),
    type: z
      .enum(["info", "warning", "success", "error", "reminder"])
      .optional(),
    entityType: z
      .enum(["task", "project", "goal", "habit", "finance", "content", "system"])
      .optional(),
    limit: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .transform((val) => (val ? Math.min(Math.max(parseInt(val, 10), 1), 100) : 20)),
    offset: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .transform((val) => (val ? Math.max(parseInt(val, 10), 0) : 0)),
  })
  .strict();

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export interface ListNotificationsOptions {
  unreadOnly?: boolean;
  type?: NotificationType;
  entityType?: NotificationEntityType;
  limit?: number;
  offset?: number;
}
