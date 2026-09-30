import type {
  TaskDTO,
  TaskStatus,
  ProjectDTO,
  GoalDTO,
  HabitDTO,
  HabitEntryDTO,
  ContentItemDTO,
  TimeBlockDTO,
} from "@/types";
import type { FinanceTransaction } from "@/server/db/schema";
import type { NotificationDTO } from "@/server/notifications/types";

/**
 * Base domain event contract for all in-app events in LifeOS.
 */
export interface BaseDomainEvent<TName extends string, TPayload> {
  id: string; // UUID
  name: TName;
  userId: string;
  timestamp: string; // ISO 8601
  payload: TPayload;
  metadata?: {
    correlationId?: string;
    depth?: number;
    actor?: string;
  };
}

/**
 * Strongly typed domain event roster across all LifeOS core domains.
 */
export interface DomainEventMap {
  // Tasks
  "task.created": { task: TaskDTO };
  "task.updated": {
    task: TaskDTO;
    updatedFields: string[];
    previousStatus?: TaskStatus;
  };
  "task.completed": { task: TaskDTO; completedAt: string };
  "task.deleted": { taskId: string; projectId?: string; goalId?: string };
  "task.overdue": { task: TaskDTO; daysOverdue: number };

  // Projects
  "project.created": { project: ProjectDTO };
  "project.updated": { project: ProjectDTO; updatedFields: string[] };
  "project.completed": { project: ProjectDTO; completedAt: string };
  "project.all_tasks_completed": { project: ProjectDTO };

  // Goals
  "goal.created": { goal: GoalDTO };
  "goal.progress_updated": {
    goal: GoalDTO;
    previousProgress: number;
    currentProgress: number;
  };
  "goal.completed": { goal: GoalDTO; completedAt: string };
  "goal.stagnant": { goal: GoalDTO; daysWithoutProgress: number };

  // Habits
  "habit.logged": {
    habit: HabitDTO;
    entry: HabitEntryDTO;
    streak: number;
  };
  "habit.streak_milestone": {
    habit: HabitDTO;
    streak: number;
  };

  // Finance
  "finance.transaction_created": { transaction: FinanceTransaction };
  "finance.budget_exceeded": {
    categoryId: string;
    budgetAmount: number;
    spentAmount: number;
  };

  // Content
  "content.status_changed": {
    content: ContentItemDTO;
    previousStatus: string;
    newStatus: string;
  };
  "content.published": {
    content: ContentItemDTO;
    publishedAt: string;
  };

  // AI
  "ai.action_confirmed": {
    actionId: string;
    toolName: string;
    parameters: Record<string, unknown>;
  };
  "ai.action_rejected": {
    actionId: string;
    toolName: string;
    reason?: string | null;
  };

  // Notifications
  "notification.created": {
    notification: NotificationDTO;
    silenced: boolean;
  };

  // System
  "system.morning_routine_due": {
    userId: string;
    date: string;
    targetHour: string;
  };
  "system.evening_review_due": {
    userId: string;
    date: string;
    targetHour: string;
  };

  // Calendar / TimeBlocks
  "timeblock.created": { timeBlock: TimeBlockDTO };
  "timeblock.updated": {
    timeBlock: TimeBlockDTO;
    updatedFields: string[];
  };
  "timeblock.deleted": { timeBlockId: string };

  // Integrations
  "integration.sync_completed": {
    connectionId: string;
    provider: string;
    status: string;
    itemsProcessed: number;
  };
  "integration.github_activity_ingested": {
    connectionId?: string;
    count: number;
    repo?: string;
  };
  "integration.backup_completed": {
    backupId: string;
    destination: string;
    sizeBytes: number;
    status: string;
  };
  "integration.webhook_received": {
    provider: string;
    eventType: string;
    payload: Record<string, unknown>;
  };
}

export type DomainEventName = keyof DomainEventMap;

export type DomainEvent<T extends DomainEventName> = BaseDomainEvent<
  T,
  DomainEventMap[T]
>;

export type AnyDomainEvent = {
  [K in DomainEventName]: DomainEvent<K>;
}[DomainEventName];

export type EventHandler<T extends DomainEventName> = (
  event: DomainEvent<T>
) => Promise<void> | void;

export type WildcardEventHandler = (
  event: AnyDomainEvent
) => Promise<void> | void;

export type UnsubscribeFn = () => void;

/**
 * Thrown when an event publication exceeds the maximum allowed cascade depth.
 */
export class RecursionLimitError extends Error {
  readonly status = 400;
  readonly code = "RECURSION_LIMIT_EXCEEDED";

  constructor(message = "Maximum event execution depth exceeded (depth >= 3)") {
    super(message);
    this.name = "RecursionLimitError";
  }
}

/**
 * Thrown when an event object fails required structural validation.
 */
export class InvalidEventError extends Error {
  readonly status = 400;
  readonly code = "INVALID_EVENT";

  constructor(message: string) {
    super(message);
    this.name = "InvalidEventError";
  }
}

import { AsyncLocalStorage } from "node:async_hooks";

export interface AmbientEventContext {
  depth?: number;
  correlationId?: string;
  actor?: string;
}

export const ambientEventStorage = new AsyncLocalStorage<AmbientEventContext>();

export function getAmbientEventContext(): AmbientEventContext | undefined {
  return ambientEventStorage.getStore();
}

export function runWithEventContext<R>(
  context: AmbientEventContext,
  fn: () => R
): R {
  return ambientEventStorage.run(context, fn);
}

/**
 * Type-safe builder function to construct domain events.
 */
export function createDomainEvent<T extends DomainEventName>(
  name: T,
  userId: string,
  payload: DomainEventMap[T],
  metadata?: BaseDomainEvent<T, DomainEventMap[T]>["metadata"]
): DomainEvent<T> {
  const ambient = getAmbientEventContext();
  const defaultDepth = ambient?.depth ?? 0;
  const defaultCorrelationId = ambient?.correlationId ?? crypto.randomUUID();
  const defaultActor = ambient?.actor;

  return {
    id: crypto.randomUUID(),
    name,
    userId,
    timestamp: new Date().toISOString(),
    payload,
    metadata: {
      depth: defaultDepth,
      correlationId: defaultCorrelationId,
      ...(defaultActor ? { actor: defaultActor } : {}),
      ...metadata,
    },
  };
}
