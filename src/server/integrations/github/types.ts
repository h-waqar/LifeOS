import { z } from "zod";

export type GitHubActivityType =
  | "commit"
  | "pull_request"
  | "issue"
  | "review"
  | "release";

export interface GitHubActivityDTO {
  id: string;
  userId: string;
  connectionId: string | null;
  externalId: string;
  activityType: GitHubActivityType;
  repository: string;
  actor: string;
  title: string;
  summary: string | null;
  url: string | null;
  timestamp: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface GitHubConnectionDTO {
  connected: boolean;
  status: "connected" | "disconnected" | "error" | "expired";
  username: string | null;
  avatarUrl: string | null;
  repos: string[];
  lastSyncAt: string | null;
  lastEventId: string | null;
  error?: string | null;
}

export interface GitHubSyncResult {
  status: "success" | "partial" | "failed";
  itemsProcessed: number;
  itemsCreated: number;
  itemsSkipped: number;
  errorMessage?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  html_url: string;
}

export interface GitHubRawEvent {
  id: string;
  type: string;
  actor: {
    id: number;
    login: string;
    display_login?: string;
    avatar_url: string;
  };
  repo: {
    id: number;
    name: string;
    url: string;
  };
  payload: Record<string, any>;
  public: boolean;
  created_at: string;
}

export const connectGitHubSchema = z.object({
  token: z.string().min(1, "Personal access token or OAuth token is required"),
  repos: z.array(z.string().min(1)).optional().default([]),
  webhookSecret: z.string().optional(),
});

export type ConnectGitHubInput = z.infer<typeof connectGitHubSchema>;

export const syncGitHubSchema = z.object({
  since: z.string().optional(),
  repos: z.array(z.string()).optional(),
  forceFull: z.boolean().optional().default(false),
});

export type SyncGitHubInput = z.infer<typeof syncGitHubSchema>;

export const queryActivitiesSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format").optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  repository: z.string().optional(),
  activityType: z.enum(["commit", "pull_request", "issue", "review", "release"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export type QueryActivitiesInput = z.infer<typeof queryActivitiesSchema>;
