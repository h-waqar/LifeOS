import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContentAnalyticsView } from "@/components/content/content-analytics-view";
import type { ContentAnalyticsDTO } from "@/types";

const mockAnalyticsData: ContentAnalyticsDTO = {
  totalViews: 45000,
  totalEngagements: 4500,
  averageEngagementRate: 10.0,
  publishedCount: 12,
  channelBreakdown: [
    {
      platform: "twitter",
      totalPosts: 8,
      totalViews: 25000,
      totalEngagements: 2500,
      averageEngagementRate: 10.0,
    },
    {
      platform: "linkedin",
      totalPosts: 3,
      totalViews: 15000,
      totalEngagements: 1800,
      averageEngagementRate: 12.0,
    },
    {
      platform: "blog",
      totalPosts: 1,
      totalViews: 5000,
      totalEngagements: 200,
      averageEngagementRate: 4.0,
    },
  ],
  leaderboard: [
    {
      contentItemId: "item-lead-1",
      publicationId: "pub-lead-1",
      title: "Top Post Architecture",
      platform: "linkedin",
      views: 10000,
      likes: 800,
      comments: 200,
      shares: 100,
      totalEngagements: 1200,
      engagementRate: 12.0,
      publishedAt: "2026-10-10T10:00:00.000Z",
    },
    {
      contentItemId: "item-lead-2",
      publicationId: "pub-lead-2",
      title: "Viral Dev Thread",
      platform: "twitter",
      views: 20000,
      likes: 1500,
      comments: 300,
      shares: 200,
      totalEngagements: 2000,
      engagementRate: 10.0,
      publishedAt: "2026-10-12T10:00:00.000Z",
    },
  ],
};

describe("Phase 5 Plan 05-02: ContentAnalyticsView Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Renders analytics header, time filters, and summary KPI cards", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockAnalyticsData }),
    });

    render(<ContentAnalyticsView />);

    expect(screen.getByTestId("content-analytics-view")).toBeDefined();
    expect(screen.getByText("Content Performance Analytics")).toBeDefined();
    expect(screen.getByTestId("filter-all-time")).toBeDefined();
    expect(screen.getByTestId("filter-30-days")).toBeDefined();
    expect(screen.getByTestId("filter-7-days")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId("total-views-stat").textContent).toContain("45,000");
      expect(screen.getByTestId("total-engagements-stat").textContent).toContain("4,500");
      expect(screen.getByTestId("avg-engagement-rate-stat").textContent).toContain("10.00%");
    });
  });

  it("2. Renders platform breakdown channel cards and top posts leaderboard", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockAnalyticsData }),
    });

    render(<ContentAnalyticsView />);

    await waitFor(() => {
      expect(screen.getByText("Top Post Architecture")).toBeDefined();
      expect(screen.getByText("Viral Dev Thread")).toBeDefined();
    });

    expect(screen.getByText("Channel Performance Comparison")).toBeDefined();
    expect(screen.getByText("Top Performing Content Leaderboard")).toBeDefined();
  });

  it("3. Triggers updated query when time filter is changed", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockAnalyticsData }),
    });
    global.fetch = mockFetch;

    render(<ContentAnalyticsView />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/content/analytics");
    });

    const filter30d = screen.getByTestId("filter-30-days");
    fireEvent.click(filter30d);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/content/analytics?startDate=")
      );
    });
  });
});
