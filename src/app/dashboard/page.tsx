"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  PriorityBadge,
  CommitmentBadge,
  HorizonBadge,
  AreaBadge,
  EnergyBadge,
} from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { QuickCaptureModal } from "@/components/quick-capture-modal";
import type {
  ProjectDTO,
  TaskDTO,
  HabitDTO,
  TimeBlockDTO,
  DailyPlanContextDTO,
  GoalDTO,
  DashboardOverviewDTO,
  Priority,
  ProjectStatus,
  TaskStatus,
  GoalHorizon,
  LifeArea,
} from "@/types";
import {
  FolderKanban,
  CheckSquare,
  Clock,
  AlertTriangle,
  Plus,
  CheckCircle2,
  Circle,
  ArrowRight,
  Loader2,
  Flame,
  Calendar as CalendarIcon,
  Sun,
  Moon,
  CalendarCheck,
  Target,
  Sparkles,
  TrendingUp,
  RefreshCw,
  Award,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();

  const [overview, setOverview] = React.useState<DashboardOverviewDTO | null>(null);
  const [projects, setProjects] = React.useState<ProjectDTO[]>([]);
  const [goals, setGoals] = React.useState<GoalDTO[]>([]);
  const [tasks, setTasks] = React.useState<TaskDTO[]>([]);
  const [habits, setHabits] = React.useState<HabitDTO[]>([]);
  const [todayBlocks, setTodayBlocks] = React.useState<TimeBlockDTO[]>([]);
  const [dailyPlanContext, setDailyPlanContext] = React.useState<DailyPlanContextDTO | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Goal horizon filter in dashboard
  const [goalHorizonFilter, setGoalHorizonFilter] = React.useState<string>("all");

  // Quick modals state
  const [isTaskModalOpen, setIsTaskModalOpen] = React.useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = React.useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = React.useState(false);
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  // New task form state
  const [taskTitle, setTaskTitle] = React.useState("");
  const [taskDescription, setTaskDescription] = React.useState("");
  const [taskProjectId, setTaskProjectId] = React.useState("");
  const [taskPriority, setTaskPriority] = React.useState<Priority>("medium");

  // New project form state
  const [projectName, setProjectName] = React.useState("");
  const [projectDescription, setProjectDescription] = React.useState("");
  const [projectPriority, setProjectPriority] = React.useState<Priority>("medium");
  const [projectStatus, setProjectStatus] = React.useState<ProjectStatus>("active");

  // New goal form state
  const [goalTitle, setGoalTitle] = React.useState("");
  const [goalDescription, setGoalDescription] = React.useState("");
  const [goalHorizon, setGoalHorizon] = React.useState<GoalHorizon>("medium_term");
  const [goalArea, setGoalArea] = React.useState<LifeArea>("general");
  const [goalPriority, setGoalPriority] = React.useState<Priority>("medium");

  const isSubmittingTaskRef = React.useRef(false);
  const isSubmittingProjectRef = React.useRef(false);
  const isSubmittingGoalRef = React.useRef(false);
  const togglingTasksRef = React.useRef<Set<string>>(new Set());
  const togglingHabitsRef = React.useRef<Set<string>>(new Set());
  const togglingBlocksRef = React.useRef<Set<string>>(new Set());

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const todayStr = new Date().toISOString().slice(0, 10);

      // 1. Try unified dashboard aggregation endpoint
      const dashRes = await fetch(`/api/dashboard?date=${todayStr}`).catch(() => null);
      if (dashRes && dashRes.ok) {
        const dashData = await dashRes.json();
        if (dashData.overview) {
          const ov: DashboardOverviewDTO = dashData.overview;
          setOverview(ov);
          setProjects(ov.goalsAndProjects?.activeProjects || []);
          setGoals(ov.goalsAndProjects?.activeGoals || []);
          setHabits(ov.habits?.items || []);
          setTodayBlocks(ov.schedule?.todayBlocks || []);

          // Tasks: combine priority, overdue, and critical for individual lookups
          const allDashboardTasks = [
            ...(ov.priorities?.todayTasks || []),
            ...(ov.priorities?.overdueTasks || []),
            ...(ov.priorities?.criticalTasks || []),
          ];
          setTasks(allDashboardTasks);

          setDailyPlanContext({
            date: ov.date,
            plan: ov.dailyPlan?.hasPlan
              ? {
                  id: "plan-active",
                  userId: "",
                  date: ov.date,
                  status:
                    ov.dailyPlan.planStatus === "completed"
                      ? "completed"
                      : "in_progress",
                  priorityTaskIds: (ov.priorities?.todayTasks || []).map((t) => t.id),
                  habitIntentionIds: [],
                  morningNotes: ov.dailyPlan.morningNotes,
                  completedAt: ov.dailyPlan.completedAt,
                  createdAt: "",
                  updatedAt: "",
                }
              : null,
            review: ov.dailyPlan?.hasReview
              ? {
                  id: "review-active",
                  userId: "",
                  dailyPlanId: null,
                  date: ov.date,
                  productivityScore: ov.dailyPlan.productivityScore ?? 0,
                  positiveReflections: null,
                  challengesReflections: null,
                  notes: null,
                  completedTaskIds: [],
                  incompleteTaskIds: [],
                  rolledOverTaskIds: [],
                  completedHabitIds: [],
                  completedAt: "",
                  createdAt: "",
                  updatedAt: "",
                }
              : null,
            priorityTasks: ov.priorities?.todayTasks || [],
            overdueTasks: ov.priorities?.overdueTasks || [],
            todayHabits: ov.habits?.items || [],
            todayTimeBlocks: ov.schedule?.todayBlocks || [],
            suggestedTasks: [],
          });
          setLoading(false);
          return;
        }
      }

      // 2. Fallback to individual endpoints for backwards compatibility with tests
      const [projRes, taskRes, habitRes, blocksRes, dailyPlanRes, goalsRes] =
        await Promise.all([
          fetch("/api/projects"),
          fetch("/api/tasks"),
          fetch("/api/habits?status=active"),
          fetch(`/api/time-blocks?startDate=${todayStr}&endDate=${todayStr}`).catch(
            () => ({
              ok: false,
              status: 500,
              json: async () => ({ timeBlocks: [] }),
            } as any)
          ),
          fetch(`/api/daily-plan?date=${todayStr}`).catch(() => ({
            ok: false,
            status: 500,
            json: async () => ({ context: null }),
          } as any)),
          fetch("/api/goals?status=in_progress").catch(() => ({
            ok: false,
            status: 500,
            json: async () => ({ goals: [] }),
          } as any)),
        ]);

      if (
        projRes.status === 401 ||
        taskRes.status === 401 ||
        habitRes.status === 401
      ) {
        router.replace("/login");
        return;
      }

      let fetchedProjects: ProjectDTO[] = [];
      let fetchedTasks: TaskDTO[] = [];
      let fetchedHabits: HabitDTO[] = [];
      let fetchedBlocks: TimeBlockDTO[] = [];
      let fetchedContext: DailyPlanContextDTO | null = null;
      let fetchedGoals: GoalDTO[] = [];

      if (projRes.ok) {
        const projData = await projRes.json();
        fetchedProjects = projData.projects || [];
        setProjects(fetchedProjects);
      }

      if (taskRes.ok) {
        const taskData = await taskRes.json();
        fetchedTasks = taskData.tasks || [];
        setTasks(fetchedTasks);
      }

      if (habitRes.ok) {
        const habitData = await habitRes.json();
        fetchedHabits = habitData.habits || [];
        setHabits(fetchedHabits);
      }

      if (blocksRes.ok) {
        const blocksData = await blocksRes.json();
        fetchedBlocks = blocksData.timeBlocks || [];
        setTodayBlocks(fetchedBlocks);
      }

      if (dailyPlanRes.ok) {
        const dailyPlanData = await dailyPlanRes.json();
        fetchedContext = dailyPlanData.context || null;
        setDailyPlanContext(fetchedContext);
      }

      if (goalsRes.ok) {
        const goalsData = await goalsRes.json();
        fetchedGoals = goalsData.goals || [];
        setGoals(fetchedGoals);
      }

      // Synthesize overview from fallback data
      const activeProj = fetchedProjects.filter((p) => p.status === "active");
      const pendingT = fetchedTasks.filter(
        (t) => t.status !== "completed" && t.status !== "cancelled"
      );
      const completedT = fetchedTasks.filter((t) => t.status === "completed");
      const criticalT = pendingT.filter(
        (t) => t.priority === "critical" || t.priority === "high"
      );
      const overdueT = fetchedContext?.overdueTasks || [];
      const completedH = fetchedHabits.filter((h) => !!h.isCompletedToday);

      const totalSchedMin = fetchedBlocks.reduce(
        (acc, b) => acc + (b.durationMinutes || 0),
        0
      );
      const compMin = fetchedBlocks
        .filter((b) => b.status === "completed")
        .reduce(
          (acc, b) => acc + (b.actualMinutes ?? b.durationMinutes ?? 0),
          0
        );

      setOverview({
        date: todayStr,
        greeting: {
          userName: session?.user?.name || "LifeOS Owner",
          todayFormatted: new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
        },
        metrics: {
          activeGoalsCount: fetchedGoals.length,
          activeProjectsCount: activeProj.length,
          pendingTasksCount: pendingT.length,
          completedTasksCount: completedT.length,
          overdueTasksCount: overdueT.length,
          criticalTasksCount: criticalT.length,
          todayHabitsTotal: fetchedHabits.length,
          todayHabitsCompleted: completedH.length,
          todayTimeBlocksCount: fetchedBlocks.length,
          todayProductivityScore:
            fetchedContext?.review?.productivityScore ?? null,
        },
        dailyPlan: {
          hasPlan: !!fetchedContext?.plan,
          planStatus: fetchedContext?.plan ? fetchedContext.plan.status : "none",
          completedAt: fetchedContext?.plan?.completedAt ?? null,
          morningNotes: fetchedContext?.plan?.morningNotes ?? null,
          hasReview: !!fetchedContext?.review,
          reviewCompleted: !!fetchedContext?.review,
          productivityScore:
            fetchedContext?.review?.productivityScore ?? null,
          rolledOverCount:
            fetchedContext?.review?.rolledOverTaskIds?.length ?? 0,
        },
        priorities: {
          todayTasks: fetchedContext?.priorityTasks || fetchedTasks.slice(0, 5),
          overdueTasks: overdueT,
          criticalTasks: criticalT.slice(0, 5),
        },
        schedule: {
          todayBlocks: fetchedBlocks,
          totalScheduledMinutes: totalSchedMin,
          completedMinutes: compMin,
        },
        habits: {
          items: fetchedHabits,
          completionRateToday:
            fetchedHabits.length > 0
              ? Math.round((completedH.length / fetchedHabits.length) * 100)
              : 0,
        },
        goalsAndProjects: {
          activeGoals: fetchedGoals,
          activeProjects: activeProj,
        },
      });
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      setError("Failed to load dashboard data. Please try again.");
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [router, session]);

  React.useEffect(() => {
    if (!sessionLoading) {
      if (!session?.user) {
        router.replace("/login");
      } else {
        fetchData();
      }
    }
  }, [session, sessionLoading, router, fetchData]);

  // Habit toggle check-in
  const toggleHabitCompletion = async (habit: HabitDTO) => {
    if (togglingHabitsRef.current.has(habit.id)) return;
    togglingHabitsRef.current.add(habit.id);

    const prevCompleted = !!habit.isCompletedToday;
    const nextCompleted = !prevCompleted;
    const nextStreak = nextCompleted
      ? (habit.currentStreak || 0) + 1
      : Math.max(0, (habit.currentStreak || 0) - 1);

    // Optimistic update
    setHabits((prev) =>
      prev.map((h) =>
        h.id === habit.id
          ? { ...h, isCompletedToday: nextCompleted, currentStreak: nextStreak }
          : h
      )
    );

    try {
      const res = await fetch(`/api/habits/${habit.id}/toggle`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to toggle habit");
      }

      const result = await res.json();
      setHabits((prev) =>
        prev.map((h) =>
          h.id === habit.id
            ? {
                ...h,
                currentStreak: result.stats?.currentStreak ?? nextStreak,
                longestStreak: result.stats?.longestStreak ?? h.longestStreak,
                isCompletedToday:
                  result.stats?.isCompletedToday ?? nextCompleted,
              }
            : h
        )
      );
      toast.success(
        nextCompleted
          ? `Checked in: ${habit.title}!`
          : `Unchecked: ${habit.title}`
      );
    } catch (err: any) {
      setHabits((prev) =>
        prev.map((h) =>
          h.id === habit.id
            ? {
                ...h,
                isCompletedToday: prevCompleted,
                currentStreak: habit.currentStreak,
              }
            : h
        )
      );
      toast.error(err.message || "Could not update habit");
    } finally {
      togglingHabitsRef.current.delete(habit.id);
    }
  };

  // Task completion toggle
  const toggleTaskCompletion = async (task: TaskDTO) => {
    if (togglingTasksRef.current.has(task.id)) return;
    togglingTasksRef.current.add(task.id);

    const isNowCompleted = task.status !== "completed";
    const nextStatus: TaskStatus = isNowCompleted ? "completed" : "todo";

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update task");
      }

      const updatedData = await res.json();
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? updatedData.task : t))
      );
      toast.success(
        isNowCompleted ? "Task marked complete!" : "Task reopened!"
      );
    } catch (err: any) {
      toast.error(err.message || "Could not update task");
    } finally {
      togglingTasksRef.current.delete(task.id);
    }
  };

  // Time block completion toggle
  const toggleTimeBlockCompletion = async (block: TimeBlockDTO) => {
    if (togglingBlocksRef.current.has(block.id)) return;
    togglingBlocksRef.current.add(block.id);

    const isNowCompleted = block.status !== "completed";
    const nextStatus = isNowCompleted ? "completed" : "scheduled";

    // Optimistic update
    setTodayBlocks((prev) =>
      prev.map((b) =>
        b.id === block.id
          ? {
              ...b,
              status: nextStatus,
              actualMinutes: isNowCompleted
                ? (b.actualMinutes ?? b.durationMinutes)
                : null,
              completedAt: isNowCompleted ? new Date().toISOString() : null,
            }
          : b
      )
    );

    try {
      if (isNowCompleted) {
        const res = await fetch(`/api/time-blocks/${block.id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actualMinutes: block.actualMinutes ?? block.durationMinutes,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to complete time block");
        }
        const data = await res.json();
        setTodayBlocks((prev) =>
          prev.map((b) => (b.id === block.id ? data.timeBlock : b))
        );
        toast.success("Time block marked complete!");
      } else {
        const res = await fetch(`/api/time-blocks/${block.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "scheduled",
            actualMinutes: null,
            completedAt: null,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to reopen time block");
        }
        const data = await res.json();
        setTodayBlocks((prev) =>
          prev.map((b) => (b.id === block.id ? data.timeBlock : b))
        );
        toast.success("Time block reopened!");
      }
    } catch (err: any) {
      toast.error(err.message || "Could not update time block");
      setTodayBlocks((prev) =>
        prev.map((b) => (b.id === block.id ? block : b))
      );
    } finally {
      togglingBlocksRef.current.delete(block.id);
    }
  };

  // Create Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingTaskRef.current || !taskTitle.trim()) return;

    isSubmittingTaskRef.current = true;
    setActionLoading(true);
    try {
      const payload: Record<string, unknown> = {
        title: taskTitle.trim(),
        priority: taskPriority,
        status: "todo",
      };
      if (taskDescription.trim()) {
        payload.description = taskDescription.trim();
      }
      if (taskProjectId.trim()) {
        payload.projectId = taskProjectId.trim();
      }

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create task");
      }

      const data = await res.json();
      setTasks((prev) => [data.task, ...prev]);
      toast.success("Task created successfully!");
      setIsTaskModalOpen(false);
      setTaskTitle("");
      setTaskDescription("");
      setTaskProjectId("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create task");
    } finally {
      isSubmittingTaskRef.current = false;
      setActionLoading(false);
    }
  };

  // Create Project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingProjectRef.current || !projectName.trim()) return;

    isSubmittingProjectRef.current = true;
    setActionLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: projectName.trim(),
        status: projectStatus,
        priority: projectPriority,
      };
      if (projectDescription.trim()) {
        payload.description = projectDescription.trim();
      }

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create project");
      }

      const data = await res.json();
      setProjects((prev) => [data.project, ...prev]);
      toast.success("Project created successfully!");
      setIsProjectModalOpen(false);
      setProjectName("");
      setProjectDescription("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create project");
    } finally {
      isSubmittingProjectRef.current = false;
      setActionLoading(false);
    }
  };

  // Create Goal
  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingGoalRef.current || !goalTitle.trim()) return;

    isSubmittingGoalRef.current = true;
    setActionLoading(true);
    try {
      const payload: Record<string, unknown> = {
        title: goalTitle.trim(),
        horizon: goalHorizon,
        area: goalArea,
        priority: goalPriority,
        status: "in_progress",
      };
      if (goalDescription.trim()) {
        payload.description = goalDescription.trim();
      }

      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create goal");
      }

      const data = await res.json();
      setGoals((prev) => [data.goal, ...prev]);
      toast.success("Goal created successfully!");
      setIsGoalModalOpen(false);
      setGoalTitle("");
      setGoalDescription("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create goal");
    } finally {
      isSubmittingGoalRef.current = false;
      setActionLoading(false);
    }
  };

  if (sessionLoading || (!session?.user && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Metrics extraction
  const activeProjectsCount =
    overview?.metrics?.activeProjectsCount ??
    projects.filter((p) => p.status === "active").length;
  const pendingTasksCount =
    overview?.metrics?.pendingTasksCount ??
    tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled")
      .length;
  const completedTasksCount =
    overview?.metrics?.completedTasksCount ??
    tasks.filter((t) => t.status === "completed").length;
  const criticalTasksCount =
    overview?.metrics?.criticalTasksCount ??
    tasks.filter(
      (t) =>
        (t.priority === "critical" || t.priority === "high") &&
        t.status !== "completed" &&
        t.status !== "cancelled"
    ).length;
  const activeGoalsCount =
    overview?.metrics?.activeGoalsCount ?? goals.length;
  const productivityScore =
    overview?.metrics?.todayProductivityScore ??
    dailyPlanContext?.review?.productivityScore ??
    null;

  // Multi-horizon goals filtering
  const filteredGoals = goals.filter((g) => {
    if (goalHorizonFilter === "all") return true;
    return g.horizon === goalHorizonFilter;
  });

  const activeProjectsList = projects
    .filter((p) => p.status === "active")
    .slice(0, 4);

  // Priority tasks: use today's prioritized tasks from overview or context
  const priorityTasksList =
    overview?.priorities?.todayTasks && overview.priorities.todayTasks.length > 0
      ? overview.priorities.todayTasks
      : dailyPlanContext?.priorityTasks &&
        dailyPlanContext.priorityTasks.length > 0
      ? dailyPlanContext.priorityTasks
      : tasks.slice(0, 6);

  const overdueTasksList =
    overview?.priorities?.overdueTasks ||
    dailyPlanContext?.overdueTasks ||
    [];

  return (
    <AppShell>
      <div className="space-y-8" data-testid="dashboard-view">
        {/* Error State Banner */}
        {error && (
          <div
            className="flex items-center justify-between p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
            role="alert"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData()}
              className="gap-1.5 h-8 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </Button>
          </div>
        )}

        {/* Dashboard Header & Executive Greeting */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Executive Control Center
              </h1>
              {productivityScore !== null && (
                <div className="hidden sm:flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                  <Award className="h-3.5 w-3.5" />
                  <span>{productivityScore}% Score</span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome back, {session?.user?.name || "LifeOS Owner"}. Today is{" "}
              <span className="font-medium text-foreground">
                {overview?.greeting?.todayFormatted ||
                  new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
              </span>
              .
            </p>
          </div>

          {/* Executive Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsQuickCaptureOpen(true)}
              className="gap-1.5 bg-primary/5 hover:bg-primary/10 border-primary/20"
              data-testid="quick-capture-btn"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Quick Capture</span>
              <kbd className="hidden md:inline-block font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded ml-1 text-muted-foreground">
                Q
              </kbd>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsGoalModalOpen(true)}
              className="gap-1.5"
              data-testid="quick-add-goal-btn"
            >
              <Plus className="h-4 w-4" />
              <span>New Goal</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsProjectModalOpen(true)}
              className="gap-1.5"
              data-testid="quick-add-project-btn"
            >
              <Plus className="h-4 w-4" />
              <span>New Project</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsTaskModalOpen(true)}
              className="gap-1.5"
              data-testid="quick-add-task-btn"
            >
              <Plus className="h-4 w-4" />
              <span>New Task</span>
            </Button>
          </div>
        </div>

        {/* Executive KPI Metrics Grid */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {/* Active Goals */}
          <Card className="hover:border-primary/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active Goals
              </CardTitle>
              <Target className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-bold"
                data-testid="metric-active-goals"
              >
                {activeGoalsCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Multi-horizon
              </p>
            </CardContent>
          </Card>

          {/* Active Projects */}
          <Card className="hover:border-primary/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active Projects
              </CardTitle>
              <FolderKanban className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-bold"
                data-testid="metric-active-projects"
              >
                {activeProjectsCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {projects.length} total
              </p>
            </CardContent>
          </Card>

          {/* Pending Tasks */}
          <Card className="hover:border-primary/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pending Tasks
              </CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-bold"
                data-testid="metric-pending-tasks"
              >
                {pendingTasksCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                In backlog / todo
              </p>
            </CardContent>
          </Card>

          {/* Completed Tasks */}
          <Card className="hover:border-primary/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Completed Tasks
              </CardTitle>
              <CheckSquare className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-bold"
                data-testid="metric-completed-tasks"
              >
                {completedTasksCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Finished work
              </p>
            </CardContent>
          </Card>

          {/* Critical & Overdue */}
          <Card className="hover:border-primary/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                High Priority
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-bold"
                data-testid="metric-critical-tasks"
              >
                {criticalTasksCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Immediate focus
              </p>
            </CardContent>
          </Card>

          {/* Habits / Productivity */}
          <Card className="hover:border-primary/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Daily Score
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div
                className="text-2xl font-bold"
                data-testid="metric-productivity-score"
              >
                {productivityScore !== null ? `${productivityScore}%` : "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {overview?.metrics
                  ? `${overview.metrics.todayHabitsCompleted}/${overview.metrics.todayHabitsTotal} habits`
                  : "Evening review"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Daily Rituals & Execution Card (PLAN-01 / PLAN-02 / PLAN-03 / DASH-02) */}
        <Card
          className="border-indigo-500/20 bg-gradient-to-r from-indigo-50/50 via-background to-amber-50/50 dark:from-indigo-950/20 dark:via-background dark:to-amber-950/20"
          data-testid="dashboard-daily-routine-card"
        >
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <CalendarCheck className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">
                    Daily Rituals & Execution
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Align your day with morning intention, focus commitments, and evening reflection
                  </CardDescription>
                </div>
              </div>
              <Link href="/daily-plan">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  data-testid="dashboard-open-daily-plan-btn"
                >
                  <span>Open Daily Plan</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {/* Morning Plan status */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card/60">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-full ${
                      dailyPlanContext?.plan?.completedAt
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Sun className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Morning Routine
                    </div>
                    <div className="text-sm font-semibold">
                      {dailyPlanContext?.plan?.completedAt ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 inline" /> Completed
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Ready to start
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Link href="/daily-plan?mode=morning">
                  <Button
                    size="sm"
                    variant={
                      dailyPlanContext?.plan?.completedAt
                        ? "ghost"
                        : "default"
                    }
                    className="text-xs h-8"
                    data-testid="dashboard-start-morning-btn"
                  >
                    {dailyPlanContext?.plan?.completedAt
                      ? "Review"
                      : "Start Routine"}
                  </Button>
                </Link>
              </div>

              {/* Evening Review status */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card/60">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-full ${
                      dailyPlanContext?.review
                        ? "bg-indigo-500/10 text-indigo-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Moon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Evening Review
                    </div>
                    <div className="text-sm font-semibold">
                      {dailyPlanContext?.review ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 inline" /> Score:{" "}
                          {dailyPlanContext.review.productivityScore}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Pending</span>
                      )}
                    </div>
                  </div>
                </div>
                <Link href="/daily-plan?mode=evening">
                  <Button
                    size="sm"
                    variant={dailyPlanContext?.review ? "ghost" : "default"}
                    className="text-xs h-8"
                    data-testid="dashboard-start-evening-btn"
                  >
                    {dailyPlanContext?.review
                      ? "View Score"
                      : "Begin Review"}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Overdue alert banner if unfinished work exists */}
            {overdueTasksList.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>{overdueTasksList.length} overdue task{overdueTasksList.length > 1 ? "s" : ""}</strong> require triage or rollover to today.
                  </span>
                </div>
                <Link href="/daily-plan?mode=morning">
                  <span className="underline hover:no-underline font-medium text-amber-800 dark:text-amber-200">
                    Triage in Morning Plan →
                  </span>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Operational Workspace: 2-Column Responsive Layout */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ========================================================================= */}
          {/* COLUMN 1: EXECUTION (Priorities & Schedule)                              */}
          {/* ========================================================================= */}
          <div className="space-y-6">
            {/* Today's Priorities & Highest-Value Tasks (DASH-01, DASH-02, TASK-01) */}
            <Card
              className="flex flex-col"
              data-testid="dashboard-priorities-card"
            >
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-1.5">
                    <CheckSquare className="h-4 w-4 text-emerald-500" />
                    <span>Today&apos;s Priorities</span>
                  </CardTitle>
                  <CardDescription>
                    Highest-value tasks ranked by priority score
                  </CardDescription>
                </div>
                <Link href="/tasks">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs"
                    data-testid="view-all-tasks-btn"
                  >
                    View all <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {priorityTasksList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <CheckSquare className="h-8 w-8 mb-2 opacity-40 text-emerald-500" />
                    <p className="text-sm font-medium">No priority tasks selected</p>
                    <p className="text-xs mt-1">
                      Start your morning routine to pick 3–5 focus tasks.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y rounded-md border">
                    {priorityTasksList.slice(0, 6).map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            onClick={() => toggleTaskCompletion(t)}
                            className="text-muted-foreground hover:text-primary transition-colors shrink-0 focus:outline-none"
                            title={
                              t.status === "completed"
                                ? "Mark incomplete"
                                : "Mark complete"
                            }
                            aria-label={
                              t.status === "completed"
                                ? `Mark ${t.title} incomplete`
                                : `Mark ${t.title} complete`
                            }
                          >
                            {t.status === "completed" ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-500 fill-emerald-500/20" />
                            ) : (
                              <Circle className="h-5 w-5" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <span
                              className={`text-sm truncate font-medium block ${
                                t.status === "completed"
                                  ? "line-through text-muted-foreground"
                                  : ""
                              }`}
                            >
                              {t.title}
                            </span>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                              {t.dueDate && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {new Date(t.dueDate).toLocaleDateString([], {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              )}
                              {t.priorityScore > 0 && (
                                <span className="px-1.5 py-0.2 rounded bg-muted text-[10px] font-mono">
                                  Score: {t.priorityScore}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <PriorityBadge priority={t.priority} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Today's Schedule (CAL-01 / CAL-03 / DASH-05) */}
            <Card className="flex flex-col" data-testid="dashboard-schedule-card">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-1.5">
                    <CalendarIcon className="h-4 w-4 text-indigo-500" />
                    <span>Today&apos;s Schedule</span>
                  </CardTitle>
                  <CardDescription>
                    Scheduled focus periods & calendar blocks
                  </CardDescription>
                </div>
                <Link href="/calendar">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs"
                    data-testid="view-all-calendar-btn"
                  >
                    View calendar <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {todayBlocks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <CalendarIcon className="h-8 w-8 mb-2 opacity-40 text-indigo-500" />
                    <p className="text-sm font-medium">
                      No time blocks scheduled for today
                    </p>
                    <p className="text-xs mt-1">
                      Plan your day to protect deep focus.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y rounded-md border">
                    {todayBlocks.slice(0, 6).map((block) => (
                      <div
                        key={block.id}
                        className="flex items-center justify-between p-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            onClick={() => toggleTimeBlockCompletion(block)}
                            className={`shrink-0 transition-transform active:scale-95 focus:outline-none ${
                              block.status === "completed"
                                ? "text-emerald-500 hover:text-emerald-600"
                                : "text-muted-foreground hover:text-primary"
                            }`}
                            title={
                              block.status === "completed"
                                ? "Mark incomplete"
                                : "Mark complete"
                            }
                            aria-label={
                              block.status === "completed"
                                ? `Mark ${block.title} incomplete`
                                : `Mark ${block.title} complete`
                            }
                            data-testid={`dashboard-block-toggle-${block.id}`}
                          >
                            {block.status === "completed" ? (
                              <CheckCircle2 className="h-5 w-5 fill-emerald-500/20" />
                            ) : (
                              <Circle className="h-5 w-5" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <span
                              className={`text-sm truncate font-medium block ${
                                block.status === "completed"
                                  ? "line-through text-muted-foreground"
                                  : ""
                              }`}
                            >
                              {block.title}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(block.startTime).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" }
                              )}{" "}
                              -{" "}
                              {new Date(block.endTime).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {block.durationMinutes && (
                                <span className="ml-1.5 opacity-80">
                                  ({block.durationMinutes}m)
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <CommitmentBadge
                            commitment={block.commitmentLevel}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ========================================================================= */}
          {/* COLUMN 2: STRATEGY & HABITS (Goals, Projects, Habits)                    */}
          {/* ========================================================================= */}
          <div className="space-y-6">
            {/* Multi-Horizon Goals Hierarchy (DASH-03 / GOAL-01 / GOAL-02) */}
            <Card className="flex flex-col" data-testid="dashboard-goals-card">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-1.5">
                    <Target className="h-4 w-4 text-purple-500" />
                    <span>Active Goals</span>
                  </CardTitle>
                  <CardDescription>
                    Multi-horizon objectives & automated rollups
                  </CardDescription>
                </div>
                <Link href="/goals">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs"
                    data-testid="view-all-goals-btn"
                  >
                    View all <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {/* Horizon Filter Tabs */}
                <div className="flex items-center gap-1 pb-1 border-b text-xs">
                  {[
                    { id: "all", label: "All" },
                    { id: "long_term", label: "Long-Term" },
                    { id: "medium_term", label: "Medium-Term" },
                    { id: "short_term", label: "Short-Term" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setGoalHorizonFilter(tab.id)}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        goalHorizonFilter === tab.id
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {filteredGoals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <Target className="h-8 w-8 mb-2 opacity-40 text-purple-500" />
                    <p className="text-sm font-medium">No active goals found</p>
                    <p className="text-xs mt-1">
                      Define a vision to anchor your daily execution.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y rounded-md border">
                    {filteredGoals.slice(0, 4).map((g) => (
                      <div
                        key={g.id}
                        className="p-3 space-y-2 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-sm font-semibold truncate block">
                              {g.title}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <HorizonBadge horizon={g.horizon} />
                              <AreaBadge area={g.area} />
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-sm font-bold text-primary">
                              {g.progress}%
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              {g.linkedProjectsCount ?? 0} projects •{" "}
                              {g.directTasksCount ?? 0} tasks
                            </div>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-primary h-full transition-all duration-300 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, g.progress))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Today's Habits (HABT-02 single-click check-in from Dashboard) */}
            <Card className="flex flex-col" data-testid="dashboard-habits-card">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-1.5">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <span>Today&apos;s Habits</span>
                  </CardTitle>
                  <CardDescription>Single-click daily check-in</CardDescription>
                </div>
                <Link href="/habits">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs"
                    data-testid="view-all-habits-btn"
                  >
                    View all <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {habits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <Flame className="h-8 w-8 mb-2 opacity-40 text-orange-500" />
                    <p className="text-sm font-medium">No active habits</p>
                    <p className="text-xs mt-1">Start building daily routines.</p>
                  </div>
                ) : (
                  <div className="divide-y rounded-md border">
                    {habits.slice(0, 6).map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between p-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            onClick={() => toggleHabitCompletion(h)}
                            className={`shrink-0 transition-transform active:scale-95 focus:outline-none ${
                              h.isCompletedToday
                                ? "text-emerald-500 hover:text-emerald-600"
                                : "text-muted-foreground hover:text-primary"
                            }`}
                            title={
                              h.isCompletedToday
                                ? "Mark incomplete"
                                : "Mark complete"
                            }
                            aria-label={
                              h.isCompletedToday
                                ? `Mark ${h.title} incomplete`
                                : `Mark ${h.title} complete`
                            }
                            data-testid={`dashboard-habit-toggle-${h.id}`}
                          >
                            {h.isCompletedToday ? (
                              <CheckCircle2 className="h-5 w-5 fill-emerald-500/20" />
                            ) : (
                              <Circle className="h-5 w-5" />
                            )}
                          </button>
                          <span
                            className={`text-sm truncate font-medium ${
                              h.isCompletedToday
                                ? "line-through text-muted-foreground"
                                : ""
                            }`}
                          >
                            {h.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <div className="flex items-center gap-0.5 text-xs text-orange-600 dark:text-orange-400 font-semibold">
                            <Flame className="h-3.5 w-3.5" />
                            <span>{h.currentStreak || 0}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Projects (PROJ-01 / DASH-03) */}
            <Card
              className="flex flex-col"
              data-testid="dashboard-projects-card"
            >
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-1.5">
                    <FolderKanban className="h-4 w-4 text-blue-500" />
                    <span>Active Projects</span>
                  </CardTitle>
                  <CardDescription>
                    Projects currently in progress
                  </CardDescription>
                </div>
                <Link href="/projects">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs"
                    data-testid="view-all-projects-btn"
                  >
                    View all <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {activeProjectsList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <FolderKanban className="h-8 w-8 mb-2 opacity-40 text-blue-500" />
                    <p className="text-sm font-medium">No active projects</p>
                    <p className="text-xs mt-1">
                      Create a project to group tasks and milestones.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y rounded-md border">
                    {activeProjectsList.map((p) => {
                      const projectTasks = tasks.filter(
                        (t) => t.projectId === p.id
                      );
                      const completedCount =
                        p.completedTasksCount ??
                        projectTasks.filter((t) => t.status === "completed")
                          .length;
                      const totalCount =
                        p.tasksCount ?? projectTasks.length;

                      return (
                        <div
                          key={p.id}
                          className="p-3 space-y-2 transition-colors hover:bg-muted/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">
                                {p.name}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                                <PriorityBadge priority={p.priority} />
                                {p.deadline && (
                                  <span>
                                    Due:{" "}
                                    {new Date(p.deadline).toLocaleDateString(
                                      [],
                                      { month: "short", day: "numeric" }
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                {p.progress}%
                              </span>
                              <div className="text-[10px] text-muted-foreground">
                                {completedCount}/{totalCount} tasks
                              </div>
                            </div>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-blue-600 dark:bg-blue-400 h-full transition-all duration-300 rounded-full"
                              style={{
                                width: `${Math.min(100, Math.max(0, p.progress))}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Task Creation Modal */}
        <Modal
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          title="Create New Task"
          description="Add a task to your workspace"
        >
          <form onSubmit={handleCreateTask} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label
                htmlFor="dashboard-task-title"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Task Title *
              </label>
              <Input
                id="dashboard-task-title"
                name="title"
                placeholder="What needs to be done?"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                required
                autoFocus
                disabled={actionLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="dashboard-task-desc"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Description
              </label>
              <Textarea
                id="dashboard-task-desc"
                name="description"
                placeholder="Optional notes or details..."
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                disabled={actionLoading}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="dashboard-task-project"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Project
                </label>
                <Select
                  id="dashboard-task-project"
                  name="projectId"
                  value={taskProjectId}
                  onChange={(e) => setTaskProjectId(e.target.value)}
                  disabled={actionLoading}
                >
                  <option value="">(No Project)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="dashboard-task-priority"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Priority
                </label>
                <Select
                  id="dashboard-task-priority"
                  name="priority"
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as Priority)}
                  disabled={actionLoading}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTaskModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button type="submit" loading={actionLoading}>
                Create Task
              </Button>
            </div>
          </form>
        </Modal>

        {/* Quick Project Creation Modal */}
        <Modal
          isOpen={isProjectModalOpen}
          onClose={() => setIsProjectModalOpen(false)}
          title="Create New Project"
          description="Initialize a project to organize tasks"
        >
          <form onSubmit={handleCreateProject} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label
                htmlFor="dashboard-project-name"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Project Name *
              </label>
              <Input
                id="dashboard-project-name"
                name="name"
                placeholder="Project title..."
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required
                autoFocus
                disabled={actionLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="dashboard-project-desc"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Description
              </label>
              <Textarea
                id="dashboard-project-desc"
                name="description"
                placeholder="Project scope and goals..."
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                disabled={actionLoading}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="dashboard-project-status"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Status
                </label>
                <Select
                  id="dashboard-project-status"
                  name="status"
                  value={projectStatus}
                  onChange={(e) =>
                    setProjectStatus(e.target.value as ProjectStatus)
                  }
                  disabled={actionLoading}
                >
                  <option value="active">Active</option>
                  <option value="planning">Planning</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="dashboard-project-priority"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Priority
                </label>
                <Select
                  id="dashboard-project-priority"
                  name="priority"
                  value={projectPriority}
                  onChange={(e) =>
                    setProjectPriority(e.target.value as Priority)
                  }
                  disabled={actionLoading}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsProjectModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button type="submit" loading={actionLoading}>
                Create Project
              </Button>
            </div>
          </form>
        </Modal>

        {/* Quick Goal Creation Modal */}
        <Modal
          isOpen={isGoalModalOpen}
          onClose={() => setIsGoalModalOpen(false)}
          title="Create New Goal"
          description="Establish an objective across any horizon"
        >
          <form onSubmit={handleCreateGoal} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label
                htmlFor="dashboard-goal-title"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Goal Title *
              </label>
              <Input
                id="dashboard-goal-title"
                name="title"
                placeholder="What objective are you striving toward?"
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                required
                autoFocus
                disabled={actionLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="dashboard-goal-desc"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Description
              </label>
              <Textarea
                id="dashboard-goal-desc"
                name="description"
                placeholder="Why is this goal important? What is the outcome?"
                value={goalDescription}
                onChange={(e) => setGoalDescription(e.target.value)}
                disabled={actionLoading}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="dashboard-goal-horizon"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Horizon
                </label>
                <Select
                  id="dashboard-goal-horizon"
                  name="horizon"
                  value={goalHorizon}
                  onChange={(e) => setGoalHorizon(e.target.value as GoalHorizon)}
                  disabled={actionLoading}
                >
                  <option value="long_term">Long-Term</option>
                  <option value="medium_term">Medium-Term</option>
                  <option value="short_term">Short-Term</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="dashboard-goal-area"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Life Area
                </label>
                <Select
                  id="dashboard-goal-area"
                  name="area"
                  value={goalArea}
                  onChange={(e) => setGoalArea(e.target.value as LifeArea)}
                  disabled={actionLoading}
                >
                  <option value="general">General</option>
                  <option value="career">Career</option>
                  <option value="health">Health</option>
                  <option value="finance">Finance</option>
                  <option value="personal_development">Personal Dev</option>
                  <option value="relationships">Relationships</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="dashboard-goal-priority"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Priority
                </label>
                <Select
                  id="dashboard-goal-priority"
                  name="priority"
                  value={goalPriority}
                  onChange={(e) => setGoalPriority(e.target.value as Priority)}
                  disabled={actionLoading}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsGoalModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button type="submit" loading={actionLoading}>
                Create Goal
              </Button>
            </div>
          </form>
        </Modal>

        {/* Universal Quick Capture Modal */}
        <QuickCaptureModal
          isOpen={isQuickCaptureOpen}
          onClose={() => setIsQuickCaptureOpen(false)}
          onTaskCreated={(newTask) => {
            setTasks((prev) => [newTask, ...prev]);
            toast.success("Task captured via quick capture!");
          }}
        />
      </div>
    </AppShell>
  );
}
