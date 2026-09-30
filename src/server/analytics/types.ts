import type { LifeArea, GoalHorizon, EnergyLevel } from "@/types";

export type PeriodFilter = "7d" | "30d" | "90d" | "month" | "custom";
export type TrendDirection = "up" | "down" | "flat";

export interface MetricDelta {
  current: number;
  previous: number;
  absoluteDelta: number;
  percentageDelta: number | null;
  direction: TrendDirection;
}

export interface TimeAllocationSummary {
  totalScheduledMinutes: number;
  totalCompletedMinutes: number;
  completionRate: number;
  focusMinutes: number;
  shallowMinutes: number;
  areaBreakdown: {
    area: LifeArea;
    scheduledMinutes: number;
    completedMinutes: number;
    percentageOfTotal: number;
  }[];
  projectBreakdown: {
    projectId: string;
    projectName: string;
    minutes: number;
    percentageOfTotal: number;
  }[];
  dailyDistribution: {
    date: string;
    completedMinutes: number;
    focusMinutes: number;
  }[];
  deltas: {
    completedMinutes: MetricDelta;
    focusMinutes: MetricDelta;
    completionRate: MetricDelta;
  };
}

export interface HabitConsistencySummary {
  overallConsistencyRate: number;
  activeHabitsCount: number;
  totalCompletions: number;
  totalExpected: number;
  perfectDaysCount: number;
  averageStreak: number;
  longestActiveStreak: number;
  habitBreakdown: {
    habitId: string;
    title: string;
    frequency: string;
    targetCompletions: number;
    actualCompletions: number;
    consistencyRate: number;
    currentStreak: number;
    longestStreak: number;
  }[];
  timeOfDayBreakdown: {
    cue: "morning" | "afternoon" | "evening" | "anytime";
    completions: number;
    percentage: number;
  }[];
  dailyConsistency: {
    date: string;
    expected: number;
    completed: number;
    rate: number;
  }[];
  deltas: {
    overallConsistencyRate: MetricDelta;
    totalCompletions: MetricDelta;
  };
}

export interface ProjectVelocitySummary {
  tasksCompletedCount: number;
  tasksCreatedCount: number;
  velocityPerDay: number;
  velocityPerWeek: number;
  overdueCount: number;
  overdueRate: number;
  overallTaskCompletionRate: number;
  estimationAccuracy: number;
  activeProjectsCount: number;
  completedProjectsCount: number;
  completedMilestonesCount: number;
  dailyVelocity: {
    date: string;
    completedTasks: number;
    createdTasks: number;
    rollingAvg7d: number;
  }[];
  projectBreakdown: {
    projectId: string;
    projectName: string;
    tasksCompleted: number;
    progress: number;
    status: string;
  }[];
  deltas: {
    tasksCompletedCount: MetricDelta;
    velocityPerDay: MetricDelta;
    overdueRate: MetricDelta;
    estimationAccuracy: MetricDelta;
  };
}

export interface GoalProgressAnalytics {
  totalGoalsCount: number;
  activeGoalsCount: number;
  completedGoalsCount: number;
  averageProgress: number;
  areaRollup: {
    area: LifeArea;
    goalsCount: number;
    averageProgress: number;
  }[];
  horizonRollup: {
    horizon: GoalHorizon;
    goalsCount: number;
    averageProgress: number;
  }[];
  stalledGoalsCount: number;
  goalsMovingForwardCount: number;
  goalList: {
    id: string;
    title: string;
    area: LifeArea;
    horizon: GoalHorizon;
    progress: number;
    targetDate: string | null;
    status: string;
  }[];
  deltas: {
    averageProgress: MetricDelta;
    completedGoalsCount: MetricDelta;
  };
}

export interface CrossDomainCorrelations {
  habitVsVelocityCorrelation: {
    highHabitDaysAvgTasks: number;
    lowHabitDaysAvgTasks: number;
    impactPercentage: number;
  };
  deepWorkVsProductivityScore: {
    highFocusDaysAvgScore: number;
    lowFocusDaysAvgScore: number;
    scoreDelta: number;
  };
  dailyPlanCompletionImpact: {
    plannedDaysAvgVelocity: number;
    unplannedDaysAvgVelocity: number;
    velocityLiftPercentage: number;
  };
  githubProductivityOverlap?: {
    totalCommits: number;
    avgCommitsOnHighVelocityDays: number;
    avgCommitsOnLowVelocityDays: number;
  };
}

