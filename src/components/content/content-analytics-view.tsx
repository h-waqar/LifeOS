"use client";

import * as React from "react";
import {
  Eye,
  TrendingUp,
  Heart,
  Send,
  Award,
  Layers,
  Filter,
  BarChart3,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPlatformBadge } from "./content-card";
import type { ContentAnalyticsDTO } from "@/types";

export function ContentAnalyticsView() {
  const [dateFilter, setDateFilter] = React.useState<"all" | "30d" | "7d">("all");
  const [data, setData] = React.useState<ContentAnalyticsDTO | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchAnalytics = React.useCallback(async () => {
    setIsLoading(true);
    try {
      let query = "";
      if (dateFilter === "30d") {
        const start = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
        const end = new Date().toISOString().split("T")[0];
        query = `?startDate=${start}&endDate=${end}`;
      } else if (dateFilter === "7d") {
        const start = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
        const end = new Date().toISOString().split("T")[0];
        query = `?startDate=${start}&endDate=${end}`;
      }

      const res = await fetch(`/api/content/analytics${query}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } catch (err) {
      console.error("Failed to load content analytics:", err);
    } finally {
      setIsLoading(false);
    }
  }, [dateFilter]);

  React.useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return (
    <div className="space-y-6" data-testid="content-analytics-view">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span>Content Performance Analytics</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verified engagement rates and reach across all distribution channels.
          </p>
        </div>

        <div className="flex items-center border border-border rounded-lg p-0.5 bg-muted/40 text-xs">
          <Button
            variant={dateFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setDateFilter("all")}
            data-testid="filter-all-time"
          >
            All Time
          </Button>
          <Button
            variant={dateFilter === "30d" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setDateFilter("30d")}
            data-testid="filter-30-days"
          >
            Past 30 Days
          </Button>
          <Button
            variant={dateFilter === "7d" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setDateFilter("7d")}
            data-testid="filter-7-days"
          >
            Past 7 Days
          </Button>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="analytics-summary-cards">
        {/* Card 1: Total Reach / Views */}
        <div className="bg-card p-4 rounded-xl border border-border space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <span>Total Impressions</span>
            <Eye className="h-4 w-4 text-sky-500" />
          </div>
          <div className="text-2xl font-bold text-foreground" data-testid="total-views-stat">
            {(data?.totalViews || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-muted-foreground">Combined organic impressions</p>
        </div>

        {/* Card 2: Total Engagements */}
        <div className="bg-card p-4 rounded-xl border border-border space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <span>Total Engagements</span>
            <Heart className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-foreground" data-testid="total-engagements-stat">
            {(data?.totalEngagements || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-muted-foreground">Likes, comments, shares, clicks</p>
        </div>

        {/* Card 3: Average Engagement Rate */}
        <div className="bg-card p-4 rounded-xl border border-border space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <span>Avg Engagement Rate</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-primary" data-testid="avg-engagement-rate-stat">
            {(data?.averageEngagementRate || 0).toFixed(2)}%
          </div>
          <p className="text-[11px] text-muted-foreground">Engagements per 100 views</p>
        </div>

        {/* Card 4: Published Posts */}
        <div className="bg-card p-4 rounded-xl border border-border space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <span>Published Pieces</span>
            <Send className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-foreground" data-testid="published-count-stat">
            {data?.publishedCount || 0}
          </div>
          <p className="text-[11px] text-muted-foreground">Live across selected window</p>
        </div>
      </div>

      {/* Two Column Grid: Platform Breakdown & Top Posts Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Breakdown */}
        <div className="bg-card p-5 rounded-xl border border-border space-y-4" data-testid="channel-breakdown-section">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span>Channel Performance Comparison</span>
          </h3>

          {!data || data.channelBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              No channel performance data logged yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase text-[10px]">
                    <th className="pb-2 font-semibold">Platform</th>
                    <th className="pb-2 font-semibold text-right">Posts</th>
                    <th className="pb-2 font-semibold text-right">Views</th>
                    <th className="pb-2 font-semibold text-right">Engagements</th>
                    <th className="pb-2 font-semibold text-right">Rate %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 font-mono">
                  {data.channelBreakdown.map((item) => (
                    <tr key={item.platform} className="hover:bg-muted/20" data-testid={`channel-row-${item.platform}`}>
                      <td className="py-2.5 font-sans flex items-center gap-1.5">
                        {getPlatformBadge(item.platform)}
                        <span className="capitalize font-medium text-foreground">{item.platform}</span>
                      </td>
                      <td className="py-2.5 text-right">{item.totalPosts || 0}</td>
                      <td className="py-2.5 text-right font-medium">{(item.totalViews || 0).toLocaleString()}</td>
                      <td className="py-2.5 text-right text-foreground">{(item.totalEngagements || 0).toLocaleString()}</td>
                      <td className="py-2.5 text-right font-semibold text-primary font-sans">
                        {(item.averageEngagementRate || 0).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Posts Leaderboard */}
        <div className="bg-card p-5 rounded-xl border border-border space-y-4" data-testid="leaderboard-section">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-500" />
            <span>Top Performing Content Leaderboard</span>
          </h3>

          {!data || data.leaderboard.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              Publish pieces and log metrics to populate the leaderboard.
            </p>
          ) : (
            <div className="space-y-2.5">
              {data.leaderboard.map((post, idx) => (
                <div
                  key={post.publicationId}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-background/50 hover:bg-background transition-colors text-xs"
                  data-testid={`leaderboard-item-${idx}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 ${
                        idx === 0
                          ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                          : idx === 1
                          ? "bg-slate-300/40 text-slate-700 dark:text-slate-300"
                          : idx === 2
                          ? "bg-orange-500/20 text-orange-600 dark:text-orange-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <div className="truncate">
                      <div className="font-semibold text-foreground truncate">{post.title}</div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span className="capitalize">{post.platform}</span>
                        <span>•</span>
                        <span>{post.views.toLocaleString()} views</span>
                        <span>•</span>
                        <span>{post.totalEngagements.toLocaleString()} engagements</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 pl-3">
                    <div className="font-bold text-sm text-primary font-mono">
                      {post.engagementRate.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase">Eng. Rate</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
