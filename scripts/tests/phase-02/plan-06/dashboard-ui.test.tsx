// @vitest-environment happy-dom
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DashboardPage from "@/app/dashboard/page";
import type { DashboardOverviewDTO } from "@/types";

// Mock next/navigation
const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock auth-client
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: { user: { id: "u-owner", name: "Hamza Executive", email: "hamza@example.com" } },
    isPending: false,
  }),
  signOut: vi.fn(),
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    theme: "dark",
    resolvedTheme: "dark",
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
  }),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Phase 2 Plan 02-06: Unified Dashboard UI (Happy-DOM)", () => {
  const sampleOverview: DashboardOverviewDTO = {
    date: "2026-09-16",
    greeting: {
      userName: "Hamza Executive",
      todayFormatted: "Wednesday, September 16, 2026",
    },
    metrics: {
      activeGoalsCount: 3,
      activeProjectsCount: 2,
      pendingTasksCount: 5,
      completedTasksCount: 8,
      overdueTasksCount: 1,
      criticalTasksCount: 2,
      todayHabitsTotal: 4,
      todayHabitsCompleted: 3,
      todayTimeBlocksCount: 2,
      todayProductivityScore: 88,
    },
    dailyPlan: {
      hasPlan: true,
      planStatus: "completed",
      completedAt: "2026-09-16T08:30:00.000Z",
      morningNotes: "Focus on Dashboard Plan 02-06",
      hasReview: true,
      reviewCompleted: true,
      productivityScore: 88,
      rolledOverCount: 1,
    },
    priorities: {
      todayTasks: [
        {
          id: "task-p1",
          userId: "u-owner",
          projectId: "proj-1",
          parentTaskId: null,
          milestoneId: null,
          title: "Implement Plan 02-06 Executive Dashboard",
          description: "Complete unified control center",
          status: "todo",
          priority: "critical",
          scheduledDate: "2026-09-16T00:00:00.000Z",
          energyLevel: "high",
          recurrenceRule: null,
          goalId: "goal-1",
          habitId: null,
          noteId: null,
          personId: null,
          tags: ["core", "phase2"],
          dueDate: "2026-09-16T18:00:00.000Z",
          estimatedDuration: 120,
          actualDuration: null,
          completedAt: null,
          priorityScore: 220,
          hasUncompletedDependencies: false,
          createdAt: "2026-09-15T00:00:00.000Z",
          updatedAt: "2026-09-15T00:00:00.000Z",
        },
      ],
      overdueTasks: [
        {
          id: "task-overdue-1",
          userId: "u-owner",
          projectId: "proj-1",
          parentTaskId: null,
          milestoneId: null,
          title: "Yesterday uncompleted review item",
          description: null,
          status: "todo",
          priority: "high",
          scheduledDate: "2026-09-15T00:00:00.000Z",
          energyLevel: "medium",
          recurrenceRule: null,
          goalId: null,
          habitId: null,
          noteId: null,
          personId: null,
          tags: [],
          dueDate: "2026-09-15T18:00:00.000Z",
          estimatedDuration: 45,
          actualDuration: null,
          completedAt: null,
          priorityScore: 190,
          hasUncompletedDependencies: false,
          createdAt: "2026-09-14T00:00:00.000Z",
          updatedAt: "2026-09-15T00:00:00.000Z",
        },
      ],
      criticalTasks: [],
    },
    schedule: {
      todayBlocks: [
        {
          id: "block-1",
          userId: "u-owner",
          title: "Deep Focus: Dashboard Architecture",
          description: null,
          startTime: "2026-09-16T09:00:00.000Z",
          endTime: "2026-09-16T11:00:00.000Z",
          durationMinutes: 120,
          status: "completed",
          commitmentLevel: "hard",
          actualMinutes: 115,
          completedAt: "2026-09-16T11:00:00.000Z",
          color: "#6366f1",
          taskId: "task-p1",
          projectId: "proj-1",
          goalId: null,
          habitId: null,
          createdAt: "2026-09-16T00:00:00.000Z",
          updatedAt: "2026-09-16T11:00:00.000Z",
        },
      ],
      totalScheduledMinutes: 120,
      completedMinutes: 115,
    },
    habits: {
      items: [
        {
          id: "habit-1",
          userId: "u-owner",
          title: "Deep Work Routine",
          description: null,
          frequency: "daily",
          frequencyTarget: 1,
          frequencyDays: [0, 1, 2, 3, 4, 5, 6],
          intervalDays: 1,
          targetValue: 1,
          unit: "session",
          timeOfDay: "morning",
          reminderTime: "08:00",
          goalId: null,
          identityStatement: "I am a high-output builder",
          status: "active",
          currentStreak: 14,
          longestStreak: 21,
          isCompletedToday: true,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      completionRateToday: 75,
    },
    goalsAndProjects: {
      activeGoals: [
        {
          id: "goal-1",
          userId: "u-owner",
          title: "Master Personal Knowledge & Productivity OS",
          description: "Build the complete 9-phase LifeOS",
          horizon: "long_term",
          area: "career",
          status: "in_progress",
          priority: "critical",
          metricType: "none",
          targetValue: null,
          currentValue: null,
          unit: null,
          startDate: "2026-01-01T00:00:00.000Z",
          targetDate: "2026-12-31T00:00:00.000Z",
          parentGoalId: null,
          progress: 55,
          completedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-09-16T00:00:00.000Z",
          childGoalsCount: 3,
          linkedProjectsCount: 4,
          directTasksCount: 12,
        },
        {
          id: "goal-2",
          userId: "u-owner",
          title: "Ship Phase 2 Core Productivity",
          description: "Deliver plans 02-01 through 02-06",
          horizon: "short_term",
          area: "career",
          status: "in_progress",
          priority: "high",
          metricType: "percentage",
          targetValue: 100,
          currentValue: 90,
          unit: "%",
          startDate: "2026-09-01T00:00:00.000Z",
          targetDate: "2026-09-30T00:00:00.000Z",
          parentGoalId: "goal-1",
          progress: 90,
          completedAt: null,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-16T00:00:00.000Z",
          childGoalsCount: 0,
          linkedProjectsCount: 2,
          directTasksCount: 6,
        },
      ],
      activeProjects: [
        {
          id: "proj-1",
          userId: "u-owner",
          name: "LifeOS Execution Engine",
          description: "Tasks, goals, calendar, daily plan",
          area: "career",
          status: "active",
          priority: "critical",
          startDate: "2026-09-01T00:00:00.000Z",
          deadline: "2026-09-30T00:00:00.000Z",
          goalId: "goal-1",
          progress: 85,
          milestonesCount: 6,
          tasksCount: 24,
          completedTasksCount: 20,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-16T00:00:00.000Z",
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/dashboard")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ overview: sampleOverview }),
        } as Response;
      }
      if (url.includes("/api/projects")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ projects: sampleOverview.goalsAndProjects.activeProjects }),
        } as Response;
      }
      if (url.includes("/api/tasks")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ tasks: sampleOverview.priorities.todayTasks }),
        } as Response;
      }
      if (url.includes("/api/habits/habit-1/toggle")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            stats: { currentStreak: 15, longestStreak: 21, isCompletedToday: true },
          }),
        } as Response;
      }
      if (url.includes("/api/habits")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ habits: sampleOverview.habits.items }),
        } as Response;
      }
      if (url.includes("/api/time-blocks/block-1")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            timeBlock: { ...sampleOverview.schedule.todayBlocks[0], status: "scheduled" },
          }),
        } as Response;
      }
      if (url.includes("/api/time-blocks")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ timeBlocks: sampleOverview.schedule.todayBlocks }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response;
    });
  });

  it("1. Renders executive dashboard header, greeting, and date", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-view")).toBeDefined();
      expect(screen.getByText("Executive Control Center")).toBeDefined();
      expect(screen.getByText(/Wednesday, September 16, 2026/)).toBeDefined();
    });
  });

  it("2. Renders all executive KPI metric cards", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("metric-active-goals")).toBeDefined();
      expect(screen.getByTestId("metric-active-projects")).toBeDefined();
      expect(screen.getByTestId("metric-pending-tasks")).toBeDefined();
      expect(screen.getByTestId("metric-completed-tasks")).toBeDefined();
      expect(screen.getByTestId("metric-critical-tasks")).toBeDefined();
      expect(screen.getByTestId("metric-productivity-score")).toBeDefined();
    });

    expect(screen.getByTestId("metric-active-goals").textContent).toBe("3");
    expect(screen.getByTestId("metric-active-projects").textContent).toBe("2");
    expect(screen.getByTestId("metric-productivity-score").textContent).toBe("88%");
  });

  it("3. Renders Daily Rituals & Execution Card with status and actions", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-daily-routine-card")).toBeDefined();
      expect(screen.getByTestId("dashboard-open-daily-plan-btn")).toBeDefined();
      expect(screen.getByTestId("dashboard-start-morning-btn")).toBeDefined();
      expect(screen.getByTestId("dashboard-start-evening-btn")).toBeDefined();
    });

    expect(screen.getByText("Score: 88%")).toBeDefined();
  });

  it("4. Renders Today's Priorities and handles task completion toggle", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-priorities-card")).toBeDefined();
      expect(screen.getByText("Implement Plan 02-06 Executive Dashboard")).toBeDefined();
      expect(screen.getByText("Score: 220")).toBeDefined();
    });
  });

  it("5. Renders Today's Schedule and toggles block completion", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-schedule-card")).toBeDefined();
      expect(screen.getByText("Deep Focus: Dashboard Architecture")).toBeDefined();
    });

    const toggleBtn = screen.getByTestId("dashboard-block-toggle-block-1");
    expect(toggleBtn).toBeDefined();
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/time-blocks/block-1"),
        expect.any(Object)
      );
    });
  });

  it("6. Renders Multi-Horizon Goals and filters by horizon", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-goals-card")).toBeDefined();
      expect(screen.getByText("Master Personal Knowledge & Productivity OS")).toBeDefined();
    });

    // Switch to Short-Term filter
    const shortTermTab = screen.getByText("Short-Term");
    fireEvent.click(shortTermTab);

    expect(screen.getByText("Ship Phase 2 Core Productivity")).toBeDefined();
    expect(screen.queryByText("Master Personal Knowledge & Productivity OS")).toBeNull();
  });

  it("7. Renders Today's Habits card and supports single-click check-in", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-habits-card")).toBeDefined();
      expect(screen.getByText("Deep Work Routine")).toBeDefined();
    });

    const habitToggle = screen.getByTestId("dashboard-habit-toggle-habit-1");
    fireEvent.click(habitToggle);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/habits/habit-1/toggle",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("8. Renders Active Projects card with progress bar", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-projects-card")).toBeDefined();
      expect(screen.getByText("LifeOS Execution Engine")).toBeDefined();
      expect(screen.getByText("85%")).toBeDefined();
    });
  });

  it("9. Opens Quick Modals when buttons are clicked", async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("quick-add-task-btn")).toBeDefined();
      expect(screen.getByTestId("quick-add-project-btn")).toBeDefined();
      expect(screen.getByTestId("quick-add-goal-btn")).toBeDefined();
      expect(screen.getByTestId("quick-capture-btn")).toBeDefined();
    });

    // Open Task Modal
    fireEvent.click(screen.getByTestId("quick-add-task-btn"));
    expect(screen.getByText("Create New Task")).toBeDefined();
    fireEvent.click(screen.getByText("Cancel"));

    // Open Project Modal
    fireEvent.click(screen.getByTestId("quick-add-project-btn"));
    expect(screen.getByText("Create New Project")).toBeDefined();
    fireEvent.click(screen.getByText("Cancel"));

    // Open Goal Modal
    fireEvent.click(screen.getByTestId("quick-add-goal-btn"));
    expect(screen.getByText("Create New Goal")).toBeDefined();
  });
});
