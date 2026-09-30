import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GoalRiskBadge } from "@/components/goals/goal-risk-badge";
import { GoalForecastDialog } from "@/components/goals/goal-forecast-dialog";
import type { GoalRiskForecastDTO } from "@/types";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/goals",
}));

describe("Plan 09-02: UI Components (Goal Risk Badge & Forecast Dialog)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockForecast: GoalRiskForecastDTO = {
    goalId: "goal-test-1",
    goalTitle: "Launch LifeOS Phase 9",
    status: "in_progress",
    currentProgress: 60,
    targetDate: "2026-10-15T00:00:00.000Z",
    daysRemaining: 15,
    isOverdue: false,
    currentVelocityPerDay: 1.2,
    requiredVelocityPerDay: 2.67,
    velocityRatio: 0.45,
    projectedCompletionDate: "2026-10-28T00:00:00.000Z",
    projectedCompletionWindow: {
      earliestDate: "2026-10-22T00:00:00.000Z",
      latestDate: "2026-11-05T00:00:00.000Z",
    },
    daysToCompleteProjected: 28,
    riskLevel: "medium_risk",
    riskScore: 52,
    confidenceScore: 0.75,
    dataSufficiency: "sufficient",
    sufficientData: true,
    dataPointsCount: 15,
    sufficiencyExplanation: "Adequate historical data for confident forecast",
    priority: "high",
    area: "career",
    horizon: "medium_term",
    signals: {
      totalTasks: 10,
      completedTasks: 6,
      openTasks: 4,
      overdueTasks: 2,
      overdueTaskRate: 0.2,
      totalProjects: 2,
      completedProjects: 1,
      averageProjectProgress: 50,
      stalledProjectsCount: 0,
      linkedHabitsCount: 1,
      averageHabitConsistency: 70,
      recentFocusHours: 12,
      expectedProgressByTimeline: 75,
      progressGap: 15,
      historicalDaysSampled: 25,
    },
    contributingFactors: [
      {
        code: "velocity_below_target",
        factor: "Current progress velocity is significantly below required pace",
        severity: "medium",
        impactWeight: 0.25,
        observedMetric: "Current 1.20%/day vs Required 2.67%/day (Ratio 0.45x)",
      },
      {
        code: "overdue_tasks",
        factor: "2 overdue task(s) blocking execution progress",
        severity: "high",
        impactWeight: 0.3,
        observedMetric: "2 overdue tasks",
      },
    ],
    actionableRecommendations: [
      "Resolve or reschedule the 2 overdue tasks immediately to remove execution bottlenecks.",
      "Increase daily focus on tasks linked to this goal. Current velocity is 45% of what is required.",
    ],
    generatedAt: "2026-09-30T12:00:00.000Z",
  };

  describe("1. GoalRiskBadge Component", () => {
    it("renders 'On Track' badge with green theme", () => {
      render(<GoalRiskBadge riskLevel="on_track" riskScore={10} showScore={true} />);
      expect(screen.getByText("On Track")).toBeDefined();
      expect(screen.getByText("(10)")).toBeDefined();
      expect(screen.getByTestId("goal-risk-badge-on_track")).toBeDefined();
    });

    it("renders 'Low Risk' badge", () => {
      render(<GoalRiskBadge riskLevel="low_risk" riskScore={25} />);
      expect(screen.getByText("Low Risk")).toBeDefined();
      expect(screen.getByTestId("goal-risk-badge-low_risk")).toBeDefined();
    });

    it("renders 'Medium Risk' badge with yellow theme", () => {
      render(<GoalRiskBadge riskLevel="medium_risk" riskScore={50} />);
      expect(screen.getByText("Medium Risk")).toBeDefined();
      expect(screen.getByTestId("goal-risk-badge-medium_risk")).toBeDefined();
    });

    it("renders 'High Risk' badge", () => {
      render(<GoalRiskBadge riskLevel="high_risk" riskScore={75} />);
      expect(screen.getByText("High Risk")).toBeDefined();
      expect(screen.getByTestId("goal-risk-badge-high_risk")).toBeDefined();
    });

    it("renders 'Critical' badge with red theme", () => {
      render(<GoalRiskBadge riskLevel="critical" riskScore={92} />);
      expect(screen.getByText("Critical")).toBeDefined();
      expect(screen.getByTestId("goal-risk-badge-critical")).toBeDefined();
    });

    it("renders 'Completed' badge without score even if showScore is true", () => {
      render(<GoalRiskBadge riskLevel="completed" riskScore={0} showScore={true} />);
      expect(screen.getByText("Completed")).toBeDefined();
      expect(screen.queryByText("(0)")).toBeNull();
    });

    it("triggers onClick when clicked", () => {
      const handleClick = vi.fn();
      render(
        <GoalRiskBadge
          riskLevel="medium_risk"
          riskScore={50}
          onClick={handleClick}
        />
      );
      const badge = screen.getByTestId("goal-risk-badge-medium_risk");
      fireEvent.click(badge);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("2. GoalForecastDialog Component", () => {
    it("renders dialog with initial forecast and displays metrics and recommendations", () => {
      render(
        <GoalForecastDialog
          goalId="goal-test-1"
          goalTitle="Launch LifeOS Phase 9"
          isOpen={true}
          onClose={vi.fn()}
          initialForecast={mockForecast}
        />
      );

      // Verify title and container
      expect(screen.getByText("Launch LifeOS Phase 9")).toBeDefined();
      expect(screen.getByTestId("goal-forecast-dialog-content")).toBeDefined();

      // Verify risk score
      expect(screen.getByText("Risk Score")).toBeDefined();
      expect(screen.getAllByText(/52/).length).toBeGreaterThanOrEqual(1);

      // Verify velocities
      expect(screen.getByText("Velocity Pace")).toBeDefined();
      expect(screen.getByText(/Required: 2.67% \/ day/)).toBeDefined();

      // Verify contributing factors
      expect(
        screen.getByText("Current progress velocity is significantly below required pace")
      ).toBeDefined();
      expect(
        screen.getByText("2 overdue task(s) blocking execution progress")
      ).toBeDefined();

      // Verify recommendations
      expect(
        screen.getByText(
          "Resolve or reschedule the 2 overdue tasks immediately to remove execution bottlenecks."
        )
      ).toBeDefined();
    });

    it("fetches forecast from API when opened without initial forecast", async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: mockForecast }),
      });
      vi.stubGlobal("fetch", fetchSpy);

      render(
        <GoalForecastDialog
          goalId="goal-test-1"
          goalTitle="Launch LifeOS Phase 9"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith("/api/goals/goal-test-1/forecast");
        expect(screen.getByText("Risk Score")).toBeDefined();
      });
    });

    it("displays error state when forecast fetch fails", async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Database offline" }),
      });
      vi.stubGlobal("fetch", fetchSpy);

      render(
        <GoalForecastDialog
          goalId="goal-test-1"
          goalTitle="Launch LifeOS Phase 9"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith("/api/goals/goal-test-1/forecast");
        expect(screen.getByText("Failed to load goal risk forecast")).toBeDefined();
      });
    });
  });
});
