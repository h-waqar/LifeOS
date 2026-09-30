"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GitHubActivityDTO } from "@/types";
import {
  GitCommit,
  GitPullRequest,
  CircleDot,
  Tag,
  GitBranch,
  RefreshCw,
  ExternalLink,
  Code2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

interface GitHubActivityTimelineProps {
  date: string;
  activities: GitHubActivityDTO[];
  onRefresh?: () => void;
}

export function GitHubActivityTimeline({
  date,
  activities = [],
  onRefresh,
}: GitHubActivityTimelineProps) {
  const [syncing, setSyncing] = React.useState(false);

  const handleManualSync = async () => {
    try {
      setSyncing(true);
      const res = await fetch("/api/integrations/github/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to sync GitHub activity");
      }

      const data = await res.json();
      toast.success(
        `GitHub sync complete: ${data.itemsCreated} new activities ingested (${data.itemsSkipped} skipped)`
      );
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to sync with GitHub");
    } finally {
      setSyncing(false);
    }
  };

  const getActivityIcon = (type: GitHubActivityDTO["activityType"]) => {
    switch (type) {
      case "commit":
        return <GitCommit className="h-4 w-4 text-emerald-500" />;
      case "pull_request":
        return <GitPullRequest className="h-4 w-4 text-purple-500" />;
      case "issue":
        return <CircleDot className="h-4 w-4 text-amber-500" />;
      case "release":
        return <Tag className="h-4 w-4 text-blue-500" />;
      default:
        return <Code2 className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <Card className="border shadow-sm" data-testid="github-activity-timeline-card">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Code2 className="h-4 w-4 text-primary" />
            GitHub Work Timeline ({activities.length})
          </CardTitle>
          <CardDescription className="text-xs">
            Commits, pull requests, and issues ingested for {date}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleManualSync}
          disabled={syncing}
          className="gap-1.5 text-xs h-8"
          data-testid="github-manual-sync-btn"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync GitHub"}
        </Button>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
            <Code2 className="h-8 w-8 mb-2 opacity-30 text-primary" />
            <p className="text-sm font-medium">No GitHub activity recorded for this day</p>
            <p className="text-xs mt-1 max-w-xs text-muted-foreground">
              Connect your account in Settings or click &quot;Sync GitHub&quot; to fetch your latest commits and pull requests.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative pl-6 border-l-2 border-muted space-y-4">
              {activities.map((item) => (
                <div key={item.id} className="relative group" data-testid={`github-activity-${item.id}`}>
                  {/* Timeline bullet dot */}
                  <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full bg-background border flex items-center justify-center">
                    {getActivityIcon(item.activityType)}
                  </div>

                  <div className="rounded-lg border bg-card/60 p-3 hover:bg-muted/40 transition-colors space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5">
                          {item.repository}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] uppercase font-semibold py-0 px-1.5">
                          {item.activityType}
                        </Badge>
                        {Boolean(item.metadata?.branch) && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            {String(item.metadata?.branch)}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {formatTime(item.timestamp)}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug line-clamp-2">
                        {item.title}
                      </p>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground hover:text-primary transition-colors p-1"
                          title="View on GitHub"
                          aria-label={`View ${item.title} on GitHub`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>

                    {item.summary && item.summary !== item.title && (
                      <p className="text-xs text-muted-foreground line-clamp-2 font-mono bg-muted/30 p-1.5 rounded">
                        {item.summary}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
                      <span>by {item.actor}</span>
                      {Boolean(item.metadata?.shortSha) && (
                        <span className="font-mono text-[10px] bg-muted px-1 rounded">
                          {String(item.metadata?.shortSha)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
