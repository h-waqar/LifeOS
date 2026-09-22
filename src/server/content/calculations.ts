import type {
  ContentPlatform,
  ChannelMetricsSummary,
  LeaderboardItemDTO,
} from "@/types";

export interface MetricInputs {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
}

/**
 * Calculates total engagements from granular interaction counts.
 * Negative input numbers are clamped to 0 to preserve data integrity.
 */
export function calculateTotalEngagements(inputs: MetricInputs): number {
  return (
    Math.max(0, inputs.likes || 0) +
    Math.max(0, inputs.comments || 0) +
    Math.max(0, inputs.shares || 0) +
    Math.max(0, inputs.saves || 0) +
    Math.max(0, inputs.clicks || 0)
  );
}

/**
 * Calculates engagement rate as a percentage rounded to 2 decimal places.
 * Returns 0.00 when views is 0 to prevent division by zero.
 * Formula: ((likes + comments + shares + saves + clicks) / views) * 100
 */
export function calculateEngagementRate(inputs: MetricInputs): number {
  const views = Math.max(0, inputs.views || 0);
  if (views === 0) return 0;

  const totalEngagements = calculateTotalEngagements(inputs);
  const rate = (totalEngagements / views) * 100;
  return Math.round(rate * 100) / 100;
}

/**
 * Aggregates performance by distribution platform.
 */
export function aggregateByPlatform(
  metrics: Array<{ platform: ContentPlatform } & MetricInputs>
): ChannelMetricsSummary[] {
  const platformGroups = new Map<
    ContentPlatform,
    {
      totalPosts: number;
      totalViews: number;
      totalEngagements: number;
    }
  >();

  for (const item of metrics) {
    const existing = platformGroups.get(item.platform) || {
      totalPosts: 0,
      totalViews: 0,
      totalEngagements: 0,
    };

    const views = Math.max(0, item.views || 0);
    const engagements = calculateTotalEngagements(item);

    existing.totalPosts += 1;
    existing.totalViews += views;
    existing.totalEngagements += engagements;

    platformGroups.set(item.platform, existing);
  }

  const result: ChannelMetricsSummary[] = [];

  for (const [platform, stats] of platformGroups.entries()) {
    const averageEngagementRate =
      stats.totalViews > 0
        ? Math.round((stats.totalEngagements / stats.totalViews) * 10000) / 100
        : 0;

    result.push({
      platform,
      totalPosts: stats.totalPosts,
      totalViews: stats.totalViews,
      totalEngagements: stats.totalEngagements,
      averageEngagementRate,
    });
  }

  // Sort by total engagements descending
  return result.sort((a, b) => b.totalEngagements - a.totalEngagements);
}

export interface PostCandidateForLeaderboard extends MetricInputs {
  contentItemId: string;
  publicationId: string;
  title: string;
  platform: ContentPlatform;
  publishedAt: string | null;
}

/**
 * Computes engagement rate for candidate posts and returns the top performing leaderboard.
 */
export function rankTopPosts(
  posts: PostCandidateForLeaderboard[],
  limit = 5
): LeaderboardItemDTO[] {
  const scored = posts.map((post) => {
    const totalEngagements = calculateTotalEngagements(post);
    const engagementRate = calculateEngagementRate(post);

    return {
      contentItemId: post.contentItemId,
      publicationId: post.publicationId,
      title: post.title,
      platform: post.platform,
      publishedAt: post.publishedAt,
      views: Math.max(0, post.views || 0),
      likes: Math.max(0, post.likes || 0),
      comments: Math.max(0, post.comments || 0),
      shares: Math.max(0, post.shares || 0),
      totalEngagements,
      engagementRate,
    };
  });

  // Sort descending by engagement rate, then by total engagements, then views
  scored.sort((a, b) => {
    if (b.engagementRate !== a.engagementRate) {
      return b.engagementRate - a.engagementRate;
    }
    if (b.totalEngagements !== a.totalEngagements) {
      return b.totalEngagements - a.totalEngagements;
    }
    return b.views - a.views;
  });

  return scored.slice(0, limit);
}
