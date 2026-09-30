import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db } from "@/server/db";
import { githubActivities, type GitHubActivity } from "@/server/db/schema";
import type {
  GitHubActivityDTO,
  QueryActivitiesInput,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: GitHub activity service cannot be initialized in the browser."
  );
}

export function toGitHubActivityDTO(row: GitHubActivity): GitHubActivityDTO {
  return {
    id: row.id,
    userId: row.userId,
    connectionId: row.connectionId,
    externalId: row.externalId,
    activityType: row.activityType as GitHubActivityDTO["activityType"],
    repository: row.repository,
    actor: row.actor,
    title: row.title,
    summary: row.summary,
    url: row.url,
    timestamp: row.timestamp.toISOString(),
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

export class GitHubActivityService {
  /**
   * Lists GitHub activities for a user with optional filtering by date, repository, and type.
   */
  async listActivities(
    userId: string,
    query: Partial<QueryActivitiesInput> = {}
  ): Promise<GitHubActivityDTO[]> {
    if (!userId?.trim()) return [];

    const conditions = [eq(githubActivities.userId, userId)];

    if (query.date) {
      const startOfDay = new Date(`${query.date}T00:00:00.000Z`);
      const endOfDay = new Date(`${query.date}T23:59:59.999Z`);
      conditions.push(gte(githubActivities.timestamp, startOfDay));
      conditions.push(lte(githubActivities.timestamp, endOfDay));
    } else {
      if (query.startDate) {
        conditions.push(gte(githubActivities.timestamp, new Date(query.startDate)));
      }
      if (query.endDate) {
        conditions.push(lte(githubActivities.timestamp, new Date(query.endDate)));
      }
    }

    if (query.repository) {
      conditions.push(eq(githubActivities.repository, query.repository));
    }

    if (query.activityType) {
      conditions.push(eq(githubActivities.activityType, query.activityType));
    }

    const rows = await db
      .select()
      .from(githubActivities)
      .where(and(...conditions))
      .orderBy(desc(githubActivities.timestamp))
      .limit(query.limit ?? 50);

    return rows.map(toGitHubActivityDTO);
  }

  /**
   * Retrieves GitHub activities for a specific calendar date (YYYY-MM-DD).
   * Used directly by the Daily Planning / Work Timeline view.
   */
  async getActivitiesForDate(
    userId: string,
    dateStr: string
  ): Promise<GitHubActivityDTO[]> {
    return this.listActivities(userId, { date: dateStr, limit: 100 });
  }

  /**
   * Calculates activity statistics over the last N days.
   */
  async getActivityStats(
    userId: string,
    days = 7
  ): Promise<{
    totalCommits: number;
    totalPRs: number;
    totalIssues: number;
    repos: string[];
  }> {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const activities = await this.listActivities(userId, {
      startDate: sinceDate.toISOString(),
      limit: 200,
    });

    let totalCommits = 0;
    let totalPRs = 0;
    let totalIssues = 0;
    const repoSet = new Set<string>();

    for (const a of activities) {
      repoSet.add(a.repository);
      if (a.activityType === "commit") totalCommits++;
      else if (a.activityType === "pull_request") totalPRs++;
      else if (a.activityType === "issue") totalIssues++;
    }

    return {
      totalCommits,
      totalPRs,
      totalIssues,
      repos: Array.from(repoSet),
    };
  }
}

export const githubActivityService = new GitHubActivityService();
