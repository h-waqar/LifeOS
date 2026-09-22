import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  contentPublications,
  contentMetrics,
  contentItems,
  type ContentMetric,
} from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";
import {
  logMetricsSchema,
  analyticsQuerySchema,
} from "./validation";
import {
  calculateEngagementRate,
  calculateTotalEngagements,
  aggregateByPlatform,
  rankTopPosts,
  type PostCandidateForLeaderboard,
} from "./calculations";
import { NotFoundError } from "./service";
import type {
  ContentMetricDTO,
  ContentAnalyticsDTO,
  ContentPlatform,
} from "@/types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Metrics service cannot be initialized in the browser."
  );
}

function mapMetricToDTO(m: ContentMetric): ContentMetricDTO {
  return {
    id: m.id,
    userId: m.userId,
    publicationId: m.publicationId,
    contentItemId: m.contentItemId,
    views: m.views,
    likes: m.likes,
    comments: m.comments,
    shares: m.shares,
    saves: m.saves,
    clicks: m.clicks,
    engagementRate: Number(m.engagementRate),
    notes: m.notes,
    recordedAt: new Date(m.recordedAt).toISOString(),
    createdAt: new Date(m.createdAt).toISOString(),
    updatedAt: new Date(m.updatedAt).toISOString(),
  };
}

/**
 * Logs a timestamped snapshot of performance metrics for a published piece.
 */
export async function logMetrics(
  userId: string,
  publicationId: string,
  input: unknown
): Promise<ContentMetricDTO> {
  if (!userId) throw new AuthorizationError("User ID required");

  const data = logMetricsSchema.parse(input);

  // Verify publication exists and belongs to user
  const [pub] = await db
    .select()
    .from(contentPublications)
    .where(
      and(
        eq(contentPublications.userId, userId),
        eq(contentPublications.id, publicationId)
      )
    )
    .limit(1);

  if (!pub) {
    throw new NotFoundError(`Publication ${publicationId} not found.`);
  }

  const engagementRate = calculateEngagementRate(data);
  const recordedAt = data.recordedAt ? new Date(data.recordedAt) : new Date();

  const [metric] = await db
    .insert(contentMetrics)
    .values({
      userId,
      publicationId,
      contentItemId: pub.contentItemId,
      views: data.views,
      likes: data.likes,
      comments: data.comments,
      shares: data.shares,
      saves: data.saves,
      clicks: data.clicks,
      engagementRate: engagementRate.toFixed(2),
      notes: data.notes || null,
      recordedAt,
    })
    .returning();

  await createAuditLog({
    userId,
    category: "mutation",
    action: "content.log_metrics",
    status: "success",
    details: {
      publicationId,
      contentItemId: pub.contentItemId,
      views: data.views,
      likes: data.likes,
      engagementRate,
    },
  });

  return mapMetricToDTO(metric);
}

/**
 * Retrieves the performance metrics history recorded for a publication.
 */
export async function getMetricsHistory(
  userId: string,
  publicationId: string
): Promise<ContentMetricDTO[]> {
  if (!userId) throw new AuthorizationError("User ID required");

  // Verify publication exists and belongs to user
  const [pub] = await db
    .select({ id: contentPublications.id })
    .from(contentPublications)
    .where(
      and(
        eq(contentPublications.userId, userId),
        eq(contentPublications.id, publicationId)
      )
    )
    .limit(1);

  if (!pub) {
    throw new NotFoundError(`Publication ${publicationId} not found.`);
  }

  const rows = await db
    .select()
    .from(contentMetrics)
    .where(
      and(
        eq(contentMetrics.userId, userId),
        eq(contentMetrics.publicationId, publicationId)
      )
    )
    .orderBy(desc(contentMetrics.recordedAt));

  return rows.map(mapMetricToDTO);
}

/**
 * Computes aggregated content analytics across publications within an optional date window.
 */
export async function getAggregateAnalytics(
  userId: string,
  params?: unknown
): Promise<ContentAnalyticsDTO> {
  if (!userId) throw new AuthorizationError("User ID required");

  const query = analyticsQuerySchema.parse(params ?? {});

  const conditions = [
    eq(contentPublications.userId, userId),
    eq(contentPublications.status, "published"),
  ];

  if (query.startDate) {
    conditions.push(
      gte(contentPublications.publishedAt, new Date(`${query.startDate}T00:00:00.000Z`))
    );
  }

  if (query.endDate) {
    conditions.push(
      lte(contentPublications.publishedAt, new Date(`${query.endDate}T23:59:59.999Z`))
    );
  }

  // Fetch published publications joined with content item title
  const publications = await db
    .select({
      pub: contentPublications,
      title: contentItems.title,
    })
    .from(contentPublications)
    .innerJoin(
      contentItems,
      and(
        eq(contentPublications.contentItemId, contentItems.id),
        eq(contentPublications.userId, contentItems.userId)
      )
    )
    .where(and(...conditions))
    .orderBy(desc(contentPublications.publishedAt));

  // For each publication, find its latest recorded metric
  const candidates: PostCandidateForLeaderboard[] = [];
  let totalViews = 0;
  let totalEngagements = 0;

  for (const { pub, title } of publications) {
    const [latestMetric] = await db
      .select()
      .from(contentMetrics)
      .where(
        and(
          eq(contentMetrics.userId, userId),
          eq(contentMetrics.publicationId, pub.id)
        )
      )
      .orderBy(desc(contentMetrics.recordedAt))
      .limit(1);

    const inputs = {
      views: latestMetric?.views ?? 0,
      likes: latestMetric?.likes ?? 0,
      comments: latestMetric?.comments ?? 0,
      shares: latestMetric?.shares ?? 0,
      saves: latestMetric?.saves ?? 0,
      clicks: latestMetric?.clicks ?? 0,
    };

    const engagements = calculateTotalEngagements(inputs);
    totalViews += inputs.views;
    totalEngagements += engagements;

    candidates.push({
      contentItemId: pub.contentItemId,
      publicationId: pub.id,
      title,
      platform: pub.platform as ContentPlatform,
      publishedAt: pub.publishedAt ? new Date(pub.publishedAt).toISOString() : null,
      ...inputs,
    });
  }

  const averageEngagementRate =
    totalViews > 0
      ? Math.round((totalEngagements / totalViews) * 10000) / 100
      : 0;

  const channelBreakdown = aggregateByPlatform(
    candidates.map((c) => ({
      platform: c.platform,
      views: c.views,
      likes: c.likes,
      comments: c.comments,
      shares: c.shares,
      saves: c.saves,
      clicks: c.clicks,
    }))
  );

  const leaderboard = rankTopPosts(candidates, 5);

  return {
    totalViews,
    totalEngagements,
    averageEngagementRate,
    publishedCount: publications.length,
    channelBreakdown,
    leaderboard,
  };
}
