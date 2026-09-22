import { describe, it, expect } from "vitest";
import {
  calculateTotalEngagements,
  calculateEngagementRate,
  aggregateByPlatform,
  rankTopPosts,
  type MetricInputs,
} from "@/server/content/calculations";
import type { ContentPlatform } from "@/types";

describe("Phase 5 Plan 05-02: Content Calculations & Analytics Engine Unit Tests", () => {
  describe("1. calculateTotalEngagements", () => {
    it("sums likes, comments, shares, saves, and clicks", () => {
      const inputs: MetricInputs = {
        views: 1000,
        likes: 50,
        comments: 10,
        shares: 5,
        saves: 15,
        clicks: 20,
      };
      expect(calculateTotalEngagements(inputs)).toBe(100);
    });

    it("clamps negative interaction numbers to zero", () => {
      const inputs: MetricInputs = {
        views: 500,
        likes: -10,
        comments: 20,
        shares: -5,
        saves: 10,
        clicks: -1,
      };
      // -10 -> 0, 20 -> 20, -5 -> 0, 10 -> 10, -1 -> 0 => 30
      expect(calculateTotalEngagements(inputs)).toBe(30);
    });

    it("handles all zeroes gracefully", () => {
      const inputs: MetricInputs = {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        clicks: 0,
      };
      expect(calculateTotalEngagements(inputs)).toBe(0);
    });
  });

  describe("2. calculateEngagementRate", () => {
    it("returns 0.00 when views is 0 to prevent division by zero", () => {
      const inputs: MetricInputs = {
        views: 0,
        likes: 10,
        comments: 5,
        shares: 2,
        saves: 1,
        clicks: 3,
      };
      expect(calculateEngagementRate(inputs)).toBe(0);
    });

    it("returns 0.00 when views is negative", () => {
      const inputs: MetricInputs = {
        views: -100,
        likes: 10,
        comments: 5,
        shares: 2,
        saves: 1,
        clicks: 3,
      };
      expect(calculateEngagementRate(inputs)).toBe(0);
    });

    it("computes accurate rate rounded to 2 decimal places", () => {
      // 100 engagements / 1500 views * 100 = 6.66666...% -> 6.67%
      const inputs: MetricInputs = {
        views: 1500,
        likes: 60,
        comments: 20,
        shares: 10,
        saves: 5,
        clicks: 5,
      };
      expect(calculateEngagementRate(inputs)).toBe(6.67);
    });

    it("computes integer rates accurately", () => {
      // 50 engagements / 1000 views * 100 = 5.0% -> 5
      const inputs: MetricInputs = {
        views: 1000,
        likes: 30,
        comments: 10,
        shares: 5,
        saves: 3,
        clicks: 2,
      };
      expect(calculateEngagementRate(inputs)).toBe(5);
    });
  });

  describe("3. aggregateByPlatform", () => {
    it("aggregates views, engagements, and computes weighted engagement rate", () => {
      const items: Array<{ platform: ContentPlatform } & MetricInputs> = [
        {
          platform: "twitter",
          views: 1000,
          likes: 40,
          comments: 10,
          shares: 5,
          saves: 0,
          clicks: 5, // total: 60 eng
        },
        {
          platform: "twitter",
          views: 2000,
          likes: 80,
          comments: 20,
          shares: 10,
          saves: 0,
          clicks: 10, // total: 120 eng
        },
        {
          platform: "linkedin",
          views: 500,
          likes: 25,
          comments: 5,
          shares: 0,
          saves: 5,
          clicks: 5, // total: 40 eng
        },
      ];

      const result = aggregateByPlatform(items);

      const twitter = result.find((r) => r.platform === "twitter");
      expect(twitter).toBeDefined();
      expect(twitter?.totalPosts).toBe(2);
      expect(twitter?.totalViews).toBe(3000);
      expect(twitter?.totalEngagements).toBe(180);
      // (180 / 3000) * 100 = 6.00%
      expect(twitter?.averageEngagementRate).toBe(6);

      const linkedin = result.find((r) => r.platform === "linkedin");
      expect(linkedin).toBeDefined();
      expect(linkedin?.totalPosts).toBe(1);
      expect(linkedin?.totalViews).toBe(500);
      expect(linkedin?.totalEngagements).toBe(40);
      // (40 / 500) * 100 = 8.00%
      expect(linkedin?.averageEngagementRate).toBe(8);
    });

    it("returns empty array for empty inputs", () => {
      expect(aggregateByPlatform([])).toEqual([]);
    });
  });

  describe("4. rankTopPosts", () => {
    it("ranks posts descending by engagement rate and breaks ties with engagements", () => {
      const posts = [
        {
          contentItemId: "item-1",
          publicationId: "pub-1",
          title: "Post 1 (High Rate)",
          platform: "twitter" as ContentPlatform,
          publishedAt: "2026-09-01T10:00:00Z",
          views: 1000,
          likes: 100,
          comments: 0,
          shares: 0,
          saves: 0,
          clicks: 0, // 10%
        },
        {
          contentItemId: "item-2",
          publicationId: "pub-2",
          title: "Post 2 (Low Rate)",
          platform: "linkedin" as ContentPlatform,
          publishedAt: "2026-09-02T10:00:00Z",
          views: 2000,
          likes: 40,
          comments: 0,
          shares: 0,
          saves: 0,
          clicks: 0, // 2%
        },
        {
          contentItemId: "item-3",
          publicationId: "pub-3",
          title: "Post 3 (Mid Rate)",
          platform: "blog" as ContentPlatform,
          publishedAt: "2026-09-03T10:00:00Z",
          views: 1000,
          likes: 50,
          comments: 0,
          shares: 0,
          saves: 0,
          clicks: 0, // 5%
        },
      ];

      const ranked = rankTopPosts(posts);
      expect(ranked[0].title).toBe("Post 1 (High Rate)");
      expect(ranked[0].engagementRate).toBe(10);
      expect(ranked[1].title).toBe("Post 3 (Mid Rate)");
      expect(ranked[1].engagementRate).toBe(5);
      expect(ranked[2].title).toBe("Post 2 (Low Rate)");
      expect(ranked[2].engagementRate).toBe(2);
    });

    it("limits results to specified limit", () => {
      const posts = Array.from({ length: 10 }, (_, i) => ({
        contentItemId: `item-${i}`,
        publicationId: `pub-${i}`,
        title: `Post ${i}`,
        platform: "twitter" as ContentPlatform,
        publishedAt: null,
        views: 100,
        likes: i,
        comments: 0,
        shares: 0,
        saves: 0,
        clicks: 0,
      }));

      const top3 = rankTopPosts(posts, 3);
      expect(top3.length).toBe(3);
      expect(top3[0].title).toBe("Post 9");
    });
  });
});