export interface FocusWindow {
  startHour: string;
  endHour: string;
  title: string;
  rationale: string;
  confidenceScore: number;
}

export interface EnergyTierRecommendation {
  tier: EnergyLevel;
  recommendedTimeWindow: string;
  bestTaskTypes: string[];
  historicalSuccessRate: number;
}

export interface ScheduleOptimizationResult {
  peakFocusWindow: FocusWindow;
  secondaryFocusWindow: FocusWindow;
  energyTiers: EnergyTierRecommendation[];
  recommendedBlockDurationMinutes: number;
  bestProductivityDays: {
    dayOfWeek: string;
    averageScore: number;
    averageTasksCompleted: number;
  }[];
  actionableRecommendations: string[];
  dataPointsAnalyzed: {
    tasksWithEnergyCount: number;
    completedTimeBlocksCount: number;
    eveningReviewsCount: number;
    daysSampled: number;
  };
}

export interface AnalyticsDashboardDTO {
  period: {
    periodType: string;
    startDate: string;
    endDate: string;
    previousStartDate: string;
    previousEndDate: string;
    daysCount: number;
  };
  overview: {
    totalFocusHours: number;
    taskCompletionRate: number;
    habitConsistencyRate: number;
    averageProductivityScore: number;
    deltas: {
      focusHours: MetricDelta;
      taskCompletionRate: MetricDelta;
      habitConsistencyRate: MetricDelta;
      productivityScore: MetricDelta;
    };
  };
  timeAllocation: TimeAllocationSummary;
  habitConsistency: HabitConsistencySummary;
  projectVelocity: ProjectVelocitySummary;
  goalProgress: GoalProgressAnalytics;
  correlations: CrossDomainCorrelations;
  scheduleOptimization: ScheduleOptimizationResult;
  financeOverview?: {
    totalIncome: number;
    totalExpenses: number;
    netSavings: number;
    savingsRate: number;
  };
  githubStats?: {
    totalCommits: number;
    totalPRs: number;
    totalIssues: number;
  };
  generatedAt: string;
}

export interface HistoricalRawData {
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    energyLevel: EnergyLevel | null;
    estimatedDuration: number | null;
    actualDuration: number | null;
    dueDate: Date | string | null;
    scheduledDate: Date | string | null;
    completedAt: Date | string | null;
    createdAt: Date | string;
    projectId: string | null;
    goalId: string | null;
  }>;
  projects: Array<{
    id: string;
    name: string;
    status: string;
    progress?: number;
    area: LifeArea;
    createdAt: Date | string;
    completedAt?: Date | string | null;
  }>;
  goals: Array<{
    id: string;
    title: string;
    status: string;
    progress: number;
    area: LifeArea;
    horizon: GoalHorizon;
    targetDate: Date | string | null;
    updatedAt: Date | string;
  }>;
  habits: Array<{
    id: string;
    title: string;
    frequency: string;
    frequencyTarget?: number;
    frequencyDays?: number[];
    timeOfDay?: string | null;
    currentStreak: number;
    longestStreak: number;
    status: string;
  }>;
  habitEntries: Array<{
    id: string;
    habitId: string;
    date: string;
    completedAt: Date | string;
  }>;
  timeBlocks: Array<{
    id: string;
    title: string;
    startTime: Date | string;
    endTime: Date | string;
    durationMinutes: number;
    actualMinutes: number | null;
    status: string;
    commitmentLevel: string;
    projectId: string | null;
    goalId: string | null;
    taskId: string | null;
  }>;
  dailyPlans: Array<{
    id: string;
    date: string;
    status: string;
    priorityTaskIds: string[];
    completedAt?: Date | string | null;
  }>;
  eveningReviews: Array<{
    id: string;
    date: string;
    productivityScore: number;
    completedTaskIds: string[];
  }>;
  githubActivities?: Array<{
    id: string;
    activityType: string;
    timestamp: Date | string;
  }>;
  financeTransactions?: Array<{
    id: string;
    transactionType: "income" | "expense" | "transfer";
    amount: string | number;
    date: Date | string;
  }>;
}
