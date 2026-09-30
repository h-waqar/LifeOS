import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AnalyticsDashboardView } from "@/components/analytics/analytics-dashboard-view";
import type { AnalyticsDashboardDTO } from "@/types";

const mockDashboardData: AnalyticsDashboardDTO = {
  period: {
    periodType: "30d",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    previousStartDate: "2026-08-02",
    previousEndDate: "2026-08-31",
    daysCount: 30,
  },
  overview: {
    totalFocusHours: 32.5,
    taskCompletionRate: 78.4,
    habitConsistencyRate: 85.0,
    averageProductivityScore: 82.5,
    deltas: {
      focusHours: {
        current: 32.5,
        previous: 25.0,
        absoluteDelta: 7.5,
        percentageDelta: 30.0,
        direction: "up",
      },
      taskCompletionRate: {
        current: 78.4,
        previous: 70.0,
        absoluteDelta: 8.4,
        percentageDelta: 12.0,
        direction: "up",
      },
      habitConsistencyRate: {
        current: 85.0,
        previous: 80.0,
        absoluteDelta: 5.0,
        percentageDelta: 6.3,
        direction: "up",
      },
      productivityScore: {
        current: 82.5,
        previous: 82.5,
        absoluteDelta: 0,
        percentageDelta: 0,
        direction: "flat",
      },
    },
  },
  timeAllocation: {
    totalScheduledMinutes: 2400,
    totalCompletedMinutes: 2100,
    completionRate: 87.5,
    focusMinutes: 1950,
    shallowMinutes: 150,
    areaBreakdown: [
      { area: "career", scheduledMinutes: 1500, completedMinutes: 1400, percentageOfTotal: 66.7 },
      { area: "health", scheduledMinutes: 400, completedMinutes: 350, percentageOfTotal: 16.7 },
      { area: "personal_development", scheduledMinutes: 300, completedMinutes: 250, percentageOfTotal: 11.9 },
      { area: "finance", scheduledMinutes: 100, completedMinutes: 50, percentageOfTotal: 2.4 },
      { area: "relationships", scheduledMinutes: 100, completedMinutes: 50, percentageOfTotal: 2.4 },
      { area: "general", scheduledMinutes: 0, completedMinutes: 0, percentageOfTotal: 0 },
    ],
    projectBreakdown: [
      { projectId: "p1", projectName: "LifeOS MVP", minutes: 1200, percentageOfTotal: 57.1 },
    ],
    dailyDistribution: [
      { date: "2026-09-01", completedMinutes: 120, focusMinutes: 120 },
    ],
    deltas: {
      completedMinutes: { current: 2100, previous: 1800, absoluteDelta: 300, percentageDelta: 16.7, direction: "up" },
      focusMinutes: { current: 1950, previous: 1500, absoluteDelta: 450, percentageDelta: 30.0, direction: "up" },
      completionRate: { current: 87.5, previous: 80.0, absoluteDelta: 7.5, percentageDelta: 9.4, direction: "up" },
    },
  },
  habitConsistency: {
    overallConsistencyRate: 85.0,
    activeHabitsCount: 3,
    totalCompletions: 72,
    totalExpected: 85,
    perfectDaysCount: 18,
    averageStreak: 6.5,
    longestActiveStreak: 14,
    habitBreakdown: [
      {
        habitId: "h1",
        title: "Morning Routine",
        frequency: "daily",
        targetCompletions: 30,
        actualCompletions: 28,
        consistencyRate: 93.3,
        currentStreak: 12,
        longestStreak: 14,
      },
    ],
    timeOfDayBreakdown: [
      { cue: "morning", completions: 50, percentage: 69.4 },
    ],
    dailyConsistency: [
      { date: "2026-09-01", expected: 3, completed: 3, rate: 100 },
    ],
    deltas: {
      overallConsistencyRate: { current: 85.0, previous: 80.0, absoluteDelta: 5.0, percentageDelta: 6.3, direction: "up" },
      totalCompletions: { current: 72, previous: 65, absoluteDelta: 7, percentageDelta: 10.8, direction: "up" },
    },
  },
  projectVelocity: {
    tasksCompletedCount: 42,
    tasksCreatedCount: 48,
    velocityPerDay: 1.4,
    velocityPerWeek: 9.8,
    overdueCount: 2,
    overdueRate: 4.5,
    overallTaskCompletionRate: 78.4,
    estimationAccuracy: 92.5,
    activeProjectsCount: 2,
    completedProjectsCount: 1,
    completedMilestonesCount: 3,
    dailyVelocity: [
      { date: "2026-09-01", completedTasks: 2, createdTasks: 1, rollingAvg7d: 2.0 },
    ],
    projectBreakdown: [
      { projectId: "p1", projectName: "LifeOS MVP", tasksCompleted: 25, progress: 85, status: "active" },
    ],
    deltas: {
      tasksCompletedCount: { current: 42, previous: 35, absoluteDelta: 7, percentageDelta: 20.0, direction: "up" },
      velocityPerDay: { current: 1.4, previous: 1.1, absoluteDelta: 0.3, percentageDelta: 27.3, direction: "up" },
      overdueRate: { current: 4.5, previous: 8.0, absoluteDelta: -3.5, percentageDelta: -43.8, direction: "down" },
      estimationAccuracy: { current: 92.5, previous: 90.0, absoluteDelta: 2.5, percentageDelta: 2.8, direction: "up" },
    },
  },
  goalProgress: {
    totalGoalsCount: 4,
    activeGoalsCount: 3,
    completedGoalsCount: 1,
    averageProgress: 68.5,
    areaRollup: [
      { area: "career", goalsCount: 2, averageProgress: 80.0 },
      { area: "health", goalsCount: 1, averageProgress: 50.0 },
    ],
    horizonRollup: [
      { horizon: "short_term", goalsCount: 2, averageProgress: 75.0 },
      { horizon: "medium_term", goalsCount: 2, averageProgress: 62.0 },
    ],
    stalledGoalsCount: 0,
    goalsMovingForwardCount: 3,
    goalList: [
      { id: "g1", title: "Launch LifeOS v1", area: "career", horizon: "short_term", progress: 85, targetDate: "2026-10-01", status: "in_progress" },
    ],
    deltas: {
      averageProgress: { current: 68.5, previous: 60.0, absoluteDelta: 8.5, percentageDelta: 14.2, direction: "up" },
      completedGoalsCount: { current: 1, previous: 0, absoluteDelta: 1, percentageDelta: 100, direction: "up" },
    },
  },
  correlations: {
    habitVsVelocityCorrelation: {
      highHabitDaysAvgTasks: 3.2,
      lowHabitDaysAvgTasks: 1.1,
      impactPercentage: 190.9,
    },
    deepWorkVsProductivityScore: {
      highFocusDaysAvgScore: 88.5,
      lowFocusDaysAvgScore: 71.0,
      scoreDelta: 17.5,
    },
    dailyPlanCompletionImpact: {
      plannedDaysAvgVelocity: 2.8,
      unplannedDaysAvgVelocity: 1.2,
      velocityLiftPercentage: 133.3,
    },
  },
  scheduleOptimization: {
    peakFocusWindow: {
      startHour: "09:00",
      endHour: "11:30",
      title: "Prime Deep-Work Window",
      rationale: "Highest concentration of high-energy task completions occurs between 09:00 and 11:30.",
      confidenceScore: 88,
    },
    secondaryFocusWindow: {
      startHour: "14:00",
      endHour: "16:00",
      title: "Secondary Execution Window",
      rationale: "Afternoon focus recovers between 14:00 and 16:00 for reviews and collaborative tasks.",
      confidenceScore: 75,
    },
    energyTiers: [
      {
        tier: "high",
        recommendedTimeWindow: "09:00 - 11:30",
        bestTaskTypes: ["Deep Work & Architecture", "Complex Coding & Debugging"],
        historicalSuccessRate: 92,
      },
      {
        tier: "medium",
        recommendedTimeWindow: "14:00 - 16:00",
        bestTaskTypes: ["Code Reviews", "Planning"],
        historicalSuccessRate: 80,
      },
      {
        tier: "low",
        recommendedTimeWindow: "16:30 - 18:30",
        bestTaskTypes: ["Inbox Zero", "Habit Check-ins"],
        historicalSuccessRate: 90,
      },
    ],
    recommendedBlockDurationMinutes: 60,
    bestProductivityDays: [
      { dayOfWeek: "Tuesday", averageScore: 88.0, averageTasksCompleted: 4 },
      { dayOfWeek: "Thursday", averageScore: 84.5, averageTasksCompleted: 3 },
    ],
    actionableRecommendations: [
      "Protect your 09:00–11:30 prime focus window: schedule P0 high-energy tasks exclusively during this time block.",
      "Optimal focus block length is 60 minutes.",
      "Tuesday and Thursday are your highest productivity days.",
    ],
    dataPointsAnalyzed: {
      tasksWithEnergyCount: 35,
      completedTimeBlocksCount: 40,
      eveningReviewsCount: 25,
      daysSampled: 30,
    },
  },
  generatedAt: new Date().toISOString(),
};

