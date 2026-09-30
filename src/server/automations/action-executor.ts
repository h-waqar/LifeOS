import { createNotification } from "@/server/notifications/service";
import { createTask, updateTask } from "@/server/tasks/service";
import { updateProject } from "@/server/projects/service";
import { createAuditLog } from "@/server/audit";
import { generateDailySuggestions } from "@/server/ai/proactive/daily-planner";
import { generateWeeklyReview } from "@/server/ai/proactive/weekly-synthesizer";
import {
  interpolateObject,
  interpolateTemplate,
  getNestedValue,
} from "./condition-evaluator";
import {
  type AutomationActionType,
  AutomationError,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Action executor cannot be initialized in the browser."
  );
}

/**
 * Executes a single automation action via canonical domain services.
 * Bounded by authenticated user ID; does not use raw SQL.
 */
export async function executeAction(
  userId: string,
  automationId: string,
  actionType: AutomationActionType,
  rawActionConfig: Record<string, unknown>,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AutomationError("Authenticated userId is required to execute action.");
  }

  // Pre-process action configuration with parameter interpolation
  const config = interpolateObject(rawActionConfig ?? {}, context);

  switch (actionType) {
    case "create_notification": {
      const title = String(config.title ?? "").trim();
      const message = String(config.message ?? "").trim();

      if (!title || !message) {
        throw new AutomationError(
          "Notification title and message are required for create_notification action."
        );
      }

      const notif = await createNotification(userId, {
        title,
        message,
        type: (config.type as any) ?? "info",
        entityType: (config.entityType as any) ?? null,
        entityId: config.entityId ? String(config.entityId) : null,
        linkUrl: config.linkUrl ? String(config.linkUrl) : null,
        urgent: Boolean(config.urgent),
        bypassQuietHours: Boolean(config.bypassQuietHours),
        metadata: {
          ...(typeof config.metadata === "object" && config.metadata !== null
            ? (config.metadata as Record<string, unknown>)
            : {}),
          automationId,
          triggeredBy: (context.event as any)?.name ?? "unknown",
        },
      });

      return { notificationId: notif.id, type: notif.type, title: notif.title };
    }

    case "create_task": {
      const title = String(config.title ?? "").trim();
      if (!title) {
        throw new AutomationError("Task title is required for create_task action.");
      }

      let dueDate: string | undefined = undefined;
      if (typeof config.dueOffsetDays === "number") {
        const d = new Date();
        d.setDate(d.getDate() + config.dueOffsetDays);
        dueDate = d.toISOString();
      } else if (config.dueDate) {
        const str = String(config.dueDate);
        dueDate = str.includes("T") ? str : new Date(str).toISOString();
      }

      const created = await createTask(userId, {
        title,
        priority: (config.priority as any) ?? "medium",
        dueDate: dueDate ?? null,
        projectId: config.projectId ? String(config.projectId) : null,
        goalId: config.goalId ? String(config.goalId) : null,
        tags: Array.isArray(config.tags) ? config.tags.map(String) : [],
        description: config.description ? String(config.description) : null,
      });

      return { taskId: created.id, title: created.title, priority: created.priority };
    }

    case "update_task": {
      // Find taskId from config or context
      let taskId = config.taskId ? String(config.taskId).trim() : "";
      if (!taskId) {
        const extracted =
          getNestedValue(context, "task.id") ??
          getNestedValue(context, "taskId") ??
          getNestedValue(context, "payload.task.id");
        if (extracted) {
          taskId = String(extracted).trim();
        }
      }

      if (!taskId) {
        throw new AutomationError(
          "Task ID is required for update_task action (not provided in actionConfig or trigger context)."
        );
      }

      const updates: Record<string, any> = {};
      if (config.title) updates.title = String(config.title);
      if (config.status) updates.status = config.status;
      if (config.priority) updates.priority = config.priority;
      if (config.dueDate !== undefined) updates.dueDate = config.dueDate;
      if (config.description !== undefined) updates.description = config.description;

      const updated = await updateTask(userId, taskId, updates);
      return { taskId: updated.id, status: updated.status, title: updated.title };
    }

    case "update_project": {
      // Find projectId from config or context
      let projectId = config.projectId ? String(config.projectId).trim() : "";
      if (!projectId) {
        const extracted =
          getNestedValue(context, "project.id") ??
          getNestedValue(context, "task.projectId") ??
          getNestedValue(context, "projectId") ??
          getNestedValue(context, "payload.project.id") ??
          getNestedValue(context, "payload.task.projectId");
        if (extracted) {
          projectId = String(extracted).trim();
        }
      }

      if (!projectId) {
        throw new AutomationError(
          "Project ID is required for update_project action (not provided in actionConfig or trigger context)."
        );
      }

      const updates: Record<string, any> = {};
      if (config.name) updates.name = String(config.name);
      if (config.status) updates.status = config.status;
      if (config.description !== undefined) updates.description = config.description;

      const updated = await updateProject(userId, projectId, updates);
      return { projectId: updated.id, status: updated.status, name: updated.name };
    }

    case "log_audit": {
      const category = (config.category as any) ?? "system";
      const action = String(config.action ?? "automation.custom_log");
      const details: Record<string, unknown> = {
        ...(typeof config.details === "object" && config.details !== null
          ? (config.details as Record<string, unknown>)
          : {}),
        automationId,
      };

      await createAuditLog({
        userId,
        category,
        action,
        status: "success",
        actor: `user:${userId}`,
        details,
      });

      return { logged: true, action };
    }

    case "trigger_ai_suggestions": {
      const suggestionType =
        config.type === "weekly_review" ? "weekly_review" : "daily_planning";
      let summaryResult: Record<string, unknown>;

      if (suggestionType === "weekly_review") {
        const review = await generateWeeklyReview(userId);
        summaryResult = {
          type: "weekly_review",
          completedTasksCount: review.metrics.completedTasksCount,
          habitConsistencyPercentage: review.metrics.habitConsistencyPercentage,
          markdownReport: review.markdownReport,
        };
      } else {
        const planning = await generateDailySuggestions(userId);
        summaryResult = {
          type: "daily_planning",
          topFocusCount: planning.focusTasks.length,
          warningsCount: planning.warnings.length,
          summary: planning.summary,
        };
      }

      if (config.createNotification === true) {
        const notifTitle =
          suggestionType === "weekly_review"
            ? "Weekly Review Ready"
            : "Morning Planning Suggestions";
        const notifMessage =
          suggestionType === "weekly_review"
            ? `Your weekly review is generated with ${summaryResult.completedTasksCount} completed tasks.`
            : `Generated ${summaryResult.topFocusCount} focus task recommendations for today.`;

        await createNotification(userId, {
          title: notifTitle,
          message: notifMessage,
          type: "info",
          entityType: "system",
        });
      }

      return summaryResult;
    }

    default:
      throw new AutomationError(`Unsupported action type: ${actionType}`);
  }
}

