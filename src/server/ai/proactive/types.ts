export interface RecommendedTask {
  id: string;
  title: string;
  priority: "low" | "medium" | "high" | "critical";
  reason: string;
  priorityScore: number;
  estimatedDurationMinutes: number;
  dueDate?: string | null;
  projectName?: string | null;
}

export interface RecommendedTimeBlock {
  title: string;
  startTime: string;
  endTime: string;
  taskId?: string;
  commitmentLevel: "soft" | "hard";
  reason: string;
}

export interface PlanningWarning {
  type: "overdue" | "overload" | "conflict";
  message: string;
}

export interface DailyPlanningSuggestions {
  date: string;
  focusTasks: RecommendedTask[];
  timeblockRecommendations: RecommendedTimeBlock[];
  warnings: PlanningWarning[];
  summary: string;
  totalFreeMinutes: number;
  overdueCount: number;
}

export interface WeeklyReviewSynthesis {
  period: {
    startDate: string;
    endDate: string;
  };
  metrics: {
    completedTasksCount: number;
    milestonesAchievedCount: number;
    habitConsistencyPercentage: number;
    totalExpenses: number;
    totalIncome: number;
    publishedContentCount: number;
  };
  markdownReport: string;
  recommendations: string[];
}