describe("Plan 09-01: Analytics Dashboard UI (Component Tests)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockDashboardData }),
    });
  });

  it("renders the dashboard shell and period filter buttons", () => {
    render(<AnalyticsDashboardView initialData={mockDashboardData} />);

    expect(screen.getByTestId("analytics-dashboard-view")).toBeDefined();
    expect(screen.getByTestId("filter-7d")).toBeDefined();
    expect(screen.getByTestId("filter-30d")).toBeDefined();
    expect(screen.getByTestId("filter-90d")).toBeDefined();
    expect(screen.getByTestId("filter-month")).toBeDefined();
    expect(screen.getByTestId("btn-save-snapshot")).toBeDefined();
  });

  it("renders the 4 primary KPI cards with correct metric values and deltas", () => {
    render(<AnalyticsDashboardView initialData={mockDashboardData} />);

    expect(screen.getByTestId("kpi-focus-hours").textContent).toBe("32.5h");
    expect(screen.getByTestId("kpi-task-rate").textContent).toBe("78.4%");
    expect(screen.getByTestId("kpi-habit-rate").textContent).toBe("85%");
    expect(screen.getByTestId("kpi-productivity-score").textContent).toBe("82.5/100");
  });

  it("renders Schedule Optimization recommendations banner (INTEL-04)", () => {
    render(<AnalyticsDashboardView initialData={mockDashboardData} />);

    expect(screen.getByText("09:00 – 11:30")).toBeDefined();
    expect(screen.getByText(/Optimal Focus Window Recommendation/i)).toBeDefined();
  });

  it("switches to Schedule Optimizer tab and renders energy tiers and recommendations", () => {
    render(<AnalyticsDashboardView initialData={mockDashboardData} />);

    const optimizerTab = screen.getByTestId("tab-optimizer");
    fireEvent.click(optimizerTab);

    expect(screen.getByTestId("schedule-optimizer-section")).toBeDefined();
    expect(screen.getByTestId("peak-focus-window")).toBeDefined();
    expect(screen.getByTestId("secondary-focus-window")).toBeDefined();
    expect(screen.getByTestId("energy-tier-high")).toBeDefined();
    expect(screen.getByTestId("energy-tier-medium")).toBeDefined();
    expect(screen.getByTestId("energy-tier-low")).toBeDefined();
    expect(screen.getByTestId("actionable-recommendations")).toBeDefined();
  });

  it("switches to Habit Consistency tab and displays active habits", () => {
    render(<AnalyticsDashboardView initialData={mockDashboardData} />);

    const habitsTab = screen.getByTestId("tab-habits");
    fireEvent.click(habitsTab);

    expect(screen.getByText("Morning Routine")).toBeDefined();
    expect(screen.getByText(/28 \/ 30 completions/i)).toBeDefined();
  });

  it("handles filter button click and calls fetch with updated period", async () => {
    render(<AnalyticsDashboardView initialData={mockDashboardData} />);

    const filter7d = screen.getByTestId("filter-7d");
    fireEvent.click(filter7d);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/analytics/dashboard?period=7d");
    });
  });
});
