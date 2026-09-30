import { type ActionPreview } from "../tools/types";

export interface PendingActionDTO {
  id: string;
  conversationId: string;
  messageId: string | null;
  userId: string;
  toolName: string;
  riskLevel: "low" | "consequential" | "destructive";
  status: "pending" | "approved" | "rejected" | "executed" | "failed" | "expired";
  parameters: Record<string, unknown>;
  previewData: ActionPreview;
  expiresAt: string;
  executedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export class ActionNotFoundError extends Error {
  readonly status = 404;
  readonly code = "ACTION_NOT_FOUND";
  constructor(message = "Action not found") {
    super(message);
    this.name = "ActionNotFoundError";
  }
}

export class ActionForbiddenError extends Error {
  readonly status = 403;
  readonly code = "ACTION_FORBIDDEN";
  constructor(message = "You do not have permission to access this action") {
    super(message);
    this.name = "ActionForbiddenError";
  }
}

export class ActionConflictError extends Error {
  readonly status = 409;
  readonly code = "ACTION_CONFLICT";
  constructor(message = "Action is not in a pending state") {
    super(message);
    this.name = "ActionConflictError";
  }
}

export class ActionExpiredError extends Error {
  readonly status = 410;
  readonly code = "ACTION_EXPIRED";
  constructor(message = "Action has expired (5-minute TTL exceeded)") {
    super(message);
    this.name = "ActionExpiredError";
  }
}
