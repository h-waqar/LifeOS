import { z } from "zod";
import type { Priority, TaskStatus, ProjectStatus } from "@/types";
import type { NotificationType, NotificationEntityType } from "@/server/notifications/types";

export type AutomationTriggerType = "event" | "schedule" | "threshold";

export type AutomationActionType =
  | "create_notification"
  | "create_task"
  | "update_task"
  | "update_project"
  | "log_audit"
  | "trigger_ai_suggestions";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "contains"
  | "not_contains"
  | "in"
  | "not_in"
  | "is_empty"
  | "is_not_empty"
  | "starts_with"
  | "ends_with";

export interface ConditionClause {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface ConditionGroup {
  combinator: "AND" | "OR";
  clauses: Array<ConditionClause | ConditionGroup>;
}

export type ConditionsConfig = ConditionGroup | ConditionClause[];

export type AutomationRunStatus = "success" | "failed" | "skipped";

export interface ScheduleTriggerConfig {
  type?: "cron" | "daily" | "interval" | "once";
  cron?: string;
  time?: string;
  intervalMinutes?: number;
  runAt?: string;
  timezone?: string;
}

// Action Configuration Interfaces
export interface CreateNotificationActionConfig {
  title: string;
  message: string;
  type?: NotificationType;
  entityType?: NotificationEntityType;
  entityId?: string;
  linkUrl?: string;
  urgent?: boolean;
  bypassQuietHours?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreateTaskActionConfig {
  title: string;
  priority?: Priority;
  dueOffsetDays?: number;
  dueDate?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  tags?: string[];
  description?: string | null;
}

export interface UpdateTaskActionConfig {
  taskId?: string;
  title?: string;
  status?: TaskStatus;
  priority?: Priority;
  dueDate?: string | null;
  description?: string | null;
}

export interface UpdateProjectActionConfig {
  projectId?: string;
  name?: string;
  status?: ProjectStatus;
  description?: string | null;
}

export interface LogAuditActionConfig {
  category?: "system" | "security" | "mutation";
  action?: string;
  details?: Record<string, unknown>;
}

export interface TriggerAISuggestionsActionConfig {
  type: "daily_planning" | "weekly_review";
  createNotification?: boolean;
}

export interface AutomationDTO {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  triggerType: AutomationTriggerType;
  triggerConfig: Record<string, unknown>;
  conditions: ConditionsConfig;
  actionType: AutomationActionType;
  actionConfig: Record<string, unknown>;
  isActive: boolean;
  executionCount: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRunDTO {
  id: string;
  userId: string;
  automationId: string;
  triggerEvent: string;
  status: AutomationRunStatus;
  executionDurationMs: number;
  contextSnapshot: Record<string, unknown>;
  actionOutput: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
}

export interface TestAutomationResult {
  matched: boolean;
  conditionsMet: boolean;
  actionType: AutomationActionType;
  interpolatedActionConfig: Record<string, unknown>;
  message: string;
}

// Custom Automation Errors
export class AutomationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "AUTOMATION_ERROR") {
    super(message);
    this.name = "AutomationError";
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  readonly code = "NOT_FOUND";

