"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { TimeBlockModal } from "@/components/calendar/time-block-modal";
import { CalendarDayView } from "@/components/calendar/calendar-day-view";
import { CalendarWeekView } from "@/components/calendar/calendar-week-view";
import { CalendarMonthView } from "@/components/calendar/calendar-month-view";
import { UnscheduledTasksDrawer } from "@/components/calendar/unscheduled-tasks-drawer";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Loader2,
  ListTodo,
} from "lucide-react";
import { toast } from "sonner";
import type {
  TimeBlockDTO,
  CalendarFeedDTO,
  CalendarEventDeadline,
  TaskDTO,
  HabitDTO,
  ProjectDTO,
  GoalDTO,
} from "@/types";

type CalendarViewMode = "day" | "week" | "month";

function formatMinutes(mins: number): string {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function CalendarPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <CalendarContent />
    </React.Suspense>
  );
}

function CalendarContent() {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();

  const [viewMode, setViewMode] = React.useState<CalendarViewMode>("week");
  const [currentDate, setCurrentDate] = React.useState<Date>(new Date());

  const [feed, setFeed] = React.useState<CalendarFeedDTO>({
    timeBlocks: [],
    deadlines: [],
    scheduledTasks: [],
    totalScheduledMinutes: 0,
    totalCompletedMinutes: 0,
    conflictCount: 0,
  });

  const [tasks, setTasks] = React.useState<TaskDTO[]>([]);
  const [habits, setHabits] = React.useState<HabitDTO[]>([]);
  const [projects, setProjects] = React.useState<ProjectDTO[]>([]);
  const [goals, setGoals] = React.useState<GoalDTO[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [activeBlock, setActiveBlock] = React.useState<Partial<TimeBlockDTO> | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Compute start and end dates based on viewMode and currentDate
  const dateRange = React.useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const d = currentDate.getDate();

    if (viewMode === "day") {
      const dayStart = new Date(y, m, d);
      return {
        startDate: dayStart.toISOString().slice(0, 10),
        endDate: dayStart.toISOString().slice(0, 10),
      };
    } else if (viewMode === "week") {
      // Monday of the week
      const dayOfWeek = (currentDate.getDay() + 6) % 7;
      const monday = new Date(y, m, d - dayOfWeek);
      const sunday = new Date(y, m, d - dayOfWeek + 6);
      return {
        startDate: monday.toISOString().slice(0, 10),
        endDate: sunday.toISOString().slice(0, 10),
        monday,
      };
    } else {
      // Full month range
      const firstDay = new Date(y, m, 1);
      const lastDay = new Date(y, m + 1, 0);
      return {
        startDate: firstDay.toISOString().slice(0, 10),
        endDate: lastDay.toISOString().slice(0, 10),
      };
    }
  }, [currentDate, viewMode]);

  // Fetch feed and ancillary data
  const fetchCalendarData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [feedRes, tasksRes, habitsRes, projRes, goalsRes] = await Promise.all([
        fetch(
          `/api/calendar?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&view=${viewMode}`
        ),
        fetch("/api/tasks"),
        fetch("/api/habits?status=active"),
        fetch("/api/projects"),
        fetch("/api/goals"),
      ]);

      if (
        feedRes.status === 401 ||
        tasksRes.status === 401 ||
        habitsRes.status === 401
      ) {
        router.replace("/login");
        return;
      }

      if (feedRes.ok) {
        const feedData = await feedRes.json();
        setFeed(feedData.feed);
      }

      if (tasksRes.ok) {
        const taskData = await tasksRes.json();
        setTasks(taskData.tasks || []);
      }

      if (habitsRes.ok) {
        const habitData = await habitsRes.json();
        setHabits(habitData.habits || []);
      }

      if (projRes.ok) {
        const projData = await projRes.json();
        setProjects(projData.projects || []);
      }

      if (goalsRes.ok) {
        const goalData = await goalsRes.json();
        setGoals(goalData.goals || []);
      }
    } catch (err) {
      toast.error("Failed to load calendar data");
    } finally {
      setLoading(false);
    }
  }, [dateRange, viewMode, router]);

  React.useEffect(() => {
    if (!sessionLoading) {
      if (!session?.user) {
        router.replace("/login");
      } else {
        fetchCalendarData();
      }
    }
  }, [sessionLoading, session, fetchCalendarData, router]);

  // Date Navigation handlers
  const handlePrev = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "day") {
        next.setDate(next.getDate() - 1);
      } else if (viewMode === "week") {
        next.setDate(next.getDate() - 7);
      } else {
        next.setMonth(next.getMonth() - 1);
      }
      return next;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "day") {
        next.setDate(next.getDate() + 1);
      } else if (viewMode === "week") {
        next.setDate(next.getDate() + 7);
      } else {
        next.setMonth(next.getMonth() + 1);
      }
      return next;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Header Title
  const headerTitle = React.useMemo(() => {
    const y = currentDate.getFullYear();
    const monthName = currentDate.toLocaleDateString(undefined, { month: "long" });

    if (viewMode === "day") {
      return currentDate.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } else if (viewMode === "week") {
      const dayOfWeek = (currentDate.getDay() + 6) % 7;
      const monday = new Date(currentDate);
      monday.setDate(monday.getDate() - dayOfWeek);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);

      const monStr = monday.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const sunStr = sunday.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      return `${monStr} – ${sunStr}`;
    } else {
      return `${monthName} ${y}`;
    }
  }, [currentDate, viewMode]);

  // Handle clicking empty slot
  const handleCreateSlot = (dateStr: string, startTimeStr: string, endTimeStr: string) => {
    setActiveBlock({
      startTime: `${dateStr}T${startTimeStr}:00.000Z`,
      endTime: `${dateStr}T${endTimeStr}:00.000Z`,
      commitmentLevel: "soft",
    });
    setModalOpen(true);
  };

  // Handle selecting block to edit
  const handleSelectBlock = (block: TimeBlockDTO) => {
    setActiveBlock(block);
    setModalOpen(true);
  };

  // Handle schedule task from backlog drawer
  const handleScheduleTask = (task: TaskDTO) => {
    setDrawerOpen(false);
    const now = new Date(currentDate);
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    setActiveBlock({
      title: task.title,
      taskId: task.id,
      projectId: task.projectId ?? undefined,
      goalId: task.goalId ?? undefined,
      habitId: task.habitId ?? undefined,
      durationMinutes: task.estimatedDuration || 60,
      startTime: `${dateStr}T09:00:00.000Z`,
      endTime: `${dateStr}T10:00:00.000Z`,
      commitmentLevel: "soft",
    });
    setModalOpen(true);
  };

  // Handle single-click complete toggle
  const handleCompleteToggle = async (block: TimeBlockDTO) => {
    const isCurrentlyCompleted = block.status === "completed";

    // Optimistic update
    setFeed((prev) => ({
      ...prev,
      timeBlocks: prev.timeBlocks.map((b) =>
        b.id === block.id
          ? {
              ...b,
              status: isCurrentlyCompleted ? "scheduled" : "completed",
              completedAt: isCurrentlyCompleted ? null : new Date().toISOString(),
              actualMinutes: isCurrentlyCompleted ? null : b.durationMinutes,
            }
          : b
      ),
      totalCompletedMinutes: isCurrentlyCompleted
        ? Math.max(0, prev.totalCompletedMinutes - (block.actualMinutes ?? block.durationMinutes))
        : prev.totalCompletedMinutes + block.durationMinutes,
    }));

    try {
      if (isCurrentlyCompleted) {
        // Reopen to scheduled
        const res = await fetch(`/api/time-blocks/${block.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "scheduled", actualMinutes: null }),
        });
        if (!res.ok) throw new Error("Failed to update status");
        toast.success("Time block marked scheduled");
      } else {
        // Complete block
        const res = await fetch(`/api/time-blocks/${block.id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actualMinutes: block.durationMinutes, logHabitEntry: true }),
        });
        if (!res.ok) throw new Error("Failed to complete block");
        toast.success("Time block completed (CAL-03 task analytics updated)");
      }
      fetchCalendarData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update block");
      fetchCalendarData(); // Rollback
    }
  };

  // Modal saved callback
  const handleBlockSaved = (savedBlock: TimeBlockDTO) => {
    fetchCalendarData();
  };

  // Modal deleted callback
  const handleBlockDeleted = (deletedId: string) => {
    fetchCalendarData();
  };

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-7xl mx-auto pb-12" data-testid="calendar-page">
        {/* Top Header & Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Calendar &amp; Time Blocking</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Plan focus blocks, prevent hard commitment overlaps, and track actual time spent.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Unscheduled Tasks Backlog Drawer Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDrawerOpen(true)}
              className="gap-1.5"
              data-testid="toggle-unscheduled-drawer-btn"
            >
              <ListTodo className="h-4 w-4 text-primary" />
              <span>Backlog ({tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length})</span>
            </Button>

            {/* Schedule New Time Block */}
            <Button
              size="sm"
              onClick={() => {
                const now = new Date(currentDate);
                const yyyy = now.getFullYear();
                const mm = String(now.getMonth() + 1).padStart(2, "0");
                const dd = String(now.getDate()).padStart(2, "0");
                const dateStr = `${yyyy}-${mm}-${dd}`;
                setActiveBlock({
                  startTime: `${dateStr}T09:00:00.000Z`,
                  endTime: `${dateStr}T10:00:00.000Z`,
                  commitmentLevel: "soft",
                });
                setModalOpen(true);
              }}
              className="gap-1.5"
              data-testid="schedule-new-block-btn"
            >
              <Plus className="h-4 w-4" />
              <span>New Block</span>
            </Button>
          </div>
        </div>

        {/* Date Navigation & View Mode Switcher */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl border bg-card shadow-sm">
          {/* Navigation Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrev}
              aria-label="Previous timeframe"
              data-testid="calendar-prev-btn"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToday}
              data-testid="calendar-today-btn"
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNext}
              aria-label="Next timeframe"
              data-testid="calendar-next-btn"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <span className="text-base sm:text-lg font-bold ml-2" data-testid="calendar-header-title">
              {headerTitle}
            </span>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 border rounded-lg p-1 bg-muted/30">
            <button
              type="button"
              onClick={() => setViewMode("day")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === "day"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="calendar-view-day-btn"
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setViewMode("week")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === "week"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="calendar-view-week-btn"
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === "month"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="calendar-view-month-btn"
            >
              Month
            </button>
          </div>
        </div>

        {/* Summary Metric Chips */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-3 p-3 rounded-xl border bg-card shadow-sm" data-testid="metric-scheduled-time">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Scheduled Time</p>
              <p className="text-lg font-bold">{formatMinutes(feed.totalScheduledMinutes)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl border bg-card shadow-sm" data-testid="metric-completed-time">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Completed Time</p>
              <p className="text-lg font-bold">{formatMinutes(feed.totalCompletedMinutes)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl border bg-card shadow-sm" data-testid="metric-conflicts">
            <div
              className={`p-2 rounded-lg ${
                feed.conflictCount > 0
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Scheduling Conflicts</p>
              <p className="text-lg font-bold">
                {feed.conflictCount}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {feed.conflictCount === 1 ? "block" : "blocks"}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Main Calendar View Area */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-xl border bg-card text-muted-foreground space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Loading calendar feed...</p>
          </div>
        ) : viewMode === "day" ? (
          <CalendarDayView
            date={currentDate}
            timeBlocks={feed.timeBlocks}
            deadlines={feed.deadlines}
            onSelectBlock={handleSelectBlock}
            onCompleteBlock={handleCompleteToggle}
            onCreateSlot={handleCreateSlot}
          />
        ) : viewMode === "week" ? (
          <CalendarWeekView
            startDate={
              (dateRange as any).monday ||
              new Date(
                currentDate.getFullYear(),
                currentDate.getMonth(),
                currentDate.getDate() - ((currentDate.getDay() + 6) % 7)
              )
            }
            timeBlocks={feed.timeBlocks}
            deadlines={feed.deadlines}
            onSelectBlock={handleSelectBlock}
            onCompleteBlock={handleCompleteToggle}
            onCreateSlot={handleCreateSlot}
          />
        ) : (
          <CalendarMonthView
            currentMonth={currentDate}
            timeBlocks={feed.timeBlocks}
            deadlines={feed.deadlines}
            onSelectDay={(dayDate) => {
              setCurrentDate(dayDate);
              setViewMode("day");
            }}
            onSelectBlock={handleSelectBlock}
            onCreateSlot={handleCreateSlot}
          />
        )}

        {/* Modal: Schedule / Edit Time Block */}
        <TimeBlockModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setActiveBlock(null);
          }}
          onSaved={handleBlockSaved}
          onDeleted={handleBlockDeleted}
          initialBlock={activeBlock}
          tasks={tasks}
          habits={habits}
          projects={projects}
          goals={goals}
        />

        {/* Drawer: Unscheduled Tasks Backlog (CAL-02 click-to-block) */}
        <UnscheduledTasksDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          tasks={tasks}
          onScheduleTask={handleScheduleTask}
        />
      </div>
    </AppShell>
  );
}
