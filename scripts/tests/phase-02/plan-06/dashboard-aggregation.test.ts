import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDashboardOverview } from "@/server/dashboard/service";
import { AuthorizationError } from "@/server/auth/guard";
import * as dailyPlanService from "@/server/daily-plan/service";
import * as goalsService from "@/server/goals/service";
import * as projectsService from "@/server/projects/service";
import * as tasksService from "@/server/tasks/service";
import { db } from "@/server/db";
import type {
  GoalDTO,
  ProjectDTO,
  TaskDTO,
  HabitDTO,
  TimeBlockDTO,
  DailyPlanContextDTO,
  DailyPlanHistoryDTO,
} from "@/types";

vi.mock("@/server/daily-plan/service");
vi.mock("@/server/goals/service");
vi.mock("@/server/projects/service");
vi.mock("@/server/tasks/service");
vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ name: "Alice Test" }]),
        }),
      }),
    }),
  },
}));

describe("Phase 2 Plan 02-06: Dashboard Aggregation Service (Unit Tests)", () => {
  const testUserId = "user-alice-123";
  const testDate = "2026-09-16";

  const emptyContext: DailyPlanContextDTO = {
    date: testDate,
    plan: null,
    review: null,
    priorityTasks: [],
    overdueTasks: [],
    todayHabits: [],
    todayTimeBlocks: [],
    suggestedTasks: [],
  };

  const sampleGoalLong: GoalDTO = {
    id: "g-long",
    userId: testUserId,
    title: "Long Term Vision",
    description: "Multi-year goal",
    horizon: "long_term",
    area: "career",
    status: "in_progress",
    priority: "high",
    metricType: "none",
    targetValue: null,
    currentValue: null,
    unit: null,
    startDate: "2026-01-01T00:00:00Z",
    targetDate: "2027-12-31T00:00:00Z",
    parentGoalId: null,
    progress: 40,
    completedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    childGoalsCount: 2,
    linkedProjectsCount: 3,
    directTasksCount: 5,
  };

  const sampleGoalShort: GoalDTO = {
    id: "g-short",
    userId: testUserId,
    title: "Short Term Sprint",
    description: "Monthly milestone",
    horizon: "short_term",
    area: "health",
    status: "in_progress",
    priority: "critical",
    metricType: "percentage",
    targetValue: 100,
    currentValue: 75,
    unit: "%",
    startDate: "2026-09-01T00:00:00Z",
    targetDate: "2026-09-30T00:00:00Z",
    parentGoalId: null,
    progress: 75,
    completedAt: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    childGoalsCount: 0,
    linkedProjectsCount: 1,
    directTasksCount: 2,
  };

  const sampleProject: ProjectDTO = {
    id: "p-1",
    userId: testUserId,
    name: "Core Platform v2",
    description: "Architecture revamp",
    area: "career",
    status: "active",
    priority: "critical",
    startDate: "2026-09-01T00:00:00Z",
    deadline: "2026-10-15T00:00:00Z",
    goalId: "g-long",
    progress: 60,
    milestonesCount: 3,
    tasksCount: 10,
    completedTasksCount: 6,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };

  const sampleTask1: TaskDTO = {
    id: "t-1",
    userId: testUserId,
    projectId: "p-1",
    parentTaskId: null,
    milestoneId: null,
    title: "Design unified dashboard wireframes",
    description: "Include executive control center",
    status: "todo",
    priority: "critical",
    scheduledDate: "2026-09-16T00:00:00Z",
    energyLevel: "high",
    recurrenceRule: null,
    goalId: "g-long",
    habitId: null,
    noteId: null,
    personId: null,
    tags: ["design", "core"],
    dueDate: "2026-09-16T18:00:00Z",
    estimatedDuration: 90,
    actualDuration: null,
    completedAt: null,
    priorityScore: 180,
    hasUncompletedDependencies: false,
    createdAt: "2026-09-15T00:00:00Z",
    updatedAt: "2026-09-15T00:00:00Z",
  };

  const sampleTask2: TaskDTO = {
    id: "t-2",
    userId: testUserId,
    projectId: null,
    parentTaskId: null,
    milestoneId: null,
    title: "Review system audit logs",
    description: null,
    status: "completed",
    priority: "medium",
    scheduledDate: "2026-09-16T00:00:00Z",
    energyLevel: "medium",
    recurrenceRule: null,
    goalId: null,
    habitId: null,
    noteId: null,
    personId: null,
    tags: [],
    dueDate: null,
    estimatedDuration: 30,
    actualDuration: 25,
    completedAt: "2026-09-16T10:00:00Z",
    priorityScore: 50,
    hasUncompletedDependencies: false,
    createdAt: "2026-09-15T00:00:00Z",
    updatedAt: "2026-09-16T10:00:00Z",
  };

  const sampleOverdueTask: TaskDTO = {
    id: "t-overdue",
    userId: testUserId,
    projectId: "p-1",
    parentTaskId: null,
    milestoneId: null,
    title: "Legacy task from yesterday",
    description: null,
    status: "todo",
    priority: "high",
    scheduledDate: "2026-09-15T00:00:00Z",
    energyLevel: "medium",
    recurrenceRule: null,
    goalId: null,
    habitId: null,
    noteId: null,
    personId: null,
    tags: [],
    dueDate: "2026-09-15T18:00:00Z",
    estimatedDuration: 60,
    actualDuration: null,
    completedAt: null,
    priorityScore: 210,
    hasUncompletedDependencies: false,
    createdAt: "2026-09-14T00:00:00Z",
    updatedAt: "2026-09-15T00:00:00Z",
  };

  const sampleHabit1: HabitDTO = {
    id: "h-1",
    userId: testUserId,
    title: "Morning Meditation",
    description: null,
    frequency: "daily",
    frequencyTarget: 1,
    frequencyDays: [0, 1, 2, 3, 4, 5, 6],
    intervalDays: 1,
    targetValue: 1,
    unit: "session",
    timeOfDay: "morning",
    reminderTime: "07:00",
    goalId: null,
    identityStatement: "I am mindful and calm",
    status: "active",
    currentStreak: 12,
    longestStreak: 20,
    isCompletedToday: true,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };

  const sampleHabit2: HabitDTO = {
    id: "h-2",
    userId: testUserId,
    title: "Evening Reading",
    description: null,
    frequency: "daily",
    frequencyTarget: 1,
    frequencyDays: [0, 1, 2, 3, 4, 5, 6],
    intervalDays: 1,
    targetValue: 20,
    unit: "pages",
    timeOfDay: "evening",
    reminderTime: "21:00",
    goalId: null,
    identityStatement: null,
    status: "active",
    currentStreak: 5,
    longestStreak: 10,
    isCompletedToday: false,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };

  const sampleTimeBlock: TimeBlockDTO = {
    id: "tb-1",
    userId: testUserId,
    title: "Deep Work: Architecture",
    description: null,
    startTime: "2026-09-16T14:00:00Z",
    endTime: "2026-09-16T16:00:00Z",
    durationMinutes: 120,
    status: "completed",
    commitmentLevel: "hard",
    actualMinutes: 110,
    completedAt: "2026-09-16T16:00:00Z",
    color: "#6366f1",
    taskId: "t-1",
    projectId: "p-1",
    goalId: null,
    habitId: null,
    createdAt: "2026-09-16T00:00:00Z",
    updatedAt: "2026-09-16T16:00:00Z",
  };

  const sampleHistory: DailyPlanHistoryDTO = {
    totalDays: 7,
    morningPlanCompletionRate: 85,
    eveningReviewCompletionRate: 71,
    averageProductivityScore: 84,
    days: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Rejects missing or blank user ID with AuthorizationError", async () => {
    await expect(getDashboardOverview("")).rejects.toThrow(AuthorizationError);
    await expect(getDashboardOverview("   ")).rejects.toThrow(AuthorizationError);
  });

  it("2. Handles completely empty domain data gracefully", async () => {
    vi.mocked(dailyPlanService.getDailyPlan).mockResolvedValue(emptyContext);
    vi.mocked(goalsService.listGoals).mockResolvedValue([]);
    vi.mocked(projectsService.listProjects).mockResolvedValue([]);
    vi.mocked(tasksService.listTasks).mockResolvedValue([]);
    vi.mocked(dailyPlanService.getDailyPlanHistory).mockResolvedValue({
      totalDays: 0,
      morningPlanCompletionRate: 0,
      eveningReviewCompletionRate: 0,
      averageProductivityScore: 0,
      days: [],
    });

    const overview = await getDashboardOverview(testUserId, testDate);

    expect(overview.date).toBe(testDate);
    expect(overview.greeting.userName).toBe("Alice Test");
    expect(overview.greeting.todayFormatted).toContain("September");
    expect(overview.metrics.activeGoalsCount).toBe(0);
    expect(overview.metrics.activeProjectsCount).toBe(0);
    expect(overview.metrics.pendingTasksCount).toBe(0);
    expect(overview.metrics.completedTasksCount).toBe(0);
    expect(overview.metrics.overdueTasksCount).toBe(0);
    expect(overview.metrics.criticalTasksCount).toBe(0);
    expect(overview.metrics.todayHabitsTotal).toBe(0);
    expect(overview.metrics.todayHabitsCompleted).toBe(0);
    expect(overview.metrics.todayTimeBlocksCount).toBe(0);
    expect(overview.metrics.todayProductivityScore).toBeNull();
    expect(overview.dailyPlan.hasPlan).toBe(false);
    expect(overview.dailyPlan.planStatus).toBe("none");
    expect(overview.dailyPlan.hasReview).toBe(false);
    expect(overview.priorities.todayTasks).toEqual([]);
    expect(overview.priorities.overdueTasks).toEqual([]);
    expect(overview.schedule.todayBlocks).toEqual([]);
    expect(overview.habits.items).toEqual([]);
    expect(overview.habits.completionRateToday).toBe(0);
    expect(overview.goalsAndProjects.activeGoals).toEqual([]);
    expect(overview.goalsAndProjects.activeProjects).toEqual([]);
  });

  it("3. Correctly aggregates active goals, projects, tasks, habits, and time blocks", async () => {
    vi.mocked(dailyPlanService.getDailyPlan).mockResolvedValue({
      date: testDate,
      plan: {
        id: "plan-1",
        userId: testUserId,
        date: testDate,
        status: "completed",
        priorityTaskIds: [sampleTask1.id],
        habitIntentionIds: [sampleHabit1.id],
        morningNotes: "High focus morning",
        completedAt: "2026-09-16T08:30:00Z",
        createdAt: "2026-09-16T08:00:00Z",
        updatedAt: "2026-09-16T08:30:00Z",
      },
      review: {
        id: "rev-1",
        userId: testUserId,
        dailyPlanId: "plan-1",
        date: testDate,
        productivityScore: 92,
        positiveReflections: "Crushed the morning tasks",
        challengesReflections: "Afternoon slump",
        notes: "Rest well",
        completedTaskIds: [sampleTask2.id],
        incompleteTaskIds: [sampleTask1.id],
        rolledOverTaskIds: ["t-yesterday"],
        completedHabitIds: [sampleHabit1.id],
        completedAt: "2026-09-16T21:00:00Z",
        createdAt: "2026-09-16T21:00:00Z",
        updatedAt: "2026-09-16T21:00:00Z",
      },
      priorityTasks: [sampleTask1],
      overdueTasks: [sampleOverdueTask],
      todayHabits: [sampleHabit1, sampleHabit2],
      todayTimeBlocks: [sampleTimeBlock],
      suggestedTasks: [],
    });

    vi.mocked(goalsService.listGoals).mockResolvedValue([
      sampleGoalShort,
      sampleGoalLong,
    ]);
    vi.mocked(projectsService.listProjects).mockResolvedValue([sampleProject]);
    vi.mocked(tasksService.listTasks).mockResolvedValue([
      sampleOverdueTask,
      sampleTask1,
      sampleTask2,
    ]);
    vi.mocked(dailyPlanService.getDailyPlanHistory).mockResolvedValue(
      sampleHistory
    );

    const overview = await getDashboardOverview(testUserId, testDate);

    // Metrics
    expect(overview.metrics.activeGoalsCount).toBe(2);
    expect(overview.metrics.activeProjectsCount).toBe(1);
    expect(overview.metrics.pendingTasksCount).toBe(2); // sampleOverdueTask + sampleTask1
    expect(overview.metrics.completedTasksCount).toBe(1); // sampleTask2
    expect(overview.metrics.overdueTasksCount).toBe(1); // sampleOverdueTask
    expect(overview.metrics.criticalTasksCount).toBe(2); // sampleTask1 (critical) + sampleOverdueTask (high)
    expect(overview.metrics.todayHabitsTotal).toBe(2);
    expect(overview.metrics.todayHabitsCompleted).toBe(1); // sampleHabit1
    expect(overview.metrics.todayTimeBlocksCount).toBe(1);
    expect(overview.metrics.todayProductivityScore).toBe(92);

    // Daily plan status
    expect(overview.dailyPlan.hasPlan).toBe(true);
    expect(overview.dailyPlan.planStatus).toBe("completed");
    expect(overview.dailyPlan.completedAt).toBe("2026-09-16T08:30:00Z");
    expect(overview.dailyPlan.morningNotes).toBe("High focus morning");
    expect(overview.dailyPlan.hasReview).toBe(true);
    expect(overview.dailyPlan.reviewCompleted).toBe(true);
    expect(overview.dailyPlan.productivityScore).toBe(92);
    expect(overview.dailyPlan.rolledOverCount).toBe(1);

    // Priorities
    expect(overview.priorities.todayTasks).toHaveLength(1);
    expect(overview.priorities.todayTasks[0].id).toBe("t-1");
    expect(overview.priorities.overdueTasks).toHaveLength(1);
    expect(overview.priorities.overdueTasks[0].id).toBe("t-overdue");

    // Habits & completion rate
    expect(overview.habits.items).toHaveLength(2);
    expect(overview.habits.completionRateToday).toBe(50); // 1 / 2 = 50%

    // Schedule & duration
    expect(overview.schedule.todayBlocks).toHaveLength(1);
    expect(overview.schedule.totalScheduledMinutes).toBe(120);
    expect(overview.schedule.completedMinutes).toBe(110);

    // Multi-horizon ordering: long_term before short_term
    expect(overview.goalsAndProjects.activeGoals[0].horizon).toBe("long_term");
    expect(overview.goalsAndProjects.activeGoals[1].horizon).toBe("short_term");

    // History trend
    expect(overview.recentTrend).toBeDefined();
    expect(overview.recentTrend?.averageProductivityScore).toBe(84);
    expect(overview.recentTrend?.morningPlanCompletionRate).toBe(85);
  });

  it("4. Normalizes dates properly", async () => {
    vi.mocked(dailyPlanService.getDailyPlan).mockResolvedValue(emptyContext);
    vi.mocked(goalsService.listGoals).mockResolvedValue([]);
    vi.mocked(projectsService.listProjects).mockResolvedValue([]);
    vi.mocked(tasksService.listTasks).mockResolvedValue([]);

    const overview = await getDashboardOverview(
      testUserId,
      "2026-11-25T14:30:00.000Z"
    );
    expect(overview.date).toBe("2026-11-25");
  });
});
