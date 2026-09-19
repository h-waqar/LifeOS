import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MorningPlanView } from "@/components/daily-plan/morning-plan-view";
import { EveningReviewView } from "@/components/daily-plan/evening-review-view";
import { DailyPlanHistoryView } from "@/components/daily-plan/daily-plan-history-view";
import DailyPlanPage from "@/app/daily-plan/page";
import DashboardPage from "@/app/dashboard/page";
import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";
import type { DailyPlanContextDTO, DailyPlanDTO, DailyPlanHistoryDTO, TaskDTO, HabitDTO, TimeBlockDTO } from "@/types";

const MOCK_SESSION = {
  data: { user: { id: "user_test_daily_plan", name: "Hamza Test", email: "hamza@example.com" } },
  isPending: false,
};

vi.mock("@/lib/auth-client", () => ({
  useSession: () => MOCK_SESSION,
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

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRefresh = vi.fn();
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
  refresh: mockRefresh,
};
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/daily-plan",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("Plan 02-05 Wave 3: Daily Planning & Evening Review UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockRefresh.mockReset();
    mockSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const sampleTasks: TaskDTO[] = [
    {
      id: "task-1",
      userId: "user_test_daily_plan",
      title: "Write Core Architecture Docs",
      description: "Define modules and schemas",
      status: "todo",
      priority: "high",
      dueDate: "2026-10-01T17:00:00.000Z",
      estimatedDuration: 90,
      actualDuration: 0,
      projectId: "proj-1",
      parentTaskId: null,
      milestoneId: null,
      scheduledDate: "2026-10-01T00:00:00.000Z",
      energyLevel: null,
      recurrenceRule: null,
      goalId: null,
      habitId: null,
      noteId: null,
      personId: null,
      priorityScore: 85,
      tags: ["architecture", "docs"],
      completedAt: null,
      createdAt: "2026-09-30T00:00:00.000Z",
      updatedAt: "2026-09-30T00:00:00.000Z",
    },
    {
      id: "task-2",
      userId: "user_test_daily_plan",
      title: "Configure Database Backup Cron",
      description: "Automate offsite backups",
      status: "todo",
      priority: "medium",
      dueDate: "2026-09-30T17:00:00.000Z", // overdue
      estimatedDuration: 45,
      actualDuration: 0,
      projectId: null,
      parentTaskId: null,
      milestoneId: null,
      scheduledDate: null,
      energyLevel: null,
      recurrenceRule: null,
      goalId: null,
      habitId: null,
      noteId: null,
      personId: null,
      priorityScore: 60,
      tags: ["ops", "infra"],
      completedAt: null,
      createdAt: "2026-09-29T00:00:00.000Z",
      updatedAt: "2026-09-29T00:00:00.000Z",
    },
  ];

  const sampleHabits: HabitDTO[] = [
    {
      id: "habit-1",
      userId: "user_test_daily_plan",
      title: "Morning Meditation",
      description: "15 minutes mindfulness",
      frequency: "daily",
      frequencyTarget: 1,
      frequencyDays: [1, 2, 3, 4, 5, 6, 7],
      intervalDays: 1,
      targetValue: 1,
      unit: null,
      timeOfDay: "morning",
      reminderTime: "07:00",
      goalId: null,
      identityStatement: "I am mindful and grounded",
      currentStreak: 5,
      longestStreak: 12,
      status: "active",
      isCompletedToday: false,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-30T00:00:00.000Z",
    },
  ];

  const sampleBlocks: TimeBlockDTO[] = [
    {
      id: "tb-1",
      userId: "user_test_daily_plan",
      title: "Morning Deep Work",
      description: "Focus on Core Architecture",
      startTime: "2026-10-01T09:00:00.000Z",
      endTime: "2026-10-01T11:00:00.000Z",
      durationMinutes: 120,
      actualMinutes: null,
      commitmentLevel: "hard",
      status: "scheduled",
      color: "#6366f1",
      taskId: "task-1",
      taskTitle: "Write Core Architecture Docs",
      projectId: "proj-1",
      projectTitle: "LifeOS MVP",
      goalId: null,
      habitId: null,
      habitTitle: null,
      completedAt: null,
      createdAt: "2026-09-30T00:00:00.000Z",
      updatedAt: "2026-09-30T00:00:00.000Z",
      hasConflict: false,
      hasHardConflict: false,
      conflictingBlockIds: [],
    },
  ];

  const samplePlan: DailyPlanDTO = {
    id: "plan-1",
    userId: "user_test_daily_plan",
    date: "2026-10-01",
    status: "in_progress",
    priorityTaskIds: ["task-1"],
    habitIntentionIds: ["habit-1"],
    morningNotes: "Focus on deep architecture thinking today.",
    completedAt: null,
    createdAt: "2026-10-01T07:30:00.000Z",
    updatedAt: "2026-10-01T07:30:00.000Z",
  };

  const sampleContext: DailyPlanContextDTO = {
    date: "2026-10-01",
    plan: samplePlan,
    review: null,
    priorityTasks: [sampleTasks[0]],
    overdueTasks: [sampleTasks[1]],
    todayHabits: sampleHabits,
    todayTimeBlocks: sampleBlocks,
    suggestedTasks: [sampleTasks[1]],
  };

  const sampleHistory: DailyPlanHistoryDTO = {
    totalDays: 7,
    morningPlanCompletionRate: 85,
    eveningReviewCompletionRate: 71,
    averageProductivityScore: 82,
    days: [
      {
        date: "2026-10-01",
        hasMorningPlan: true,
        morningPlanCompleted: true,
        hasEveningReview: true,
        productivityScore: 88,
        priorityTasksCount: 3,
        completedPriorityTasksCount: 3,
        habitsCount: 2,
        completedHabitsCount: 2,
        reflections: {
          positive: "Crushed architecture design today!",
          challenges: "Distracted around 2pm",
          notes: "Need more water",
        },
      },
    ],
  };

  describe("MorningPlanView (PLAN-01)", () => {
    it("renders guided stepper and allows step progression and completion", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ plan: { ...samplePlan, status: "completed" } }),
      } as Response);

      const onRefresh = vi.fn();

      render(
        <MorningPlanView
          date="2026-10-01"
          context={sampleContext}
          onRefresh={onRefresh}
        />
      );

      // Verify Morning View is rendered
      expect(screen.getByTestId("morning-plan-view")).toBeDefined();

      // Step 1: Review Overdue & Unfinished Work
      expect(screen.getByText("Step 1: Review Overdue & Unfinished Work")).toBeDefined();
      expect(screen.getByText("Configure Database Backup Cron")).toBeDefined();

      // Click "Continue to Priorities"
      fireEvent.click(screen.getByTestId("morning-next-step-1"));

      // Step 2: Daily Priorities
      await waitFor(() => {
        expect(screen.getByText("Step 2: Pick 3–5 Priority Tasks (PLAN-01)")).toBeDefined();
      });

      // Toggle task priority selection
      const toggleTaskBtn = screen.getByTestId("task-row-task-1");
      fireEvent.click(toggleTaskBtn);

      // Navigate to Step 3: Habit Intentions
      fireEvent.click(screen.getByTestId("morning-next-step-2"));
      await waitFor(() => {
        expect(screen.getByText("Step 3: Review Habit Intentions (PLAN-01)")).toBeDefined();
      });

      // Toggle habit intention
      const toggleHabitBtn = screen.getByTestId("habit-intention-row-habit-1");
      fireEvent.click(toggleHabitBtn);

      // Navigate to Step 4: Daily Focus & Intention
      fireEvent.click(screen.getByTestId("morning-next-step-3"));
      await waitFor(() => {
        expect(screen.getByText("Step 4: Time Blocking & Morning Commitment (PLAN-01)")).toBeDefined();
      });

      // Type morning notes
      const notesTextarea = screen.getByTestId("morning-notes-textarea");
      fireEvent.change(notesTextarea, { target: { value: "Build cleanly and stay hydrated." } });

      // Click Complete Morning Routine
      const completeBtn = screen.getByTestId("complete-morning-plan-btn");
      fireEvent.click(completeBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/daily-plan",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining('"complete":true'),
          })
        );
        expect(onRefresh).toHaveBeenCalled();
      });
    });

    it("supports Save Progress draft without completing", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ plan: samplePlan }),
      } as Response);

      const onRefresh = vi.fn();

      render(
        <MorningPlanView
          date="2026-10-01"
          context={sampleContext}
          onRefresh={onRefresh}
        />
      );

      // Jump directly to step 4 via step pill
      fireEvent.click(screen.getByTestId("morning-step-btn-4"));

      await waitFor(() => {
        expect(screen.getByTestId("save-draft-plan-btn")).toBeDefined();
      });

      const saveDraftBtn = screen.getByTestId("save-draft-plan-btn");
      fireEvent.click(saveDraftBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/daily-plan",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining('"complete":false'),
          })
        );
        expect(onRefresh).toHaveBeenCalled();
      });
    });
  });

  describe("EveningReviewView (PLAN-02, PLAN-03)", () => {
    it("renders evening review stepper, calculates productivity score, and handles rollover", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/daily-plan/evening-review")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ review: { id: "rev-1", productivityScore: 90 } }),
          } as Response;
        }
        if (url.includes("/api/daily-plan/rollover")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ processedCount: 1 }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response;
      });

      const onRefresh = vi.fn();

      render(
        <EveningReviewView
          date="2026-10-01"
          context={sampleContext}
          onRefresh={onRefresh}
        />
      );

      // Verify Evening View is rendered
      expect(screen.getByTestId("evening-review-view")).toBeDefined();

      // Step 1: Task Outcomes
      expect(screen.getByText("Step 1: Review Tasks (PLAN-02)")).toBeDefined();

      // Navigate to Step 2: Habit Review
      fireEvent.click(screen.getByTestId("evening-next-step-1"));
      await waitFor(() => {
        expect(screen.getByText("Step 2: Habits Review (PLAN-02)")).toBeDefined();
      });

      // Toggle habit completion
      const toggleHabitBtn = screen.getByTestId("evening-habit-toggle-habit-1");
      fireEvent.click(toggleHabitBtn);

      // Navigate to Step 3: Reflections & Productivity Score
      fireEvent.click(screen.getByTestId("evening-next-step-2"));
      await waitFor(() => {
        expect(screen.getByText("Step 3: Reflections & Productivity Score (PLAN-02)")).toBeDefined();
      });

      // Enter reflection notes in Step 3
      const positiveInput = screen.getByTestId("positive-reflections-textarea");
      fireEvent.change(positiveInput, { target: { value: "Great focus session in the morning" } });

      // Navigate to Step 4: Zero-Duplication Rollover
      fireEvent.click(screen.getByTestId("evening-next-step-3"));
      await waitFor(() => {
        expect(screen.getByText("Step 4: Zero-Duplication Rollover (PLAN-03)")).toBeDefined();
      });

      // Click carry over button for incomplete task
      const carryOverBtn = screen.getByTestId("rollover-carry-over-task-1");
      fireEvent.click(carryOverBtn);

      // Submit evening review
      const submitBtn = screen.getByTestId("complete-evening-review-btn");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/daily-plan/evening-review",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining('"positiveReflections":"Great focus session in the morning"'),
          })
        );
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/daily-plan/rollover",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining('"action":"carry_over"'),
          })
        );
        expect(onRefresh).toHaveBeenCalled();
      });
    });
  });

  describe("DailyPlanHistoryView (PLAN-04)", () => {
    it("renders history metrics and list of past days", () => {
      render(
        <DailyPlanHistoryView
          initialHistory={sampleHistory}
          onSelectDate={vi.fn()}
        />
      );

      expect(screen.getByTestId("daily-plan-history-view")).toBeDefined();
      expect(screen.getByTestId("metric-morning-rate")).toBeDefined();
      expect(screen.getByTestId("metric-evening-rate")).toBeDefined();
      expect(screen.getByTestId("metric-avg-score")).toBeDefined();

      // Check text inside metric chips
      expect(screen.getByText("85%")).toBeDefined();
      expect(screen.getByText("71%")).toBeDefined();
      expect(screen.getByTestId("metric-avg-score").textContent).toContain("82");

      // Check day row rendered
      expect(screen.getByTestId("history-day-2026-10-01")).toBeDefined();
      expect(screen.getByText("Crushed architecture design today!")).toBeDefined();
    });
  });

  describe("DailyPlanPage Integration (/daily-plan)", () => {
    beforeEach(() => {
      vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/daily-plan/history")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ history: sampleHistory }),
          } as Response;
        }
        if (url.includes("/api/daily-plan")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ context: sampleContext }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response;
      });
    });

    it("renders daily plan page and allows tab switching", async () => {
      render(<DailyPlanPage />);

      await waitFor(() => {
        expect(screen.getByTestId("daily-plan-page")).toBeDefined();
      });

      // Default tab: Morning Plan
      expect(screen.getByTestId("morning-plan-view")).toBeDefined();

      // Switch to Evening Review tab
      const eveningTabBtn = screen.getByTestId("tab-evening-review");
      fireEvent.click(eveningTabBtn);

      await waitFor(() => {
        expect(screen.getByTestId("evening-review-view")).toBeDefined();
      });

      // Switch to History tab
      const historyTabBtn = screen.getByTestId("tab-daily-history");
      fireEvent.click(historyTabBtn);

      await waitFor(() => {
        expect(screen.getByTestId("daily-plan-history-view")).toBeDefined();
      });
    });

    it("navigates calendar dates using header controls", async () => {
      render(<DailyPlanPage />);

      await waitFor(() => {
        expect(screen.getByTestId("daily-plan-page")).toBeDefined();
      });

      const prevDayBtn = screen.getByTestId("date-nav-prev");
      fireEvent.click(prevDayBtn);

      const nextDayBtn = screen.getByTestId("date-nav-next");
      fireEvent.click(nextDayBtn);

      const todayBtn = screen.getByTestId("date-nav-today");
      fireEvent.click(todayBtn);

      expect(screen.getByTestId("daily-plan-page")).toBeDefined();
    });
  });

  describe("Dashboard Integration (/dashboard Daily Routine Widget)", () => {
    beforeEach(() => {
      vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/daily-plan")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ context: sampleContext }),
          } as Response;
        }
        if (url.includes("/api/projects")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ projects: [] }),
          } as Response;
        }
        if (url.includes("/api/tasks")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ tasks: [] }),
          } as Response;
        }
        if (url.includes("/api/habits")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ habits: [] }),
          } as Response;
        }
        if (url.includes("/api/time-blocks")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ timeBlocks: [] }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response;
      });
    });

    it("renders Daily Rituals card with quick links to morning and evening workflows", async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByTestId("dashboard-daily-routine-card")).toBeDefined();
      });

      expect(screen.getByTestId("dashboard-open-daily-plan-btn")).toBeDefined();
      expect(screen.getByTestId("dashboard-start-morning-btn")).toBeDefined();
      expect(screen.getByTestId("dashboard-start-evening-btn")).toBeDefined();
    });
  });

  describe("AppShell & CommandPalette Navigation", () => {
    it("renders Daily Plan navigation link in AppShell", () => {
      render(
        <AppShell>
          <div>Child Content</div>
        </AppShell>
      );

      const navDailyPlan = screen.getByTestId("nav-daily-plan");
      expect(navDailyPlan).toBeDefined();
      expect(navDailyPlan.getAttribute("href")).toBe("/daily-plan");
    });

    it("renders Daily Plan commands in CommandPalette", () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} onOpenQuickCapture={vi.fn()} />);

      expect(screen.getByTestId("cmd-daily-plan")).toBeDefined();
      expect(screen.getByTestId("cmd-morning-routine")).toBeDefined();
      expect(screen.getByTestId("cmd-evening-review")).toBeDefined();

      fireEvent.click(screen.getByTestId("cmd-daily-plan"));
      expect(mockPush).toHaveBeenCalledWith("/daily-plan");
    });
  });
});
