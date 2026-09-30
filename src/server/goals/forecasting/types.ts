import type { LifeArea, GoalHorizon, Priority, GoalStatus } from "@/types";

export type GoalRiskLevel =
  | "on_track"
  | "low_risk"
  | "medium_risk"
  | "high_risk"
  | "critical"
  | "completed";

export type DataSufficiency = "sufficient" | "sparse" | "insufficient";

export type RiskFactorSeverity = "low" | "medium" | "high" | "critical";

export interface ContributingRiskFactor {
  code: string;
  severity: RiskFactorSeverity;
  factor: string;
  impactWeight: number; // 0.0 to 1.0
  observedMetric?: string;
}

export interface GoalForecastSignals {
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  overdueTasks: number;
  overdueTaskRate: number; // 0.0 to 1.0
  totalProjects: number;
  completedProjects: number;
  averageProjectProgress: number; // 0 to 100
  stalledProjectsCount: number;
  linkedHabitsCount: number;
  averageHabitConsistency: number | null; // 0 to 100 or null if no habits
  recentFocusHours: number;
  expectedProgressByTimeline: number | null; // 0 to 100 or null if no deadline
  progressGap: number | null; // expectedProgress - currentProgress (positive means lagging)
  historicalDaysSampled: number;
}

export interface GoalRiskForecastDTO {
  goalId: string;
  goalTitle: string;
  status: GoalStatus | string;
  priority: Priority | string;
  area: LifeArea | string;
  horizon: GoalHorizon | string;
  currentProgress: number; // 0 to 100

  // Deadlines & Timeline
  targetDate: string | null;
  daysRemaining: number | null;
  isOverdue: boolean;

  // Velocities (% progress per day)
  currentVelocityPerDay: number;
  requiredVelocityPerDay: number | null;
  velocityRatio: number | null; // currentVelocity / requiredVelocity

  // Projections
  projectedCompletionDate: string | null;
  projectedCompletionWindow: {
    earliestDate: string;
    latestDate: string;
  } | null;
  daysToCompleteProjected: number | null;

  // Risk & Confidence
  riskLevel: GoalRiskLevel;
  riskScore: number; // 0 to 100 (0 = completed/no risk, 100 = critical failure)
  confidenceScore: number; // 0.0 to 1.0

  // Data Sufficiency
  dataSufficiency: DataSufficiency;
  sufficientData: boolean;
  dataPointsCount: number;
  sufficiencyExplanation: string;

  // Diagnostics & Signals
  signals: GoalForecastSignals;

  // Explainability
  contributingFactors: ContributingRiskFactor[];
  actionableRecommendations: string[];

  generatedAt: string;
}

export interface GoalForecastSummaryDTO {
  totalGoals: number;
  onTrackCount: number;
  lowRiskCount: number;
  mediumRiskCount: number;
  highRiskCount: number;
  criticalCount: number;
  completedCount: number;
  overdueCount: number;
  averageRiskScore: number;
  atRiskGoals: Array<{
    id: string;
    title: string;
    riskLevel: GoalRiskLevel;
    riskScore: number;
    reason: string;
  }>;
  forecasts: GoalRiskForecastDTO[];
  generatedAt: string;
}

export interface GoalForecastSignalInput {
  goalId: string;
  goalTitle: string;
  goalStatus: "not_started" | "in_progress" | "completed" | "paused" | "archived" | string;
  priority: "low" | "medium" | "high" | "critical" | string;
  area: LifeArea | string;
  horizon: GoalHorizon | string;
  currentProgress: number;
  startDate: Date | string | null;
  targetDate: Date | string | null;
  createdAt: Date | string;
  completedAt?: Date | string | null;

  tasks: Array<{
    id: string;
    title?: string;
    status: string;
    priority?: string;
    dueDate: Date | string | null;
    completedAt: Date | string | null;
    createdAt: Date | string;
  }>;

  projects: Array<{
    id: string;
    name: string;
    status: string;
    progress: number;
    targetDate: Date | string | null;
    createdAt: Date | string;
  }>;

  habits?: Array<{
    id: string;
    title: string;
    consistencyRate: number; // 0 to 100
    currentStreak: number;
  }>;

  focusMinutes?: number;
  asOfDate?: Date | string;
}
