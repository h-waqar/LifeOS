import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { FrequencyBadge, TimeOfDayBadge } from "@/components/ui/badge";
import { HabitStatsOverview } from "@/components/habits/habit-stats-overview";
import { HabitCard } from "@/components/habits/habit-card";
import { HabitFormModal } from "@/components/habits/habit-form-modal";
import { HabitDetailModal } from "@/components/habits/habit-detail-modal";
import { HabitDeleteModal } from "@/components/habits/habit-delete-modal";
import HabitsPage from "@/app/habits/page";
import DashboardPage from "@/app/dashboard/page";
import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";
import type { HabitDTO, GoalDTO } from "@/types";

const MOCK_SESSION = {
  data: { user: { id: "user_test_123", name: "Hamza Test", email: "hamza@example.com" } },
  isPending: false,
};

// Mock auth-client session
vi.mock("@/lib/auth-client", () => ({
  useSession: () => MOCK_SESSION,
  signOut: vi.fn(),
}));

// Mock theme-provider
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    theme: "dark",
    resolvedTheme: "dark",
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
  }),
}));

// Mock Next.js navigation
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
  usePathname: () => "/habits",
  useSearchParams: () => mockSearchParams,
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Plan 02-03 Wave 3: UI Dashboard, Navigation & AppShell Integration", () => {
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

  const sampleHabits: HabitDTO[] = [
    {
      id: "habit-1",
      userId: "user_test_123",
      title: "Morning 30-Min Run",
      description: "Consistent outdoor aerobic running",
      frequency: "daily",
      frequencyTarget: 1,
      frequencyDays: [],
      intervalDays: 1,
      targetValue: 30,
      unit: "mins",
      timeOfDay: "morning",
      reminderTime: "07:00",
      goalId: "goal-1",
      identityStatement: "I am an athlete who loves endurance",
      status: "active",
      currentStreak: 12,
      longestStreak: 25,
      completionRate30d: 90,
      completionRateAllTime: 85,
      isCompletedToday: false,
      entries: [
        {
          id: "entry-1",
          userId: "user_test_123",
          habitId: "habit-1",
          date: "2026-09-14",
          value: 30,
          targetValue: 30,
          notes: "Good pace",
          completedAt: "2026-09-14T07:30:00.000Z",
          createdAt: "2026-09-14T07:30:00.000Z",
        },
      ],
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    },
    {
      id: "habit-2",
      userId: "user_test_123",
      title: "Read 20 Pages",
      description: "Non-fiction reading before bed",
      frequency: "weekdays",
      frequencyTarget: 1,
      frequencyDays: [],
      intervalDays: 1,
      targetValue: 20,
      unit: "pages",
      timeOfDay: "evening",
      reminderTime: "21:30",
      goalId: null,
      identityStatement: "I am a lifelong learner",
      status: "active",
      currentStreak: 5,
      longestStreak: 14,
      completionRate30d: 80,
      completionRateAllTime: 75,
      isCompletedToday: true,
      entries: [
        {
          id: "entry-2",
          userId: "user_test_123",
          habitId: "habit-2",
          date: new Date().toISOString().slice(0, 10),
          value: 20,
          targetValue: 20,
          notes: null,
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
    },
    {
      id: "habit-3",
      userId: "user_test_123",
      title: "Strength Training",
      description: "Full body workout",
      frequency: "weekly",
      frequencyTarget: 3,
      frequencyDays: [],
      intervalDays: 1,
      targetValue: 1,
      unit: null,
      timeOfDay: "afternoon",
      reminderTime: null,
      goalId: "goal-1",
      identityStatement: null,
      status: "paused",
      currentStreak: 0,
      longestStreak: 8,
      completionRate30d: 40,
      completionRateAllTime: 50,
      isCompletedToday: false,
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-09-10T00:00:00.000Z",
    },
    {
      id: "habit-4",
      userId: "user_test_123",
      title: "Archived Habit",
      description: "Old routine",
      frequency: "specific_days",
      frequencyTarget: 1,
      frequencyDays: [1, 3, 5],
      intervalDays: 1,
      targetValue: 1,
      unit: null,
      timeOfDay: "anytime",
      reminderTime: null,
      goalId: null,
      identityStatement: null,
      status: "archived",
      currentStreak: 0,
      longestStreak: 4,
      isCompletedToday: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  ];

  const sampleGoals: GoalDTO[] = [
    {
      id: "goal-1",
      userId: "user_test_123",
      title: "Marathon Finish & Peak Health",
      description: "Run first marathon under 3:45",
      horizon: "medium_term",
      area: "health",
      status: "in_progress",
      priority: "high",
      metricType: "numeric",
      targetValue: 42.2,
      currentValue: 30,
      unit: "km",
      startDate: "2026-08-01",
      targetDate: "2026-12-31",
      parentGoalId: null,
      completedAt: null,
      progress: 71,
      childGoalsCount: 0,
      linkedProjectsCount: 1,
      directTasksCount: 2,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-09-10T00:00:00.000Z",
    },
  ];

  describe("UI Badges: FrequencyBadge & TimeOfDayBadge", () => {
    it("renders FrequencyBadge for all supported frequency patterns", () => {
      const { rerender } = render(<FrequencyBadge frequency="daily" />);
      expect(screen.getByText("Daily")).toBeDefined();

      rerender(<FrequencyBadge frequency="weekdays" />);
      expect(screen.getByText("Weekdays")).toBeDefined();

      rerender(<FrequencyBadge frequency="weekly" frequencyTarget={3} />);
      expect(screen.getByText("3x / week")).toBeDefined();

      rerender(<FrequencyBadge frequency="specific_days" frequencyDays={[1, 3, 5]} />);
      expect(screen.getByText("Mon, Wed, Fri")).toBeDefined();

      rerender(<FrequencyBadge frequency="custom" intervalDays={3} />);
      expect(screen.getByText("Every 3d")).toBeDefined();
    });

    it("returns null for FrequencyBadge and TimeOfDayBadge when prop is nullish", () => {
      const { container: c1 } = render(<FrequencyBadge frequency={null} />);
      expect(c1.firstChild).toBeNull();

      const { container: c2 } = render(<TimeOfDayBadge timeOfDay={undefined} />);
      expect(c2.firstChild).toBeNull();
    });

    it("renders TimeOfDayBadge for morning, afternoon, evening, anytime", () => {
      const { rerender } = render(<TimeOfDayBadge timeOfDay="morning" />);
      expect(screen.getByText("Morning")).toBeDefined();

      rerender(<TimeOfDayBadge timeOfDay="afternoon" />);
      expect(screen.getByText("Afternoon")).toBeDefined();

      rerender(<TimeOfDayBadge timeOfDay="evening" />);
      expect(screen.getByText("Evening")).toBeDefined();

      rerender(<TimeOfDayBadge timeOfDay="anytime" />);
      expect(screen.getByText("Anytime")).toBeDefined();
    });
  });

  describe("HabitStatsOverview Component", () => {
    it("accurately calculates and renders active habits, today's completion count and rate, and best streak", () => {
      render(<HabitStatsOverview habits={sampleHabits} />);

      // Active habits: habit-1 and habit-2 are active (habit-3 is paused, habit-4 is archived) -> 2 active
      expect(screen.getByTestId("metric-active-habits").textContent).toContain("2");

      // Completed today: habit-2 has isCompletedToday: true -> 1 completed
      expect(screen.getByTestId("metric-completed-today").textContent).toContain("1");

      // Today's rate: 1 / 2 = 50%
      expect(screen.getByTestId("metric-today-rate").textContent).toContain("50%");

      // Longest streak: max of longest streaks (25)
      expect(screen.getByTestId("metric-longest-streak").textContent).toContain("25");
    });
  });

  describe("HabitCard Component", () => {
    it("renders habit details, cues, identity statement, and streak counts", () => {
      const onToggle = vi.fn();
      const onViewDetails = vi.fn();
      const onEdit = vi.fn();
      const onArchiveToggle = vi.fn();
      const onDelete = vi.fn();

      render(
        <HabitCard
          habit={sampleHabits[0]}
          goalTitle="Marathon Finish & Peak Health"
          onToggle={onToggle}
          onViewDetails={onViewDetails}
          onEdit={onEdit}
          onArchiveToggle={onArchiveToggle}
          onDelete={onDelete}
        />
      );

      expect(screen.getByText("Morning 30-Min Run")).toBeDefined();
      expect(screen.getByText("I am an athlete who loves endurance", { exact: false })).toBeDefined();
      expect(screen.getByText("Marathon Finish & Peak Health")).toBeDefined();
      expect(screen.getByTestId("habit-current-streak-habit-1").textContent).toContain("12");
      expect(screen.getByTestId("habit-best-streak-habit-1").textContent).toContain("25");
      expect(screen.getByTestId("habit-strip-habit-1")).toBeDefined();
    });

    it("triggers single-click toggle when check-in button is clicked", () => {
      const onToggle = vi.fn();
      render(
        <HabitCard
          habit={sampleHabits[0]}
          onToggle={onToggle}
          onViewDetails={vi.fn()}
          onEdit={vi.fn()}
          onArchiveToggle={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      const checkinBtn = screen.getByTestId("habit-checkin-btn-habit-1");
      fireEvent.click(checkinBtn);
      expect(onToggle).toHaveBeenCalledWith(sampleHabits[0]);
    });

    it("disables check-in button when habit is archived", () => {
      const onToggle = vi.fn();
      render(
        <HabitCard
          habit={sampleHabits[3]} // archived
          onToggle={onToggle}
          onViewDetails={vi.fn()}
          onEdit={vi.fn()}
          onArchiveToggle={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      const checkinBtn = screen.getByTestId("habit-checkin-btn-habit-4");
      expect(checkinBtn.hasAttribute("disabled")).toBe(true);
      fireEvent.click(checkinBtn);
      expect(onToggle).not.toHaveBeenCalled();
    });

    it("opens menu and triggers action callbacks for details, edit, archive, and delete", () => {
      const onViewDetails = vi.fn();
      const onEdit = vi.fn();
      const onArchiveToggle = vi.fn();
      const onDelete = vi.fn();

      render(
        <HabitCard
          habit={sampleHabits[0]}
          onToggle={vi.fn()}
          onViewDetails={onViewDetails}
          onEdit={onEdit}
          onArchiveToggle={onArchiveToggle}
          onDelete={onDelete}
        />
      );

      // Open menu
      const menuBtn = screen.getByTestId("habit-menu-btn-habit-1");
      fireEvent.click(menuBtn);

      // Details
      const detailBtn = screen.getByTestId("habit-action-detail-habit-1");
      fireEvent.click(detailBtn);
      expect(onViewDetails).toHaveBeenCalledWith(sampleHabits[0]);

      // Reopen menu and click edit
      fireEvent.click(menuBtn);
      fireEvent.click(screen.getByTestId("habit-action-edit-habit-1"));
      expect(onEdit).toHaveBeenCalledWith(sampleHabits[0]);

      // Reopen menu and click archive
      fireEvent.click(menuBtn);
      fireEvent.click(screen.getByTestId("habit-action-archive-habit-1"));
      expect(onArchiveToggle).toHaveBeenCalledWith(sampleHabits[0]);

      // Reopen menu and click delete
      fireEvent.click(menuBtn);
      fireEvent.click(screen.getByTestId("habit-action-delete-habit-1"));
      expect(onDelete).toHaveBeenCalledWith(sampleHabits[0]);
    });
  });

  describe("HabitFormModal Component", () => {
    it("renders create form and handles submission with custom frequency settings", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <HabitFormModal
          isOpen={true}
          onClose={onClose}
          goals={sampleGoals}
          onSubmit={onSubmit}
        />
      );

      expect(screen.getByText("Create New Habit")).toBeDefined();

      // Enter Title
      fireEvent.change(screen.getByTestId("habit-title-input"), {
        target: { value: "Daily Meditation" },
      });

      // Enter Identity Statement
      fireEvent.change(screen.getByTestId("habit-identity-input"), {
        target: { value: "I am calm, focused, and present" },
      });

      // Change frequency to weekly
      fireEvent.change(screen.getByTestId("habit-frequency-select"), {
        target: { value: "weekly" },
      });

      // Frequency target input should appear
      const targetInput = screen.getByTestId("habit-frequency-target-input");
      fireEvent.change(targetInput, { target: { value: "4" } });

      // Link goal
      fireEvent.change(screen.getByTestId("habit-goal-select"), {
        target: { value: "goal-1" },
      });

      // Submit
      fireEvent.click(screen.getByTestId("habit-form-submit"));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Daily Meditation",
            identityStatement: "I am calm, focused, and present",
            frequency: "weekly",
            frequencyTarget: 4,
            goalId: "goal-1",
          })
        );
      });
      expect(onClose).toHaveBeenCalled();
    });

    it("supports specific_days chips toggle in frequency selection", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      render(
        <HabitFormModal
          isOpen={true}
          onClose={vi.fn()}
          goals={sampleGoals}
          onSubmit={onSubmit}
        />
      );

      fireEvent.change(screen.getByTestId("habit-title-input"), {
        target: { value: "Gym Lifting" },
      });

      // Select specific days
      fireEvent.change(screen.getByTestId("habit-frequency-select"), {
        target: { value: "specific_days" },
      });

      // Toggle Mon (1) and Fri (5)
      fireEvent.click(screen.getByTestId("day-chip-1"));
      fireEvent.click(screen.getByTestId("day-chip-5"));

      fireEvent.click(screen.getByTestId("habit-form-submit"));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Gym Lifting",
            frequency: "specific_days",
            frequencyDays: [1, 5],
          })
        );
      });
    });
  });

  describe("HabitDetailModal Component", () => {
    it("fetches habit details, renders 5 consistency metrics, and handles past date toggle", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/habits/habit-1/toggle")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ action: "created", completed: true }),
          });
        }
        if (url.includes("/api/habits/habit-1")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              habit: sampleHabits[0],
              entries: sampleHabits[0].entries,
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });
      global.fetch = mockFetch as any;

      const onEdit = vi.fn();
      const onHabitUpdated = vi.fn();

      render(
        <HabitDetailModal
          isOpen={true}
          onClose={vi.fn()}
          habitId="habit-1"
          goalTitle="Marathon Finish & Peak Health"
          onEdit={onEdit}
          onHabitUpdated={onHabitUpdated}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("habit-detail-view")).toBeDefined();
      });

      // Metrics
      expect(screen.getByTestId("detail-current-streak").textContent).toContain("12");
      expect(screen.getByTestId("detail-longest-streak").textContent).toContain("25");
      expect(screen.getByTestId("detail-30d-rate").textContent).toContain("90%");
      expect(screen.getByTestId("detail-alltime-rate").textContent).toContain("85%");

      // History matrix rendered
      expect(screen.getByTestId("habit-history-grid")).toBeDefined();

      // Click a day in the 30-day matrix
      const dayBtn = screen.getByTestId("history-day-2026-09-14");
      fireEvent.click(dayBtn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/habits/habit-1/toggle",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ date: "2026-09-14" }),
          })
        );
      });
    });
  });

  describe("HabitDeleteModal Component", () => {
    it("renders confirmation warning and calls onConfirm on click", async () => {
      const onConfirm = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <HabitDeleteModal
          isOpen={true}
          onClose={onClose}
          habit={sampleHabits[0]}
          onConfirm={onConfirm}
        />
      );

      expect(screen.getByRole("heading", { name: "Delete Habit" })).toBeDefined();
      expect(screen.getByText(/Are you sure you want to delete/)).toBeDefined();

      fireEvent.click(screen.getByTestId("confirm-delete-habit"));
      expect(onConfirm).toHaveBeenCalled();
    });
  });

  describe("Habits Dashboard Page (/habits)", () => {
    beforeEach(() => {
      const mockFetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (url === "/api/habits") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ habits: JSON.parse(JSON.stringify(sampleHabits)) }),
          });
        }
        if (url === "/api/goals") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ goals: JSON.parse(JSON.stringify(sampleGoals)) }),
          });
        }
        if (url.includes("/api/habits/habit-1/toggle")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              toggled: true,
              completed: true,
              stats: {
                currentStreak: 13,
                longestStreak: 25,
                completionRate30d: 93,
                completionRateAllTime: 86,
                isCompletedToday: true,
                totalCompletions: 31,
              },
            }),
          });
        }
        return Promise.reject(new Error(`Unknown fetch URL: ${url}`));
      });
      global.fetch = mockFetch as any;
    });

    it("loads habits and goals on mount and renders habit cards", async () => {
      render(<HabitsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("habits-dashboard-view")).toBeDefined();
      });

      // Header
      expect(screen.getByText("Habits & Streaks")).toBeDefined();

      // Cards
      expect(screen.getByText("Morning 30-Min Run")).toBeDefined();
      expect(screen.getByText("Read 20 Pages")).toBeDefined();
    });

    it("filters habits by Time-of-Day tab and status", async () => {
      render(<HabitsPage />);

      await waitFor(() => {
        expect(screen.getByText("Morning 30-Min Run")).toBeDefined();
      });

      // Filter by Evening tab
      const eveningTab = screen.getByTestId("tab-evening");
      fireEvent.click(eveningTab);

      // Morning run should be hidden, Read 20 pages should be shown
      await waitFor(() => {
        expect(screen.queryByText("Morning 30-Min Run")).toBeNull();
        expect(screen.getByText("Read 20 Pages")).toBeDefined();
      });

      // Filter back to all
      fireEvent.click(screen.getByTestId("tab-all"));
      await waitFor(() => {
        expect(screen.getByText("Morning 30-Min Run")).toBeDefined();
      });
    });

    it("performs optimistic single-click check-in toggle and reconciles with server stats", async () => {
      render(<HabitsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("habit-card-habit-1")).toBeDefined();
      });

      const checkinBtn = screen.getByTestId("habit-checkin-btn-habit-1");
      fireEvent.click(checkinBtn);

      // Optimistic update: streak increments to 13
      await waitFor(() => {
        expect(screen.getByTestId("habit-current-streak-habit-1").textContent).toContain("13");
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/habits/habit-1/toggle",
          expect.objectContaining({ method: "POST" })
        );
      });
    });

    it("rolls back optimistic check-in if server returns error", async () => {
      // Force toggle failure
      (global.fetch as any).mockImplementation((url: string, opts?: RequestInit) => {
        if (url.includes("/api/habits/habit-1/toggle")) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({ error: "Database connection failed" }),
          });
        }
        if (url === "/api/habits") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ habits: [...sampleHabits] }),
          });
        }
        if (url === "/api/goals") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ goals: [...sampleGoals] }),
          });
        }
        return Promise.reject(new Error("Unknown"));
      });

      render(<HabitsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("habit-card-habit-1")).toBeDefined();
      });

      const checkinBtn = screen.getByTestId("habit-checkin-btn-habit-1");
      fireEvent.click(checkinBtn);

      // Rollback to original streak (12) after error
      await waitFor(() => {
        expect(screen.getByTestId("habit-current-streak-habit-1").textContent).toContain("12");
      });
    });

    it("opens create habit modal when clicking 'New Habit' button", async () => {
      render(<HabitsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("new-habit-btn")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("new-habit-btn"));
      expect(screen.getByText("Create New Habit")).toBeDefined();
    });
  });

  describe("AppShell & CommandPalette Integration", () => {
    it("renders Habits in AppShell navigation with Flame icon", () => {
      render(
        <AppShell>
          <div>Page Content</div>
        </AppShell>
      );

      const navHabits = screen.getByTestId("nav-habits");
      expect(navHabits).toBeDefined();
      expect(navHabits.getAttribute("href")).toBe("/habits");
      expect(navHabits.textContent).toContain("Habits");
    });

    it("includes Go to Habits and Create New Habit in CommandPalette", () => {
      render(
        <CommandPalette open={true} onOpenChange={vi.fn()} onOpenQuickCapture={vi.fn()} />
      );

      expect(screen.getByTestId("cmd-habits")).toBeDefined();
      expect(screen.getByText("Go to Habits")).toBeDefined();
      expect(screen.getByTestId("cmd-new-habit")).toBeDefined();
      expect(screen.getByText("Create New Habit")).toBeDefined();
    });
  });

  describe("Main Dashboard Habit Integration (/dashboard)", () => {
    it("renders Today's Habits card on main dashboard and supports single-click check-in", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (url === "/api/projects") {
          return Promise.resolve({ ok: true, json: async () => ({ projects: [] }) });
        }
        if (url === "/api/tasks") {
          return Promise.resolve({ ok: true, json: async () => ({ tasks: [] }) });
        }
        if (url.includes("/api/habits")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ habits: [sampleHabits[0]] }),
          });
        }
        if (url.includes("/api/time-blocks")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ timeBlocks: [] }),
          });
        }
        if (url.includes("/api/habits/habit-1/toggle") && opts?.method === "POST") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              toggled: true,
              completed: true,
              stats: { currentStreak: 13, isCompletedToday: true },
            }),
          });
        }
        return Promise.reject(new Error("Unknown"));
      });
      global.fetch = mockFetch as any;

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByTestId("dashboard-habits-card")).toBeDefined();
      });

      expect(screen.getByText("Today's Habits")).toBeDefined();
      expect(screen.getByText("Morning 30-Min Run")).toBeDefined();

      // Check in directly from dashboard
      const toggleBtn = screen.getByTestId("dashboard-habit-toggle-habit-1");
      fireEvent.click(toggleBtn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/habits/habit-1/toggle",
          expect.objectContaining({ method: "POST" })
        );
      });
    });
  });
});