/**
 * Simulates action execution without mutating the database (dry-run).
 * Useful for rule testing in /api/automations/test.
 */
export function simulateAction(
  actionType: AutomationActionType,
  rawActionConfig: Record<string, unknown>,
  context: Record<string, unknown>
): Record<string, unknown> {
  const config = interpolateObject(rawActionConfig ?? {}, context);

  switch (actionType) {
    case "create_notification":
      return {
        actionType,
        simulated: true,
        title: config.title ?? "",
        message: config.message ?? "",
        type: config.type ?? "info",
        entityType: config.entityType ?? null,
      };

    case "create_task":
      return {
        actionType,
        simulated: true,
        title: config.title ?? "",
        priority: config.priority ?? "medium",
        dueOffsetDays: config.dueOffsetDays,
        projectId: config.projectId ?? null,
      };

    case "update_task":
      return {
        actionType,
        simulated: true,
        taskId:
          config.taskId ||
          getNestedValue(context, "task.id") ||
          getNestedValue(context, "taskId") ||
          "{{extracted_from_context}}",
        status: config.status,
        priority: config.priority,
      };

    case "update_project":
      return {
        actionType,
        simulated: true,
        projectId:
          config.projectId ||
          getNestedValue(context, "project.id") ||
          getNestedValue(context, "task.projectId") ||
          "{{extracted_from_context}}",
        status: config.status,
      };

    case "log_audit":
      return {
        actionType,
        simulated: true,
        action: config.action ?? "automation.custom_log",
        details: config.details ?? {},
      };

    case "trigger_ai_suggestions":
      return {
        actionType,
        simulated: true,
        type: config.type ?? "daily_planning",
      };

    default:
      return { actionType, simulated: true, config };
  }
}
