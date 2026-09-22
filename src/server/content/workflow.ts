import type { ContentStatus } from "@/types";

/**
 * Strict Workflow State Machine Transition Matrix
 * Governs lifecycle: idea -> draft -> in_review -> scheduled -> published -> archived
 */
export const ALLOWED_TRANSITIONS: Record<ContentStatus, readonly ContentStatus[]> = {
  idea: ["draft", "archived"],
  draft: ["in_review", "idea", "scheduled", "archived"],
  in_review: ["draft", "scheduled", "published", "archived"],
  scheduled: ["in_review", "draft", "published", "archived"],
  published: ["archived", "in_review"], // in_review allowed for post-publication revisions
  archived: ["idea", "draft", "in_review", "scheduled", "published"], // restoration to any state
} as const;

/**
 * Checks whether a direct transition from `currentStatus` to `targetStatus` is permitted.
 */
export function canTransition(
  currentStatus: ContentStatus,
  targetStatus: ContentStatus
): boolean {
  if (currentStatus === targetStatus) return true;
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.includes(targetStatus);
}

export interface TransitionValidationItem {
  status: ContentStatus;
  scheduledAt?: Date | string | null;
  publishedAt?: Date | string | null;
}

export interface TransitionOptions {
  scheduledAt?: string | null;
  publishedAt?: string | null;
  variantsCount?: number;
}

export interface TransitionValidationResult {
  valid: boolean;
  error?: string;
  updateFields?: {
    status: ContentStatus;
    scheduledAt?: Date | null;
    publishedAt?: Date | null;
    isArchived: boolean;
  };
}

/**
 * Validates a status transition against the state machine and invariant guards.
 * Returns updated fields including timestamps and archival status.
 */
export function validateStatusTransition(
  item: TransitionValidationItem,
  targetStatus: ContentStatus,
  options: TransitionOptions = {}
): TransitionValidationResult {
  const current = item.status;

  // 1. Matrix check
  if (!canTransition(current, targetStatus)) {
    return {
      valid: false,
      error: `Invalid content status transition from '${current}' to '${targetStatus}'.`,
    };
  }

  // 2. Guard for 'scheduled':
  // Must have a valid target scheduled datetime AND at least 1 variant
  if (targetStatus === "scheduled") {
    const effectiveScheduledAt =
      options.scheduledAt !== undefined ? options.scheduledAt : item.scheduledAt;

    if (!effectiveScheduledAt) {
      return {
        valid: false,
        error: "Cannot transition content to 'scheduled' without a target scheduled date/time.",
      };
    }

    const scheduledDate = new Date(effectiveScheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return {
        valid: false,
        error: "Invalid scheduledAt timestamp format.",
      };
    }

    const variantsCount = options.variantsCount ?? 0;
    if (variantsCount <= 0) {
      return {
        valid: false,
        error: "Cannot schedule content without at least one authored platform variant.",
      };
    }
  }

  // 3. Compute field updates
  let newScheduledAt: Date | null = null;
  if (options.scheduledAt !== undefined) {
    newScheduledAt = options.scheduledAt ? new Date(options.scheduledAt) : null;
  } else if (item.scheduledAt) {
    newScheduledAt = new Date(item.scheduledAt);
  }

  let newPublishedAt: Date | null = null;
  if (targetStatus === "published") {
    // If transitioning to published, stamp publishedAt (or use provided timestamp)
    newPublishedAt = options.publishedAt ? new Date(options.publishedAt) : new Date();
  } else if (options.publishedAt !== undefined) {
    newPublishedAt = options.publishedAt ? new Date(options.publishedAt) : null;
  } else if (item.publishedAt) {
    newPublishedAt = new Date(item.publishedAt);
  }

  const isArchived = targetStatus === "archived";

  return {
    valid: true,
    updateFields: {
      status: targetStatus,
      scheduledAt: newScheduledAt,
      publishedAt: newPublishedAt,
      isArchived,
    },
  };
}
