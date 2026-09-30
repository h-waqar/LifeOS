"use client";

import * as React from "react";
import {
  BarChart3,
  Clock,
  Flame,
  Target,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  ArrowRight,
  Layers,
  Activity,
  Award,
  BookmarkCheck,
  Compass,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { GoalForecastDialog } from "@/components/goals/goal-forecast-dialog";
import type {
  AnalyticsDashboardDTO,
  PeriodFilter,
  MetricDelta,
  LifeArea,
} from "@/types";

interface AnalyticsDashboardViewProps {
  initialData?: AnalyticsDashboardDTO | null;
}

export function AnalyticsDashboardView({ initialData }: AnalyticsDashboardViewProps) {
  const [period, setPeriod] = React.useState<PeriodFilter>("30d");
  const [activeTab, setActiveTab] = React.useState<
    "overview" | "time" | "habits" | "velocity" | "goals" | "optimizer" | "correlations"
  >("overview");
  const [data, setData] = React.useState<AnalyticsDashboardDTO | null>(initialData || null);
  const [selectedForecastGoal, setSelectedForecastGoal] = React.useState<{ id: string; title: string } | null>(null);
  const [isLoading, setIsLoading] = React.useState(!initialData);
  const [isSavingSnapshot, setIsSavingSnapshot] = React.useState(false);

  const fetchDashboard = React.useCallback(async (selectedPeriod: PeriodFilter) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/analytics/dashboard?period=${selectedPeriod}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      } else {
        toast.error("Failed to load analytics dashboard");
      }
    } catch (err) {
      console.error("Error fetching analytics:", err);
      toast.error("Failed to load analytics data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const isMounted = React.useRef(false);

  React.useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      if (initialData) return;
    }
    fetchDashboard(period);
  }, [period, fetchDashboard, initialData]);

  const handleSaveSnapshot = async () => {
    if (!data) return;
    setIsSavingSnapshot(true);
    try {
      const res = await fetch("/api/analytics/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodType: data.period.periodType,
          startDate: data.period.startDate,
          endDate: data.period.endDate,
          metrics: data,
        }),
      });
      if (res.ok) {
        toast.success("Analytics snapshot archived successfully");
      } else {
        toast.error("Failed to save snapshot");
      }
    } catch (err) {
      toast.error("Failed to save snapshot");
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  const renderDelta = (delta?: MetricDelta, unit = "%") => {
    if (!delta) return null;
    const isUp = delta.direction === "up";
    const isDown = delta.direction === "down";
    const isFlat = delta.direction === "flat";

    return (
      <div className="flex items-center gap-1 text-xs font-medium">
        {isUp && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
        {isDown && <TrendingDown className="h-3.5 w-3.5 text-rose-500" />}
        {isFlat && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
        <span
          className={
            isUp
              ? "text-emerald-500"
              : isDown
              ? "text-rose-500"
              : "text-muted-foreground"
          }
        >
          {delta.percentageDelta !== null ? `${delta.percentageDelta > 0 ? "+" : ""}${delta.percentageDelta}%` : "0%"}
        </span>
        <span className="text-muted-foreground text-[10px]">vs prev period</span>
      </div>
    );
  };

  const getAreaColor = (area: LifeArea) => {
    switch (area) {
      case "career":
        return "bg-purple-500";
      case "health":
        return "bg-emerald-500";
      case "finance":
        return "bg-amber-500";
      case "personal_development":
        return "bg-blue-500";
      case "relationships":
        return "bg-pink-500";
      default:
        return "bg-slate-500";
    }
  };

  return (
    <div className="space-y-6" data-testid="analytics-dashboard-view">
      {/* Top Header & Range Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card p-5 rounded-2xl border border-border shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Personal Analytics & Intelligence
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Deterministic cross-domain trends, productivity velocity, and schedule optimization.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period Selector */}
          <div className="flex items-center border border-border rounded-xl p-1 bg-muted/40 text-xs">
            <Button
              variant={period === "7d" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-3 rounded-lg"
              onClick={() => setPeriod("7d")}
              data-testid="filter-7d"
            >
              7 Days
            </Button>
            <Button
              variant={period === "30d" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-3 rounded-lg"
              onClick={() => setPeriod("30d")}
              data-testid="filter-30d"
            >
              30 Days
            </Button>
            <Button
              variant={period === "90d" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-3 rounded-lg"
              onClick={() => setPeriod("90d")}
              data-testid="filter-90d"
            >
              90 Days
            </Button>
            <Button
              variant={period === "month" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs px-3 rounded-lg"
              onClick={() => setPeriod("month")}
              data-testid="filter-month"
            >
              This Month
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs px-3 rounded-xl border-border"
            onClick={handleSaveSnapshot}
            disabled={isSavingSnapshot || !data}
            data-testid="btn-save-snapshot"
          >
            <BookmarkCheck className="h-3.5 w-3.5 mr-1.5" />
            {isSavingSnapshot ? "Archiving..." : "Snapshot"}
          </Button>
        </div>
      </div>

      {/* Date Window Indicator */}
      {data && (
        <div className="text-xs text-muted-foreground flex items-center justify-between px-1">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            Analyzing window: <span className="font-semibold text-foreground">{data.period.startDate}</span> to{" "}
            <span className="font-semibold text-foreground">{data.period.endDate}</span> ({data.period.daysCount} days)
          </span>
          <span className="text-[11px]">
            Compared against: {data.period.previousStartDate} to {data.period.previousEndDate}
          </span>
        </div>
      )}

      {/* 4 Primary KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Focus Hours */}
        <Card className="rounded-2xl border border-border shadow-sm">
          <CardHeader className="p-5 pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
              Deep Work & Focus
            </span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            <div className="text-3xl font-extrabold text-foreground tracking-tight" data-testid="kpi-focus-hours">
              {data ? `${data.overview.totalFocusHours}h` : "--"}
            </div>
            <div className="mt-2 flex items-center justify-between">
              {renderDelta(data?.overview.deltas.focusHours)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Completed focus & task time blocks
            </p>
          </CardContent>
        </Card>

        {/* Task Completion Rate */}
        <Card className="rounded-2xl border border-border shadow-sm">
          <CardHeader className="p-5 pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
              Task Velocity & Execution
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            <div className="text-3xl font-extrabold text-foreground tracking-tight" data-testid="kpi-task-rate">
              {data ? `${data.overview.taskCompletionRate}%` : "--"}
            </div>
            <div className="mt-2 flex items-center justify-between">
              {renderDelta(data?.overview.deltas.taskCompletionRate)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {data ? `${data.projectVelocity.tasksCompletedCount} completed (${data.projectVelocity.velocityPerDay}/day)` : "--"}
            </p>
          </CardContent>
        </Card>

        {/* Habit Consistency */}
        <Card className="rounded-2xl border border-border shadow-sm">
          <CardHeader className="p-5 pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
              Habit Consistency
            </span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
              <Flame className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            <div className="text-3xl font-extrabold text-foreground tracking-tight" data-testid="kpi-habit-rate">
              {data ? `${data.overview.habitConsistencyRate}%` : "--"}
            </div>
            <div className="mt-2 flex items-center justify-between">
              {renderDelta(data?.overview.deltas.habitConsistencyRate)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {data ? `${data.habitConsistency.activeHabitsCount} active habits • ${data.habitConsistency.perfectDaysCount} perfect days` : "--"}
            </p>
          </CardContent>
        </Card>

        {/* Productivity Score */}
        <Card className="rounded-2xl border border-border shadow-sm">
          <CardHeader className="p-5 pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
              Productivity Score
            </span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500">
              <Sparkles className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-1">
            <div className="text-3xl font-extrabold text-foreground tracking-tight" data-testid="kpi-productivity-score">
              {data ? `${data.overview.averageProductivityScore}/100` : "--"}
            </div>
            <div className="mt-2 flex items-center justify-between">
              {renderDelta(data?.overview.deltas.productivityScore)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Evening review reflection average
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-2 overflow-x-auto text-xs">
        <Button
          variant={activeTab === "overview" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 rounded-lg"
          onClick={() => setActiveTab("overview")}
          data-testid="tab-overview"
        >
          <Activity className="h-3.5 w-3.5 mr-1.5" />
          Overview
        </Button>
        <Button
          variant={activeTab === "time" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 rounded-lg"
          onClick={() => setActiveTab("time")}
          data-testid="tab-time"
        >
          <Clock className="h-3.5 w-3.5 mr-1.5" />
          Time Allocation
        </Button>
        <Button
          variant={activeTab === "habits" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 rounded-lg"
          onClick={() => setActiveTab("habits")}
          data-testid="tab-habits"
        >
          <Flame className="h-3.5 w-3.5 mr-1.5" />
          Habit Consistency
        </Button>
        <Button
          variant={activeTab === "velocity" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 rounded-lg"
          onClick={() => setActiveTab("velocity")}
          data-testid="tab-velocity"
        >
          <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
          Velocity & Projects
        </Button>
        <Button
          variant={activeTab === "goals" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 rounded-lg"
          onClick={() => setActiveTab("goals")}
          data-testid="tab-goals"
        >
          <Target className="h-3.5 w-3.5 mr-1.5" />
          Goal Progress
        </Button>
        <Button
          variant={activeTab === "optimizer" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 rounded-lg"
          onClick={() => setActiveTab("optimizer")}
          data-testid="tab-optimizer"
        >
          <Zap className="h-3.5 w-3.5 mr-1.5" />
          Schedule Optimizer
        </Button>
        <Button
          variant={activeTab === "correlations" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 rounded-lg"
          onClick={() => setActiveTab("correlations")}
          data-testid="tab-correlations"
        >
          <Layers className="h-3.5 w-3.5 mr-1.5" />
          Cross-Domain Correlations
        </Button>
      </div>

      {/* Main Tab Content */}
      {isLoading ? (
        <div className="py-20 text-center text-muted-foreground text-sm flex flex-col items-center justify-center gap-2">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Crunching deterministic life metrics...</span>
        </div>
      ) : !data ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          No analytics data found for this period.
        </div>
      ) : (
        <div className="space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Schedule Optimizer Teaser Card (INTEL-04) */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">
                      Optimal Focus Window Recommendation
                    </span>
                    <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                      INTEL-04
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-2xl">
                    {data.scheduleOptimization.peakFocusWindow.rationale}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-card px-4 py-2 rounded-xl border border-border shadow-sm text-center">
                    <span className="text-[10px] text-muted-foreground block uppercase font-medium">
                      Peak Focus Window
                    </span>
                    <span className="text-sm font-bold text-primary font-mono">
                      {data.scheduleOptimization.peakFocusWindow.startHour} –{" "}
                      {data.scheduleOptimization.peakFocusWindow.endHour}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-9 rounded-xl text-xs"
                    onClick={() => setActiveTab("optimizer")}
                  >
                    View Optimizer
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>

              {/* Time by Area & Daily Velocity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Time by Area */}
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader className="p-5 pb-3">
                    <CardTitle className="text-sm font-bold flex items-center justify-between">
                      <span>Time Allocation by Life Area</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {Math.round(data.timeAllocation.totalCompletedMinutes / 60)}h completed
                      </span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Distribution of completed time blocks across life domains.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 pt-0 space-y-3">
                    {data.timeAllocation.areaBreakdown.map((item) => (
                      <div key={item.area} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="capitalize font-medium text-foreground flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${getAreaColor(item.area)}`} />
                            {item.area.replace("_", " ")}
                          </span>
                          <span className="text-muted-foreground">
                            {Math.round(item.completedMinutes / 60)}h ({item.percentageOfTotal}%)
                          </span>
                        </div>
                        <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getAreaColor(item.area)} rounded-full`}
                            style={{ width: `${Math.min(100, item.percentageOfTotal)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Daily Velocity Chart / Bars */}
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader className="p-5 pb-3">
                    <CardTitle className="text-sm font-bold flex items-center justify-between">
                      <span>Daily Completion Velocity</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        Avg {data.projectVelocity.velocityPerDay} tasks/day
                      </span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Tasks completed per day with 7-day rolling average.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 pt-0">
                    <div className="h-44 flex items-end gap-1.5 pt-4">
                      {data.projectVelocity.dailyVelocity.slice(-14).map((d) => {
                        const maxH = Math.max(
                          ...data.projectVelocity.dailyVelocity.slice(-14).map((x) => x.completedTasks),
                          5
                        );
                        const heightPct = Math.round((d.completedTasks / maxH) * 100);
                        return (
                          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                            <div className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute -top-5 bg-popover px-1 py-0.5 rounded shadow">
                              {d.completedTasks}
                            </div>
                            <div
                              className="w-full bg-primary/80 hover:bg-primary rounded-t transition-all"
                              style={{ height: `${Math.max(4, heightPct)}%` }}
                            />
                            <span className="text-[9px] text-muted-foreground rotate-45 origin-left pt-1">
                              {d.date.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Goal Progress Summary */}
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span>Goal Progress Rollup</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      Avg Progress: {data.goalProgress.averageProgress}%
                    </span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Progress across horizons and life areas.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {data.goalProgress.horizonRollup.map((h) => (
                      <div key={h.horizon} className="bg-muted/30 p-3.5 rounded-xl border border-border/60">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="capitalize font-semibold text-foreground">
                            {h.horizon.replace("_", " ")}
                          </span>
                          <span className="text-muted-foreground font-mono">{h.averageProgress}%</span>
                        </div>
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full"
                            style={{ width: `${Math.min(100, h.averageProgress)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1.5 block">
                          {h.goalsCount} goals tracked
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 2: TIME ALLOCATION */}
          {activeTab === "time" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-4 rounded-xl border border-border">
                  <span className="text-xs text-muted-foreground">Total Scheduled</span>
                  <div className="text-2xl font-bold mt-1">
                    {Math.round(data.timeAllocation.totalScheduledMinutes / 60)}h
                  </div>
                  <span className="text-[11px] text-muted-foreground">Allocated time blocks</span>
                </Card>
                <Card className="p-4 rounded-xl border border-border">
                  <span className="text-xs text-muted-foreground">Total Completed</span>
                  <div className="text-2xl font-bold mt-1 text-emerald-500">
                    {Math.round(data.timeAllocation.totalCompletedMinutes / 60)}h
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Completion rate: {data.timeAllocation.completionRate}%
                  </span>
                </Card>
                <Card className="p-4 rounded-xl border border-border">
                  <span className="text-xs text-muted-foreground">Deep Work Ratio</span>
                  <div className="text-2xl font-bold mt-1 text-blue-500">
                    {data.timeAllocation.totalCompletedMinutes > 0
                      ? Math.round(
                          (data.timeAllocation.focusMinutes /
                            data.timeAllocation.totalCompletedMinutes) *
                            100
                        )
                      : 0}
                    %
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {Math.round(data.timeAllocation.focusMinutes / 60)}h focus vs{" "}
                    {Math.round(data.timeAllocation.shallowMinutes / 60)}h shallow
                  </span>
                </Card>
              </div>

              {/* Projects Time Breakdown */}
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-bold">Top Projects by Time Invested</CardTitle>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  {data.timeAllocation.projectBreakdown.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4">No project-linked time blocks in this period.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.timeAllocation.projectBreakdown.slice(0, 6).map((proj) => (
                        <div key={proj.projectId} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">{proj.projectName}</span>
                            <span className="text-muted-foreground">
                              {Math.round(proj.minutes / 60)}h ({proj.percentageOfTotal}%)
                            </span>
                          </div>
                          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${Math.min(100, proj.percentageOfTotal)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 3: HABIT CONSISTENCY */}
          {activeTab === "habits" && (
            <div className="space-y-6">
              {/* Habit Metrics Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card className="p-4 rounded-xl border border-border">
                  <span className="text-xs text-muted-foreground">Overall Consistency</span>
                  <div className="text-2xl font-bold mt-1 text-amber-500">
                    {data.habitConsistency.overallConsistencyRate}%
                  </div>
                  {renderDelta(data.habitConsistency.deltas.overallConsistencyRate)}
                </Card>
                <Card className="p-4 rounded-xl border border-border">
                  <span className="text-xs text-muted-foreground">Total Check-Ins</span>
                  <div className="text-2xl font-bold mt-1">
                    {data.habitConsistency.totalCompletions}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    out of {data.habitConsistency.totalExpected} expected
                  </span>
                </Card>
                <Card className="p-4 rounded-xl border border-border">
                  <span className="text-xs text-muted-foreground">Average Streak</span>
                  <div className="text-2xl font-bold mt-1 flex items-center gap-1.5">
                    <Flame className="h-5 w-5 text-orange-500" />
                    <span>{data.habitConsistency.averageStreak} days</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Longest active: {data.habitConsistency.longestActiveStreak}d
                  </span>
                </Card>
                <Card className="p-4 rounded-xl border border-border">
                  <span className="text-xs text-muted-foreground">Perfect Days</span>
                  <div className="text-2xl font-bold mt-1 text-emerald-500">
                    {data.habitConsistency.perfectDaysCount}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    100% habit target completed
                  </span>
                </Card>
              </div>

              {/* Habit Breakdown Table */}
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-bold">Habit Breakdown</CardTitle>
                  <CardDescription className="text-xs">
                    Individual habit performance and streaks in selected period.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  <div className="space-y-3">
                    {data.habitConsistency.habitBreakdown.map((h) => (
                      <div
                        key={h.habitId}
                        className="p-3.5 rounded-xl border border-border/70 bg-card/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{h.title}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {h.frequency}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>
                              {h.actualCompletions} / {h.targetCompletions} completions
                            </span>
                            <span className="flex items-center gap-1 text-orange-500">
                              <Flame className="h-3.5 w-3.5" />
                              {h.currentStreak}d streak (max {h.longestStreak}d)
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-48">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-500 rounded-full"
                              style={{ width: `${Math.min(100, h.consistencyRate)}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-foreground w-12 text-right">
                            {h.consistencyRate}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 4: VELOCITY & PROJECTS */}
          {activeTab === "velocity" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card className="p-4 rounded-xl border border-border">
                  <span className="text-xs text-muted-foreground">Tasks Completed</span>
                  <div className="text-2xl font-bold mt-1 text-emerald-500">
                    {data.projectVelocity.tasksCompletedCount}
                  </div>
                  {renderDelta(data.projectVelocity.deltas.tasksCompletedCount)}
                </Card>
                <Card className="p-4 rounded-xl border border-border">
                  <span className="text-xs text-muted-foreground">Daily Velocity</span>
                  <div className="text-2xl font-bold mt-1">
                    {data.projectVelocity.velocityPerDay} <span className="text-xs font-normal">tasks/day</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    ~{data.projectVelocity.velocityPerWeek} tasks/week
                  </span>
                </Card>
                <Card className="p-4 rounded-xl border border-border">
                  <span className="text-xs text-muted-foreground">Estimation Accuracy</span>
                  <div className="text-2xl font-bold mt-1 text-blue-500">
                    {data.projectVelocity.estimationAccuracy}%
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Actual vs estimated duration
                  </span>
                </Card>
                <Card className="p-4 rounded-xl border border-border">
                  <span className="text-xs text-muted-foreground">Overdue Rate</span>
                  <div className="text-2xl font-bold mt-1 text-rose-500">
                    {data.projectVelocity.overdueRate}%
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {data.projectVelocity.overdueCount} overdue active tasks
                  </span>
                </Card>
              </div>

              {/* Projects Breakdown */}
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-bold">Project Execution Velocity</CardTitle>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  <div className="space-y-3">
                    {data.projectVelocity.projectBreakdown.map((proj) => (
                      <div
                        key={proj.projectId}
                        className="p-3.5 rounded-xl border border-border/70 flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{proj.projectName}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {proj.status}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground mt-0.5 block">
                            {proj.tasksCompleted} tasks completed in period
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold font-mono">{proj.progress}%</span>
                          <span className="text-[10px] text-muted-foreground block">progress</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 5: GOAL PROGRESS */}
          {activeTab === "goals" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-4 rounded-xl border border-border">
                  <span className="text-xs text-muted-foreground">Average Goal Progress</span>
                  <div className="text-2xl font-bold mt-1 text-amber-500">
                    {data.goalProgress.averageProgress}%
                  </div>
                  {renderDelta(data.goalProgress.deltas.averageProgress)}
                </Card>
                <Card className="p-4 rounded-xl border border-border">
                  <span className="text-xs text-muted-foreground">Completed Goals</span>
                  <div className="text-2xl font-bold mt-1 text-emerald-500">
                    {data.goalProgress.completedGoalsCount}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    of {data.goalProgress.totalGoalsCount} total goals
                  </span>
                </Card>
                <Card className="p-4 rounded-xl border border-border">
                  <span className="text-xs text-muted-foreground">Moving Forward</span>
                  <div className="text-2xl font-bold mt-1 text-blue-500">
                    {data.goalProgress.goalsMovingForwardCount}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {data.goalProgress.stalledGoalsCount} stalled (0 progress)
                  </span>
                </Card>
              </div>

              {/* Goals List */}
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-bold">Goals Tracking</CardTitle>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                  <div className="space-y-3">
                    {data.goalProgress.goalList.map((g) => (
                      <div
                        key={g.id}
                        className="p-3.5 rounded-xl border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{g.title}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {g.horizon.replace("_", " ")}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px]">
                              {g.area}
                            </Badge>
                          </div>
                          {g.targetDate && (
                            <span className="text-xs text-muted-foreground block mt-0.5">
                              Target deadline: {g.targetDate}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <div className="flex items-center gap-3 w-32">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${Math.min(100, g.progress)}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-foreground w-10 text-right">
                              {g.progress}%
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2.5 rounded-lg flex items-center gap-1 shrink-0"
                            onClick={() => setSelectedForecastGoal({ id: g.id, title: g.title })}
                            data-testid={`analytics-goal-forecast-btn-${g.id}`}
                          >
                            <Sparkles className="h-3 w-3 text-primary" />
                            <span>Forecast</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 6: SCHEDULE OPTIMIZER (INTEL-04) */}
          {activeTab === "optimizer" && (
            <div className="space-y-6" data-testid="schedule-optimizer-section">
              {/* Header Box */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground">
                      Schedule Optimization & Focus Block Recommendations
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Requirement INTEL-04: Grounded in historical productivity scores, completion velocity, and energy tiers.
                    </p>
                  </div>
                </div>
              </div>

              {/* Two Prime Focus Window Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Peak Focus Window */}
                <Card className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 space-y-3" data-testid="peak-focus-window">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-primary text-primary-foreground text-xs font-bold px-2.5 py-0.5">
                      Prime Deep-Work Window
                    </Badge>
                    <span className="text-xs font-semibold text-primary">
                      {data.scheduleOptimization.peakFocusWindow.confidenceScore}% Confidence
                    </span>
                  </div>
                  <div className="text-3xl font-extrabold text-foreground font-mono">
                    {data.scheduleOptimization.peakFocusWindow.startHour} –{" "}
                    {data.scheduleOptimization.peakFocusWindow.endHour}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {data.scheduleOptimization.peakFocusWindow.rationale}
                  </p>
                </Card>

                {/* Secondary Focus Window */}
                <Card className="rounded-2xl border border-border bg-card p-5 space-y-3" data-testid="secondary-focus-window">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs font-bold px-2.5 py-0.5">
                      Secondary Focus Window
                    </Badge>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {data.scheduleOptimization.secondaryFocusWindow.confidenceScore}% Confidence
                    </span>
                  </div>
                  <div className="text-3xl font-extrabold text-foreground font-mono">
                    {data.scheduleOptimization.secondaryFocusWindow.startHour} –{" "}
                    {data.scheduleOptimization.secondaryFocusWindow.endHour}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {data.scheduleOptimization.secondaryFocusWindow.rationale}
                  </p>
                </Card>
              </div>

              {/* Energy Tiers Mapping */}
              <Card className="rounded-2xl border border-border shadow-sm">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Compass className="h-4 w-4 text-primary" />
                    <span>Recommended Daily Energy Tier Allocation</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Aligning task complexity with historical cognitive energy reserves.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 pt-0 space-y-3">
                  {data.scheduleOptimization.energyTiers.map((tier) => (
                    <div
                      key={tier.tier}
                      data-testid={`energy-tier-${tier.tier}`}
                      className="p-4 rounded-xl border border-border bg-card/60 flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                            {tier.tier} Energy
                          </span>
                          <span className="text-xs font-mono font-semibold text-primary">
                            ({tier.recommendedTimeWindow})
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {tier.bestTaskTypes.map((type) => (
                            <Badge key={type} variant="outline" className="text-[10px] bg-muted/30">
                              {type}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="text-left md:text-right">
                        <span className="text-xs font-semibold text-emerald-500">
                          {tier.historicalSuccessRate}% Success
                        </span>
                        <span className="text-[10px] text-muted-foreground block">historical execution</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Best Days & Actionable Recommendations */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Best Days */}
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader className="p-5 pb-3">
                    <CardTitle className="text-sm font-bold">Peak Productivity Days</CardTitle>
                    <CardDescription className="text-xs">
                      Ranked by evening review productivity scores.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 pt-0 space-y-2.5">
                    {data.scheduleOptimization.bestProductivityDays.slice(0, 4).map((d, i) => (
                      <div key={d.dayOfWeek} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-muted/30">
                        <span className="font-semibold text-foreground flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground font-mono">#{i + 1}</span>
                          {d.dayOfWeek}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">~{d.averageTasksCompleted} tasks</span>
                          <span className="font-bold text-primary">{d.averageScore}/100</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Concrete Recommendations */}
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader className="p-5 pb-3">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      <span>Actionable Scheduling Rules</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Deterministic heuristics for planning tomorrow and next week.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 pt-0">
                    <ul className="space-y-2 text-xs text-muted-foreground" data-testid="actionable-recommendations">
                      {data.scheduleOptimization.actionableRecommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                          <span className="text-foreground">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* TAB 7: CROSS-DOMAIN CORRELATIONS */}
          {activeTab === "correlations" && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
                <h2 className="text-base font-bold text-foreground">
                  Cross-Domain Productivity Correlations
                </h2>
                <p className="text-xs text-muted-foreground">
                  Quantifying how habits, deep-work allocations, and daily planning impact execution velocity.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Habit vs Velocity */}
                <Card className="rounded-2xl border border-border p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-bold">Habit Impact on Velocity</span>
                  </div>
                  <div className="text-3xl font-extrabold text-emerald-500">
                    +{data.correlations.habitVsVelocityCorrelation.impactPercentage}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    On days with high habit completion, you complete an average of{" "}
                    <strong className="text-foreground">{data.correlations.habitVsVelocityCorrelation.highHabitDaysAvgTasks}</strong>{" "}
                    tasks vs{" "}
                    <strong className="text-foreground">{data.correlations.habitVsVelocityCorrelation.lowHabitDaysAvgTasks}</strong>{" "}
                    tasks on low habit days.
                  </p>
                </Card>

                {/* Deep Work vs Score */}
                <Card className="rounded-2xl border border-border p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-bold">Deep Work & Satisfaction</span>
                  </div>
                  <div className="text-3xl font-extrabold text-primary">
                    +{data.correlations.deepWorkVsProductivityScore.scoreDelta} pts
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Days with &gt;= 90m of focus blocks result in an average score of{" "}
                    <strong className="text-foreground">{data.correlations.deepWorkVsProductivityScore.highFocusDaysAvgScore}/100</strong>{" "}
                    compared to{" "}
                    <strong className="text-foreground">{data.correlations.deepWorkVsProductivityScore.lowFocusDaysAvgScore}/100</strong>{" "}
                    on low focus days.
                  </p>
                </Card>

                {/* Plan Impact */}
                <Card className="rounded-2xl border border-border p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-bold">Morning Planning Lift</span>
                  </div>
                  <div className="text-3xl font-extrabold text-purple-500">
                    +{data.correlations.dailyPlanCompletionImpact.velocityLiftPercentage}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Completing morning planning lifts task velocity to{" "}
                    <strong className="text-foreground">{data.correlations.dailyPlanCompletionImpact.plannedDaysAvgVelocity}</strong>{" "}
                    tasks/day vs{" "}
                    <strong className="text-foreground">{data.correlations.dailyPlanCompletionImpact.unplannedDaysAvgVelocity}</strong>{" "}
                    on unplanned days.
                  </p>
                </Card>
              </div>

              {/* GitHub Activity Correlation if exists */}
              {data.correlations.githubProductivityOverlap && data.correlations.githubProductivityOverlap.totalCommits > 0 && (
                <Card className="rounded-2xl border border-border p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold">GitHub Code Activity Overlap</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {data.correlations.githubProductivityOverlap.totalCommits} commits ingested in this window.
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs font-mono">
                      {data.correlations.githubProductivityOverlap.avgCommitsOnHighVelocityDays} commits/high-velocity day
                    </Badge>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {selectedForecastGoal && (
        <GoalForecastDialog
          goalId={selectedForecastGoal.id}
          goalTitle={selectedForecastGoal.title}
          isOpen={Boolean(selectedForecastGoal)}
          onClose={() => setSelectedForecastGoal(null)}
        />
      )}
    </div>
  );
}
