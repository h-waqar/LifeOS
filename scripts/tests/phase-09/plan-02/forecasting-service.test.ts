// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/server/db", () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
  },
}));

import {
  getGoalRiskForecast,
  getAllGoalsRiskForecasts,
} from "@/server/goals/forecasting/service";
import { AuthorizationError } from "@/server/auth/guard";
import { NotFoundError } from "@/server/goals/service";

describe("Plan 09-02: Goal Forecasting Service (INTEL-02)", () => {
  const userId = "user_forecast_tester";
  const otherUserId = "user_other_intruder";
  const goalId = "goal_test_123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. User Ownership & Isolation Enforcement", () => {
    it("throws AuthorizationError if userId is not provided", async () => {
      await expect(getGoalRiskForecast("", goalId)).rejects.toThrow(
        AuthorizationError
      );
    });

    it("throws NotFoundError when goal does not exist in database", async () => {
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([]),
          }),
        }),
      });

      await expect(getGoalRiskForecast(userId, "non_existent_goal")).rejects.toThrow(
        NotFoundError
      );
    });

    it("throws AuthorizationError when goal belongs to another user (anti-tampering)", async () => {
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([
              {
                id: goalId,
                userId: otherUserId, // belongs to another user!
                title: "Confidential Project",
                status: "in_progress",
                priority: "high",
                progress: 50,
                createdAt: new Date(),
              },
            ]),
          }),
        }),
      });

      await expect(getGoalRiskForecast(userId, goalId)).rejects.toThrow(
        AuthorizationError
      );
    });
  });

  describe("2. Single Goal Forecast Assembly", () => {
    it("aggregates linked tasks, projects, habits, and timeblocks to compute forecast", async () => {
      const mockGoal = {
        id: goalId,
        userId,
        title: "Complete Q3 Objectives",
        status: "in_progress",
        priority: "high",
        area: "career",
        horizon: "medium_term",
        progress: 45,
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        targetDate: new Date("2026-10-31T00:00:00.000Z"),
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        completedAt: null,
      };

      const mockProjects = [
        {
          id: "p1",
          name: "Project Alpha",
          status: "active",
          deadline: new Date("2026-10-15T00:00:00.000Z"),
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
        },
      ];

      const mockTasks = [
        {
          id: "t1",
          title: "Setup Architecture",
          status: "completed",
          priority: "high",
          projectId: "p1",
          dueDate: new Date("2026-09-15T00:00:00.000Z"),
          completedAt: new Date("2026-09-14T00:00:00.000Z"),
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
        },
        {
          id: "t2",
          title: "Write Core Logic",
          status: "in_progress",
          priority: "medium",
          projectId: "p1",
          dueDate: new Date("2026-10-10T00:00:00.000Z"),
          completedAt: null,
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
        },
      ];

      const mockHabits = [
        {
          id: "h1",
          title: "Daily Standup",
          frequency: "daily",
          frequencyTarget: 1,
          currentStreak: 12,
          status: "active",
        },
      ];

      const mockTimeBlocks = [
        {
          durationMinutes: 90,
          actualMinutes: 90,
          status: "completed",
        },
      ];

      // Sequence of select calls:
      // 1. Goal
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([mockGoal]),
          }),
        }),
      });
      // 2. Projects
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce(mockProjects),
        }),
      });
      // 3. Direct tasks
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce(mockTasks),
        }),
      });
      // 4. Project tasks
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce(mockTasks),
        }),
      });
      // 5. Habits
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce(mockHabits),
        }),
      });
      // 6. TimeBlocks
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce(mockTimeBlocks),
        }),
      });

      const forecast = await getGoalRiskForecast(userId, goalId);

      expect(forecast.goalId).toBe(goalId);
      expect(forecast.goalTitle).toBe("Complete Q3 Objectives");
      expect(forecast.currentProgress).toBe(45);
      expect(forecast.signals.totalTasks).toBe(2);
      expect(forecast.signals.completedTasks).toBe(1);
      expect(forecast.signals.totalProjects).toBe(1);
      expect(forecast.signals.recentFocusHours).toBe(1.5);
      expect(forecast.contributingFactors).toBeInstanceOf(Array);
      expect(forecast.actionableRecommendations).toBeInstanceOf(Array);
    });
  });

  describe("3. Portfolio Risk Summary (getAllGoalsRiskForecasts)", () => {
    it("computes risk distributions across all user goals and sorts at-risk goals", async () => {
      const mockGoalRows = [
        {
          id: "g1",
          userId,
          title: "Goal 1",
          status: "in_progress",
          priority: "high",
          area: "career",
          horizon: "short_term",
          progress: 20,
          startDate: new Date("2026-08-01"),
          targetDate: new Date("2026-09-15"),
          createdAt: new Date("2026-08-01"),
          completedAt: null,
        },
      ];

      // 1. getAllGoals query
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce(mockGoalRows),
        }),
      });

      // 2. Mock sequence for g1's getGoalRiskForecast calls
      // 2a. Goal
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([mockGoalRows[0]]),
          }),
        }),
      });
      // 2b. Projects
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });
      // 2c. Tasks
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });
      // 2d. Habits
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });
      // 2e. TimeBlocks
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]),
        }),
      });

      const summary = await getAllGoalsRiskForecasts(userId);

      expect(summary.totalGoals).toBe(1);
      expect(summary.atRiskGoals).toBeInstanceOf(Array);
      expect(typeof summary.averageRiskScore).toBe("number");
    });
  });
});