  constructor(message = "Automation rule not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class MaxDepthExceededError extends Error {
  readonly status = 400;
  readonly code = "MAX_DEPTH_EXCEEDED";

  constructor(message = "Maximum automation execution depth exceeded (depth >= 3).") {
    super(message);
    this.name = "MaxDepthExceededError";
  }
}

// Zod Validation Schemas
export const conditionClauseSchema: z.ZodType<ConditionClause> = z
  .object({
    field: z.string().trim().min(1, "Field path is required"),
    operator: z.enum([
      "equals",
      "not_equals",
      "greater_than",
      "greater_than_or_equal",
      "less_than",
      "less_than_or_equal",
      "contains",
      "not_contains",
      "in",
      "not_in",
      "is_empty",
      "is_not_empty",
      "starts_with",
      "ends_with",
    ]),
    value: z.unknown().optional(),
  })
  .strict();

export const conditionGroupSchema: z.ZodType<
  ConditionGroup,
  z.ZodTypeDef,
  any
> = z.lazy(() =>
  z.object({
    combinator: z.enum(["AND", "OR"]).default("AND"),
    clauses: z
      .array(z.union([conditionClauseSchema, conditionGroupSchema]))
      .default([]),
  })
);

export const conditionsSchema: z.ZodType<
  ConditionGroup,
  z.ZodTypeDef,
  any
> = z.union([
  conditionGroupSchema,
  z.array(conditionClauseSchema).transform((clauses): ConditionGroup => ({
    combinator: "AND",
    clauses,
  })),
]);

export const createAutomationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Automation name is required")
      .max(255, "Automation name cannot exceed 255 characters"),
    description: z.string().trim().max(1000).optional().nullable(),
    triggerType: z.enum(["event", "schedule", "threshold"]).default("event"),
    triggerConfig: z.record(z.unknown()).default({}),
    conditions: conditionsSchema.default({ combinator: "AND", clauses: [] }),
    actionType: z.enum([
      "create_notification",
      "create_task",
      "update_task",
      "update_project",
      "log_audit",
      "trigger_ai_suggestions",
    ]),
    actionConfig: z.record(z.unknown()).default({}),
    isActive: z.boolean().default(true),
    // Guard against client tampering of server-managed fields
    userId: z.never().optional(),
    id: z.never().optional(),
    executionCount: z.never().optional(),
    lastRunAt: z.never().optional(),
    createdAt: z.never().optional(),
    updatedAt: z.never().optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.triggerType === "event") {
        return (
          typeof data.triggerConfig?.eventName === "string" &&
          data.triggerConfig.eventName.trim().length > 0
        );
      }
      if (data.triggerType === "schedule") {
        const config = (data.triggerConfig || {}) as Record<string, unknown>;
        const hasCron =
          typeof config.cron === "string" && config.cron.trim().length > 0;
        const hasTime =
          typeof config.time === "string" &&
          /^([01]\d|2[0-3]):([0-5]\d)$/.test(config.time.trim());
        const hasInterval =
          typeof config.intervalMinutes === "number" && config.intervalMinutes > 0;
        const hasRunAt =
          typeof config.runAt === "string" && !isNaN(Date.parse(config.runAt));
        return hasCron || hasTime || hasInterval || hasRunAt;
      }
      return true;
    },
    {
      message:
        "triggerConfig must specify a valid schedule (cron, time 'HH:mm', intervalMinutes > 0, or runAt) when triggerType is 'schedule'",
      path: ["triggerConfig"],
    }
  );

export type CreateAutomationInput = z.input<typeof createAutomationSchema>;
export type ValidatedAutomationPayload = z.output<typeof createAutomationSchema>;

export const updateAutomationSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(1000).optional().nullable(),
    triggerType: z.enum(["event", "schedule", "threshold"]).optional(),
    triggerConfig: z.record(z.unknown()).optional(),
    conditions: conditionsSchema.optional(),
    actionType: z
      .enum([
        "create_notification",
        "create_task",
        "update_task",
        "update_project",
        "log_audit",
        "trigger_ai_suggestions",
      ])
      .optional(),
    actionConfig: z.record(z.unknown()).optional(),
    isActive: z.boolean().optional(),
    userId: z.never().optional(),
    id: z.never().optional(),
    executionCount: z.never().optional(),
    lastRunAt: z.never().optional(),
    createdAt: z.never().optional(),
    updatedAt: z.never().optional(),
  })
  .strict();

export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;

export const toggleAutomationSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export type ToggleAutomationInput = z.infer<typeof toggleAutomationSchema>;

export const testAutomationSchema = z
  .object({
    automationId: z.string().trim().min(1).optional(),
    rule: createAutomationSchema.optional(),
    mockEvent: z.object({
      name: z.string().trim().min(1, "Mock event name is required"),
      payload: z.record(z.unknown()).default({}),
      metadata: z.record(z.unknown()).optional(),
    }),
  })
  .strict()
  .refine((data) => !!data.automationId || !!data.rule, {
    message: "Either automationId or rule definition must be provided for test evaluation",
  });

export type TestAutomationInput = z.infer<typeof testAutomationSchema>;

export const listAutomationsQuerySchema = z
  .object({
    triggerType: z.enum(["event", "schedule", "threshold"]).optional(),
    isActive: z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((val) => (val !== undefined ? val === "true" || val === "1" : undefined)),
    limit: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .transform((val) => (val ? Math.min(Math.max(parseInt(val, 10), 1), 100) : 50)),
    offset: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .transform((val) => (val ? Math.max(parseInt(val, 10), 0) : 0)),
  })
  .strict();

export type ListAutomationsQuery = z.infer<typeof listAutomationsQuerySchema>;

export interface ListAutomationsOptions {
  triggerType?: AutomationTriggerType;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export const listRunsQuerySchema = z
  .object({
    status: z.enum(["success", "failed", "skipped"]).optional(),
    limit: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .transform((val) => (val ? Math.min(Math.max(parseInt(val, 10), 1), 100) : 50)),
    offset: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .transform((val) => (val ? Math.max(parseInt(val, 10), 0) : 0)),
  })
  .strict();

export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>;

export interface ListRunsOptions {
  status?: AutomationRunStatus;
  limit?: number;
  offset?: number;
}
