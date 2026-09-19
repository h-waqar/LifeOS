"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DailyPlanHistoryDTO } from "@/types";
import {
  TrendingUp,
  Sun,
  Moon,
  CheckCircle2,
  Calendar,
  Sparkles,
  Loader2,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";

interface DailyPlanHistoryViewProps {
  initialHistory?: DailyPlanHistoryDTO;
  onSelectDate?: (date: string) => void;
}

export function DailyPlanHistoryView({ initialHistory, onSelectDate }: DailyPlanHistoryViewProps = {}) {
  const [history, setHistory] = React.useState<DailyPlanHistoryDTO | null>(initialHistory || null);
  const [loading, setLoading] = React.useState(!initialHistory);
  const [daysFilter, setDaysFilter] = React.useState<number>(30);

  const fetchHistory = React.useCallback(async (days: number) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/daily-plan/history?days=${days}`);
      if (!res.ok) {
        throw new Error("Failed to load daily plan history");
      }
      const data = await res.json();
      setHistory(data.history);
    } catch (err: any) {
      toast.error(err.message || "Could not load history");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!initialHistory) {
      fetchHistory(daysFilter);
    }
  }, [daysFilter, fetchHistory, initialHistory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!history) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">
        No history data available.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="daily-plan-history-view">
      {/* Filter and Overview Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Planning History & Trends</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track daily consistency and review historical productivity metrics (PLAN-04).
          </p>
        </div>

        <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg text-xs">
          <button
            onClick={() => setDaysFilter(7)}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              daysFilter === 7
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="history-filter-7d"
          >
            7 Days
          </button>
          <button
            onClick={() => setDaysFilter(30)}
            className={`px-3 py-1 rounded-md font-medium transition-all ${
              daysFilter === 30
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="history-filter-30d"
          >
            30 Days
          </button>
        </div>
      </div>

      {/* Aggregate Metric Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Morning Routine Rate
            </CardTitle>
            <Sun className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-morning-rate">
              {history.morningPlanCompletionRate}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Days completed out of {history.totalDays}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Evening Review Rate
            </CardTitle>
            <Moon className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-evening-rate">
              {history.eveningReviewCompletionRate}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Reflection consistency
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Avg Productivity Score
            </CardTitle>
            <Sparkles className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-avg-score">
              {history.averageProductivityScore}
              <span className="text-xs font-medium text-muted-foreground">/100</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Overall execution score
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Breakdown List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span>Daily Log ({history.days.length} days)</span>
          </CardTitle>
          <CardDescription>
            Chronological breakdown of past daily plans, reviews, and productivity outcomes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y rounded-md border">
            {history.days.map((day) => (
              <div
                key={day.date}
                className="p-3.5 space-y-2 hover:bg-muted/30 transition-colors"
                data-testid={`history-day-${day.date}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-bold text-foreground">
                      {new Date(day.date + "T00:00:00.000Z").toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {day.date}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {/* Morning Plan status badge */}
                    <span
                      className={`px-2 py-0.5 rounded-full border text-[11px] font-medium flex items-center gap-1 ${
                        day.morningPlanCompleted
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          : "bg-muted text-muted-foreground border-transparent"
                      }`}
                    >
                      <Sun className="h-3 w-3" />
                      {day.morningPlanCompleted ? "Planned" : "No Plan"}
                    </span>

                    {/* Evening Review status badge */}
                    <span
                      className={`px-2 py-0.5 rounded-full border text-[11px] font-medium flex items-center gap-1 ${
                        day.hasEveningReview
                          ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
                          : "bg-muted text-muted-foreground border-transparent"
                      }`}
                    >
                      <Moon className="h-3 w-3" />
                      {day.hasEveningReview ? "Reviewed" : "No Review"}
                    </span>

                    {/* Productivity Score */}
                    {day.productivityScore !== null && (
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold text-[11px]">
                        Score: {day.productivityScore}
                      </span>
                    )}
                  </div>
                </div>

                {/* Optional reflections snippet */}
                {day.reflections && (day.reflections.positive || day.reflections.challenges) && (
                  <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-md space-y-1 mt-1">
                    {day.reflections.positive && (
                      <p>
                        <strong className="text-foreground">Wins:</strong>{" "}
                        {day.reflections.positive}
                      </p>
                    )}
                    {day.reflections.challenges && (
                      <p>
                        <strong className="text-foreground">Challenges:</strong>{" "}
                        {day.reflections.challenges}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
