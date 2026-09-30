import { eq, and, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  integrationConnections,
  githubActivities,
  syncLogs,
  type NewGitHubActivity,
} from "@/server/db/schema";
import { eventBus } from "@/server/events/event-bus";
import { createDomainEvent } from "@/server/events/types";
import { GitHubClient, GitHubRateLimitError, GitHubAuthError } from "./client";
import { githubService } from "./service";
import type {
  GitHubRawEvent,
  GitHubSyncResult,
  SyncGitHubInput,
  GitHubActivityType,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: GitHub sync engine cannot be initialized in the browser."
  );
}

export class GitHubSyncEngine {
  /**
   * Performs an incremental activity synchronization against the GitHub API.
   * Ingests commits, PRs, and issues into github_activities.
   */
  async sync(userId: string, options: Partial<SyncGitHubInput> = {}): Promise<GitHubSyncResult> {
    const startedAt = new Date();
    const token = await githubService.getDecryptedToken(userId);

    if (!token) {
      return {
        status: "failed",
        itemsProcessed: 0,
        itemsCreated: 0,
        itemsSkipped: 0,
        errorMessage: "No active GitHub connection or decrypted token found",
      };
    }

    // 1. Fetch connection details
    const [conn] = await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "github")
        )
      )
      .limit(1);

    if (!conn) {
      return {
        status: "failed",
        itemsProcessed: 0,
        itemsCreated: 0,
        itemsSkipped: 0,
        errorMessage: "GitHub connection not found",
      };
    }

    const metadata = (conn.metadata || {}) as Record<string, unknown>;
    const username = (metadata.username as string) || conn.externalAccountId;

    if (!username) {
      return {
        status: "failed",
        itemsProcessed: 0,
        itemsCreated: 0,
        itemsSkipped: 0,
        errorMessage: "GitHub username missing in connection metadata",
      };
    }

    const client = new GitHubClient({ token });
    let rawEvents: GitHubRawEvent[] = [];
    let newEtag: string | undefined;

    try {
      const etag = options.forceFull ? undefined : (metadata.lastETag as string | undefined);
      const eventsRes = await client.getUserEvents(username, {
        perPage: 100,
        etag,
      });

      rawEvents = eventsRes.events;
      newEtag = eventsRes.etag;
    } catch (err: any) {
      if (err instanceof GitHubRateLimitError) {
        await this.logSyncRecord(userId, conn.id, "failed", 0, 0, 0, err.message, startedAt);
        return {
          status: "failed",
          itemsProcessed: 0,
          itemsCreated: 0,
          itemsSkipped: 0,
          errorMessage: err.message,
          rateLimitReset: Math.floor(err.resetAt.getTime() / 1000),
        };
      }

      if (err instanceof GitHubAuthError) {
        // Mark connection as expired/error
        await db
          .update(integrationConnections)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(integrationConnections.id, conn.id));

        await this.logSyncRecord(userId, conn.id, "failed", 0, 0, 0, err.message, startedAt);
        return {
          status: "failed",
          itemsProcessed: 0,
          itemsCreated: 0,
          itemsSkipped: 0,
          errorMessage: err.message,
        };
      }

      await this.logSyncRecord(userId, conn.id, "failed", 0, 0, 0, err.message, startedAt);
      return {
        status: "failed",
        itemsProcessed: 0,
        itemsCreated: 0,
        itemsSkipped: 0,
        errorMessage: err.message || "Failed to fetch GitHub events",
      };
    }

    // 2. Parse and normalize activities
    const candidateActivities: NewGitHubActivity[] = [];

    for (const event of rawEvents) {
      const parsedList = this.normalizeEvent(userId, conn.id, event);
      candidateActivities.push(...parsedList);
    }

    // Filter by since date if specified
    const sinceDateStr = options.since || (options.forceFull ? undefined : (metadata.lastSyncAt as string | undefined));
    const filteredActivities = sinceDateStr
      ? candidateActivities.filter((a) => new Date(a.timestamp) >= new Date(sinceDateStr))
      : candidateActivities;

    // 3. Batch insert with conflict resolution (idempotency via unique(userId, externalId))
    let itemsCreated = 0;
    let itemsSkipped = 0;

    for (const item of filteredActivities) {
      try {
        const [inserted] = await db
          .insert(githubActivities)
          .values(item)
          .onConflictDoNothing({
            target: [githubActivities.userId, githubActivities.externalId],
          })
          .returning();

        if (inserted) {
          itemsCreated++;
        } else {
          itemsSkipped++;
        }
      } catch (err: any) {
        itemsSkipped++;
      }
    }

    // 4. Update connection metadata
    const latestEvent = rawEvents[0];
    const updatedMetadata: Record<string, unknown> = {
      ...metadata,
      lastSyncAt: startedAt.toISOString(),
      lastEventId: latestEvent ? latestEvent.id : (metadata.lastEventId ?? null),
      lastETag: newEtag ?? (metadata.lastETag ?? null),
    };

    await db
      .update(integrationConnections)
      .set({
        metadata: updatedMetadata,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, conn.id));

    // 5. Emit domain event if new activity was ingested
    if (itemsCreated > 0) {
      await eventBus.publish(
        createDomainEvent("integration.github_activity_ingested", userId, {
          connectionId: conn.id,
          count: itemsCreated,
          repo: filteredActivities[0]?.repository,
        })
      );
    }

    // 6. Record sync log
    await this.logSyncRecord(
      userId,
      conn.id,
      "success",
      filteredActivities.length,
      itemsCreated,
      itemsSkipped,
      null,
      startedAt
    );

    return {
      status: "success",
      itemsProcessed: filteredActivities.length,
      itemsCreated,
      itemsSkipped,
    };
  }

  /**
   * Normalizes a GitHub REST/Events API event into one or more NewGitHubActivity records.
   */
  normalizeEvent(
    userId: string,
    connectionId: string,
    event: GitHubRawEvent
  ): NewGitHubActivity[] {
    const results: NewGitHubActivity[] = [];
    const timestamp = new Date(event.created_at);
    const repo = event.repo.name;
    const actor = event.actor.login;

    switch (event.type) {
      case "PushEvent": {
        const commits = event.payload.commits || [];
        const ref = event.payload.ref || "";
        const branch = ref.replace(/^refs\/heads\//, "");

        if (commits.length === 0) {
          // Push event without specific commit list (e.g. tag or empty push)
          results.push({
            userId,
            connectionId,
            externalId: `push_${event.id}`,
            activityType: "commit",
            repository: repo,
            actor,
            title: `Pushed to ${branch || repo}`,
            summary: `Push event with ${event.payload.size || 1} commit(s)`,
            url: `https://github.com/${repo}`,
            timestamp,
            metadata: {
              eventId: event.id,
              ref,
              branch,
              size: event.payload.size,
            },
          });
        } else {
          for (const commit of commits) {
            const shortSha = commit.sha.slice(0, 7);
            const firstLine = (commit.message || "").split("\n")[0];
            results.push({
              userId,
              connectionId,
              externalId: commit.sha,
              activityType: "commit",
              repository: repo,
              actor: commit.author?.name || actor,
              title: firstLine || `Commit ${shortSha}`,
              summary: commit.message || null,
              url: commit.url
                ? commit.url.replace("api.github.com/repos", "github.com").replace("/commits/", "/commit/")
                : `https://github.com/${repo}/commit/${commit.sha}`,
              timestamp,
              metadata: {
                sha: commit.sha,
                shortSha,
                branch,
                author: commit.author,
              },
            });
          }
        }
        break;
      }

      case "PullRequestEvent": {
        const pr = event.payload.pull_request;
        const action = event.payload.action || "opened";
        const prNumber = pr?.number ?? event.payload.number;
        const prTitle = pr?.title || `Pull Request #${prNumber}`;

        results.push({
          userId,
          connectionId,
          externalId: `pr_${pr?.id || event.id}`,
          activityType: "pull_request",
          repository: repo,
          actor,
          title: `PR #${prNumber}: ${prTitle}`,
          summary: `${action.toUpperCase()}: ${pr?.body?.slice(0, 300) || "No description"}`,
          url: pr?.html_url || `https://github.com/${repo}/pull/${prNumber}`,
          timestamp,
          metadata: {
            prNumber,
            action,
            state: pr?.state,
            merged: pr?.merged,
          },
        });
        break;
      }

      case "IssuesEvent": {
        const issue = event.payload.issue;
        const action = event.payload.action || "opened";
        const issueNumber = issue?.number ?? event.payload.number;
        const issueTitle = issue?.title || `Issue #${issueNumber}`;

        results.push({
          userId,
          connectionId,
          externalId: `issue_${issue?.id || event.id}`,
          activityType: "issue",
          repository: repo,
          actor,
          title: `Issue #${issueNumber}: ${issueTitle}`,
          summary: `${action.toUpperCase()}: ${issue?.body?.slice(0, 300) || "No description"}`,
          url: issue?.html_url || `https://github.com/${repo}/issues/${issueNumber}`,
          timestamp,
          metadata: {
            issueNumber,
            action,
            state: issue?.state,
          },
        });
        break;
      }

      case "ReleaseEvent": {
        const release = event.payload.release;
        results.push({
          userId,
          connectionId,
          externalId: `release_${release?.id || event.id}`,
          activityType: "release",
          repository: repo,
          actor,
          title: `Release ${release?.name || release?.tag_name || "New Release"}`,
          summary: release?.body?.slice(0, 300) || null,
          url: release?.html_url || `https://github.com/${repo}/releases`,
          timestamp,
          metadata: {
            tagName: release?.tag_name,
            prerelease: release?.prerelease,
          },
        });
        break;
      }

      case "PullRequestReviewEvent": {
        const pr = event.payload.pull_request;
        const review = event.payload.review;
        const prNumber = pr?.number;

        results.push({
          userId,
          connectionId,
          externalId: `review_${review?.id || event.id}`,
          activityType: "review",
          repository: repo,
          actor,
          title: `Reviewed PR #${prNumber}: ${pr?.title || ""}`,
          summary: review?.state ? `State: ${review.state}` : null,
          url: review?.html_url || pr?.html_url,
          timestamp,
          metadata: {
            prNumber,
            state: review?.state,
          },
        });
        break;
      }

      default:
        // Ignore unhandled event types (WatchEvent, ForkEvent, etc.) for daily timeline clarity
        break;
    }

    return results;
  }

  /**
   * Ingests an inbound webhook payload directly into github_activities.
   */
  async ingestWebhookEvent(
    userId: string,
    eventType: string,
    payload: Record<string, any>
  ): Promise<number> {
    const rawEvent: GitHubRawEvent = {
      id: payload.deliveryId || crypto.randomUUID(),
      type: this.mapWebhookTypeToEventType(eventType),
      actor: {
        id: payload.sender?.id || 0,
        login: payload.sender?.login || "github",
        avatar_url: payload.sender?.avatar_url || "",
      },
      repo: {
        id: payload.repository?.id || 0,
        name: payload.repository?.full_name || payload.repository?.name || "unknown",
        url: payload.repository?.html_url || "",
      },
      payload,
      public: !payload.repository?.private,
      created_at: new Date().toISOString(),
    };

    const items = this.normalizeEvent(userId, "", rawEvent);
    let createdCount = 0;

    for (const item of items) {
      try {
        const [inserted] = await db
          .insert(githubActivities)
          .values({
            ...item,
            connectionId: null, // webhook may arrive without connection
          })
          .onConflictDoNothing({
            target: [githubActivities.userId, githubActivities.externalId],
          })
          .returning();

        if (inserted) {
          createdCount++;
        }
      } catch {
        // Ignored
      }
    }

    if (createdCount > 0) {
      await eventBus.publish(
        createDomainEvent("integration.github_activity_ingested", userId, {
          count: createdCount,
          repo: rawEvent.repo.name,
        })
      );
    }

    return createdCount;
  }

  private mapWebhookTypeToEventType(webhookType: string): string {
    switch (webhookType) {
      case "push":
        return "PushEvent";
      case "pull_request":
        return "PullRequestEvent";
      case "issues":
        return "IssuesEvent";
      case "release":
        return "ReleaseEvent";
      case "pull_request_review":
        return "PullRequestReviewEvent";
      default:
        return webhookType;
    }
  }

  private async logSyncRecord(
    userId: string,
    connectionId: string,
    status: "success" | "partial" | "failed",
    processed: number,
    created: number,
    skipped: number,
    error: string | null,
    startedAt: Date
  ): Promise<void> {
    try {
      await db.insert(syncLogs).values({
        userId,
        connectionId,
        provider: "github",
        syncType: "incremental",
        status,
        itemsProcessed: processed,
        itemsCreated: created,
        itemsUpdated: 0,
        itemsDeleted: 0,
        itemsFailed: status === "failed" ? 1 : 0,
        errorMessage: error,
        startedAt,
        completedAt: new Date(),
      });
    } catch {
      // Non-fatal
    }
  }
}

export const githubSyncEngine = new GitHubSyncEngine();
