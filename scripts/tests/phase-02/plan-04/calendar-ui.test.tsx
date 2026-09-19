import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CommitmentBadge, ConflictBadge } from "@/components/ui/badge";
import { TimeBlockCard } from "@/components/calendar/time-block-card";
import { TimeBlockModal } from "@/components/calendar/time-block-modal";
import { UnscheduledTasksDrawer } from "@/components/calendar/unscheduled-tasks-drawer";
import { CalendarDayView } from "@/components/calendar/calendar-day-view";
import { CalendarWeekView } from "@/components/calendar/calendar-week-view";
import { CalendarMonthView } from "@/components/calendar/calendar-month-view";
import CalendarPage from "@/app/calendar/page";
import DashboardPage from "@/app/dashboard/page";
import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";
import type { TimeBlockDTO, TaskDTO, HabitDTO, ProjectDTO, GoalDTO, CalendarFeedDTO } from "@/types";

const MOCK_SESSION = {
  data: { user: { id: "user_test_cal", name: "Hamza Test", email: "hamza@example.com" } },
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
  usePathname: () => "/calendar",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Plan 02-04 Wave 3: Calendar & Time Blocking Engine UI", () => {
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

  const sampleBlocks: TimeBlockDTO[] = [
    {
      id: "tb-1",
      userId: "user_test_cal",
      title: "Deep Work: Architecture Design",
      description: "Draft system boundaries and models",
      startTime: "2026-10-01T09:00:00.000Z",
      endTime: "2026-10-01T11:00:00.000Z",
      durationMinutes: 120,
      actualMinutes: null,
      commitmentLevel: "hard",
      status: "scheduled",
      color: "#6366f1",
      taskId: "task-1",
      taskTitle: "Design Database Models",
      projectId: "proj-1",
      projectTitle: "LifeOS MVP",
      goalId: null,
      habitId: null,
      habitTitle: null,
      completedAt: null,
      createdAt: "2026-09-30T00:00:00.000Z",
      updatedAt: "2026-09-30T00:00:00.000Z",
      hasConflict: true,
      hasHardConflict: true,
      conflictingBlockIds: ["tb-2"],
    },
    {
      id: "tb-2",
      userId: "user_test_cal",
      title: "Client Sync & Review",
      description: "Weekly product review",
      startTime: "2026-10-01T10:30:00.000Z",
      endTime: "2026-10-01T11:30:00.000Z",
      durationMinutes: 60,
      actualMinutes: 60,
      commitmentLevel: "soft",
      status: "completed",
      color: "#10b981",
      taskId: null,
      taskTitle: null,
      projectId: null,
      projectTitle: null,
      goalId: null,
      habitId: "habit-1",
      habitTitle: "Reading Practice",
      completedAt: "2026-10-01T11:30:00.000Z",
      createdAt: "2026-09-30T00:00:00.000Z",
      updatedAt: "2026-10-01T11:30:00.000Z",
      hasConflict: true,
      hasHardConflict: false,
      conflictingBlockIds: ["tb-1"],
    },
  ];

  const sampleTasks: TaskDTO[] = [
    {
      id: "task-1",
      userId: "user_test_cal",
      title: "Design Database Models",
      description: "Create Drizzle models",
      status: "todo",
      priority: "high",
      dueDate: "2026-10-01T17:00:00.000Z",
      estimatedDuration: 120,
      actualDuration: 0,
      projectId: "proj-1",
      parentTaskId: null,
      milestoneId: null,
      scheduledDate: null,
      energyLevel: null,
      recurrenceRule: null,
      goalId: null,
      habitId: null,
      noteId: null,
      personId: null,
      priorityScore: 80,
      completedAt: null,
      tags: [],
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
    },
    {
      id: "task-2",
      userId: "user_test_cal",
      title: "Write End-to-End Tests",
      description: "Playwright journeys",
      status: "in_progress",
      priority: "medium",
      dueDate: null,
      estimatedDuration: 90,
      actualDuration: 45,
      projectId: "proj-1",
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
      completedAt: null,
      tags: [],
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
    },
  ];

  const sampleHabits: HabitDTO[] = [
    {
      id: "habit-1",
      userId: "user_test_cal",
      title: "Reading Practice",
      description: "Read 20 pages",
      frequency: "daily",
      frequencyTarget: 1,
      frequencyDays: [],
      intervalDays: 1,
      targetValue: 20,
      unit: "pages",
      timeOfDay: "morning",
      reminderTime: "08:00",
      goalId: null,
      identityStatement: "I am a continuous learner",
      status: "active",
      currentStreak: 5,
      longestStreak: 10,
      completionRate30d: 90,
      completionRateAllTime: 85,
      isCompletedToday: false,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ];

  const sampleFeed: CalendarFeedDTO = {
    timeBlocks: sampleBlocks,
    deadlines: [
      {
        id: "task-1",
        title: "Design Database Models",
        date: "2026-10-01T17:00:00.000Z",
        type: "task_due",
        priority: "high",
        entityId: "task-1",
      },
    ],
    scheduledTasks: sampleTasks,
    totalScheduledMinutes: 180,
    totalCompletedMinutes: 60,
    conflictCount: 1,
  };

  describe("Badges & Visual Indicators (CAL-04)", () => {
    it("renders CommitmentBadge for hard and soft commitments", () => {
      const { rerender } = render(<CommitmentBadge level="hard" />);
      expect(screen.getByText("Hard")).toBeDefined();

      rerender(<CommitmentBadge level="soft" />);
      expect(screen.getByText("Soft")).toBeDefined();

      rerender(<CommitmentBadge commitment="hard" />);
      expect(screen.getByText("Hard")).toBeDefined();
    });

    it("renders ConflictBadge when hasConflict or hasHardConflict is true", () => {
      const { rerender } = render(<ConflictBadge hasConflict={true} hasHardConflict={false} />);
      expect(screen.getByTestId("badge-soft-conflict")).toBeDefined();

      rerender(<ConflictBadge hasConflict={true} hasHardConflict={true} />);
      expect(screen.getByTestId("badge-hard-conflict")).toBeDefined();

      rerender(<ConflictBadge hasConflict={false} hasHardConflict={false} />);
      expect(screen.queryByTestId("badge-soft-conflict")).toBeNull();
      expect(screen.queryByTestId("badge-hard-conflict")).toBeNull();
    });
  });

  describe("TimeBlockCard Component", () => {
    it("renders card content, linked items, and badges", () => {
      render(
        <TimeBlockCard
          block={sampleBlocks[0]}
          onSelect={vi.fn()}
          onCompleteToggle={vi.fn()}
        />
      );

      expect(screen.getByText("Deep Work: Architecture Design")).toBeDefined();
      expect(screen.getByText("Design Database Models")).toBeDefined();
      expect(screen.getByTestId("badge-hard-conflict")).toBeDefined();
    });

    it("handles click-to-complete toggle", () => {
      const handleToggle = vi.fn();
      render(
        <TimeBlockCard
          block={sampleBlocks[0]}
          onSelect={vi.fn()}
          onCompleteToggle={handleToggle}
        />
      );

      const toggleBtn = screen.getByTestId("timeblock-complete-toggle-tb-1");
      fireEvent.click(toggleBtn);
      expect(handleToggle).toHaveBeenCalledWith(sampleBlocks[0]);
    });

    it("triggers onSelect callback when clicking card body", () => {
      const handleSelect = vi.fn();

      render(
        <TimeBlockCard
          block={sampleBlocks[0]}
          onSelect={handleSelect}
          onCompleteToggle={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId("timeblock-card-tb-1"));
      expect(handleSelect).toHaveBeenCalledWith(sampleBlocks[0]);
    });
  });

  describe("TimeBlockModal Component (CAL-02, CAL-03, CAL-04)", () => {
    it("renders form fields in create mode and submits valid block", async () => {
      const handleSaved = vi.fn();
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ timeBlock: sampleBlocks[0] }),
      } as Response);

      render(
        <TimeBlockModal
          isOpen={true}
          onClose={vi.fn()}
          onSaved={handleSaved}
          initialBlock={{
            startTime: "2026-10-01T09:00:00.000Z",
            endTime: "2026-10-01T10:00:00.000Z",
          }}
          tasks={sampleTasks}
          habits={sampleHabits}
          projects={[]}
          goals={[]}
        />
      );

      expect(screen.getByTestId("timeblock-modal")).toBeDefined();

      const titleInput = screen.getByTestId("timeblock-title-input");
      fireEvent.change(titleInput, { target: { value: "New Coding Sprint" } });

      const form = screen.getByTestId("timeblock-form");
      fireEvent.submit(form);

      await waitFor(() => {
        expect(handleSaved).toHaveBeenCalledWith(sampleBlocks[0]);
      });
    });

    it("pre-fills task data when selected (CAL-02)", () => {
      render(
        <TimeBlockModal
          isOpen={true}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          initialBlock={{
            startTime: "2026-10-01T09:00:00.000Z",
            endTime: "2026-10-01T10:00:00.000Z",
          }}
          tasks={sampleTasks}
          habits={sampleHabits}
          projects={[]}
          goals={[]}
        />
      );

      const taskSelect = screen.getByTestId("timeblock-task-select");
      fireEvent.change(taskSelect, { target: { value: "task-1" } });

      const titleInput = screen.getByTestId("timeblock-title-input") as HTMLInputElement;
      expect(titleInput.value).toBe("Design Database Models");
    });

    it("renders actual minutes field in edit mode (CAL-03)", () => {
      render(
        <TimeBlockModal
          isOpen={true}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          initialBlock={sampleBlocks[0]}
          tasks={sampleTasks}
          habits={sampleHabits}
          projects={[]}
          goals={[]}
        />
      );

      expect(screen.getByTestId("timeblock-actual-minutes-input")).toBeDefined();
    });

    it("displays 409 conflict error banner when save returns 409 (CAL-04)", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: "A conflicting hard commitment exists during this timeframe.",
        }),
      } as Response);

      render(
        <TimeBlockModal
          isOpen={true}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          initialBlock={{
            startTime: "2026-10-01T09:00:00.000Z",
            endTime: "2026-10-01T10:00:00.000Z",
          }}
          tasks={sampleTasks}
          habits={sampleHabits}
          projects={[]}
          goals={[]}
        />
      );

      const titleInput = screen.getByTestId("timeblock-title-input");
      fireEvent.change(titleInput, { target: { value: "Conflicting Hard Block" } });

      const commitmentSelect = screen.getByTestId("timeblock-commitment-select");
      fireEvent.change(commitmentSelect, { target: { value: "hard" } });

      const form = screen.getByTestId("timeblock-form");
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByTestId("conflict-error-banner")).toBeDefined();
        expect(screen.getByText("Scheduling Conflict (409)")).toBeDefined();
      });
    });
  });

  describe("UnscheduledTasksDrawer Component (CAL-02 click-to-block)", () => {
    it("renders unscheduled tasks and triggers onScheduleTask", () => {
      const handleSchedule = vi.fn();
      render(
        <UnscheduledTasksDrawer
          isOpen={true}
          onClose={vi.fn()}
          tasks={sampleTasks}
          onScheduleTask={handleSchedule}
        />
      );

      expect(screen.getByTestId("unscheduled-tasks-drawer")).toBeDefined();
      expect(screen.getByText("Design Database Models")).toBeDefined();
      expect(screen.getByText("Write End-to-End Tests")).toBeDefined();

      const scheduleBtn = screen.getByTestId("schedule-task-btn-task-1");
      fireEvent.click(scheduleBtn);

      expect(handleSchedule).toHaveBeenCalledWith(sampleTasks[0]);
    });
  });

  describe("Calendar Views (CAL-01: Day, Week, Month)", () => {
    it("renders CalendarDayView with 18-hour timeline and deadline banner", () => {
      const handleCreateSlot = vi.fn();
      render(
        <CalendarDayView
          date={new Date("2026-10-01T12:00:00Z")}
          timeBlocks={sampleBlocks}
          deadlines={sampleFeed.deadlines}
          onSelectBlock={vi.fn()}
          onCompleteBlock={vi.fn()}
          onCreateSlot={handleCreateSlot}
        />
      );

      expect(screen.getByTestId("calendar-day-view")).toBeDefined();
      expect(screen.getByTestId("day-deadlines-banner")).toBeDefined();
      expect(screen.getAllByText("Design Database Models").length).toBeGreaterThan(0);

      // Click on hour slot 07:00 (empty slot)
      const slotBtn = screen.getByTestId("create-slot-btn-7");
      fireEvent.click(slotBtn);
      expect(handleCreateSlot).toHaveBeenCalledWith("2026-10-01", "07:00", "08:00");
    });

    it("renders CalendarWeekView with 7 columns", () => {
      render(
        <CalendarWeekView
          startDate={new Date("2026-09-28T00:00:00Z")}
          timeBlocks={sampleBlocks}
          deadlines={sampleFeed.deadlines}
          onSelectBlock={vi.fn()}
          onCompleteBlock={vi.fn()}
          onCreateSlot={vi.fn()}
        />
      );

      expect(screen.getByTestId("calendar-week-view")).toBeDefined();
      expect(screen.getByText("Mon")).toBeDefined();
      expect(screen.getByText("Sun")).toBeDefined();
    });

    it("renders CalendarMonthView with date cells and quick-add buttons", () => {
      const handleCreateSlot = vi.fn();
      render(
        <CalendarMonthView
          currentMonth={new Date("2026-10-01T12:00:00Z")}
          timeBlocks={sampleBlocks}
          deadlines={sampleFeed.deadlines}
          onSelectDay={vi.fn()}
          onSelectBlock={vi.fn()}
          onCreateSlot={handleCreateSlot}
        />
      );

      expect(screen.getByTestId("calendar-month-view")).toBeDefined();
      expect(screen.getByTestId("month-day-cell-2026-10-01")).toBeDefined();
    });
  });

  describe("Calendar Page Integration (/calendar)", () => {
    beforeEach(() => {
      vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/calendar")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ feed: sampleFeed }),
          } as Response;
        }
        if (url.includes("/api/tasks")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ tasks: sampleTasks }),
          } as Response;
        }
        if (url.includes("/api/habits")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ habits: sampleHabits }),
          } as Response;
        }
        if (url.includes("/api/projects")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ projects: [] }),
          } as Response;
        }
        if (url.includes("/api/goals")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ goals: [] }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response;
      });
    });

    it("renders calendar page with stats chips and allows view switching", async () => {
      render(<CalendarPage />);

      await waitFor(() => {
        expect(screen.getByTestId("calendar-page")).toBeDefined();
      });

      // Metric chips
      expect(screen.getByTestId("metric-scheduled-time")).toBeDefined();
      expect(screen.getByTestId("metric-completed-time")).toBeDefined();
      expect(screen.getByTestId("metric-conflicts")).toBeDefined();

      // Switch view to Month
      const monthBtn = screen.getByTestId("calendar-view-month-btn");
      fireEvent.click(monthBtn);
      await waitFor(() => {
        expect(screen.getByTestId("calendar-month-view")).toBeDefined();
      });

      // Switch view to Day
      const dayBtn = screen.getByTestId("calendar-view-day-btn");
      fireEvent.click(dayBtn);
      await waitFor(() => {
        expect(screen.getByTestId("calendar-day-view")).toBeDefined();
      });
    });

    it("opens Unscheduled Tasks Drawer and clicks to block a task", async () => {
      render(<CalendarPage />);

      await waitFor(() => {
        expect(screen.getByTestId("calendar-page")).toBeDefined();
      });

      const drawerBtn = screen.getByTestId("toggle-unscheduled-drawer-btn");
      fireEvent.click(drawerBtn);

      await waitFor(() => {
        expect(screen.getByTestId("unscheduled-tasks-drawer")).toBeDefined();
      });

      const scheduleTaskBtn = screen.getByTestId("schedule-task-btn-task-2");
      fireEvent.click(scheduleTaskBtn);

      // Modal should open with pre-filled title
      await waitFor(() => {
        expect(screen.getByTestId("timeblock-modal")).toBeDefined();
        const titleInput = screen.getByTestId("timeblock-title-input") as HTMLInputElement;
        expect(titleInput.value).toBe("Write End-to-End Tests");
      });
    });
  });

  describe("Dashboard Integration (/dashboard Today's Schedule)", () => {
    beforeEach(() => {
      vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/time-blocks/tb-1/complete")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              timeBlock: { ...sampleBlocks[0], status: "completed", actualMinutes: 120 },
            }),
          } as Response;
        }
        if (url.includes("/api/time-blocks")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ timeBlocks: [sampleBlocks[0]] }),
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
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response;
      });
    });

    it("renders Today's Schedule card and toggles block completion", async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByTestId("dashboard-schedule-card")).toBeDefined();
        expect(screen.getByText("Deep Work: Architecture Design")).toBeDefined();
      });

      const toggleBtn = screen.getByTestId("dashboard-block-toggle-tb-1");
      fireEvent.click(toggleBtn);

      await waitFor(() => {
        const blockTitle = screen.getByText("Deep Work: Architecture Design");
        expect(blockTitle.className).toContain("line-through");
      });
    });
  });

  describe("AppShell & CommandPalette Navigation", () => {
    it("renders Calendar navigation item in AppShell", () => {
      render(
        <AppShell>
          <div>Child Content</div>
        </AppShell>
      );

      const navCalendar = screen.getByTestId("nav-calendar");
      expect(navCalendar).toBeDefined();
      expect(navCalendar.getAttribute("href")).toBe("/calendar");
    });

    it("renders Calendar commands in CommandPalette", () => {
      render(<CommandPalette open={true} onOpenChange={vi.fn()} onOpenQuickCapture={vi.fn()} />);

      expect(screen.getByTestId("cmd-calendar")).toBeDefined();
      expect(screen.getByTestId("cmd-new-time-block")).toBeDefined();

      fireEvent.click(screen.getByTestId("cmd-calendar"));
      expect(mockPush).toHaveBeenCalledWith("/calendar");
    });
  });
});
