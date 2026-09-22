export type LifeArea =
  | "health"
  | "career"
  | "finance"
  | "personal_development"
  | "relationships"
  | "general";

export type GoalHorizon = "long_term" | "medium_term" | "short_term";

export type GoalStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "paused"
  | "archived";

export type GoalMetricType =
  | "none"
  | "numeric"
  | "currency"
  | "boolean"
  | "percentage";

export type ProjectStatus =
  | "planning"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type Priority = "low" | "medium" | "high" | "critical";

export type MilestoneStatus = "pending" | "completed";

export type TaskStatus =
  | "inbox"
  | "todo"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";

export type EnergyLevel = "low" | "medium" | "high";

export interface RecurrenceRule {
  frequency: "daily" | "weekly" | "monthly" | "custom";
  interval: number;
  daysOfWeek?: number[];
  endDate?: string;
  count?: number;
}

export interface GoalDTO {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  horizon: GoalHorizon;
  area: LifeArea;
  status: GoalStatus;
  priority: Priority;
  metricType: GoalMetricType;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  startDate: string | null;
  targetDate: string | null;
  parentGoalId: string | null;
  progress: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  childGoalsCount?: number;
  linkedProjectsCount?: number;
  directTasksCount?: number;
}

export interface ProjectMilestoneDTO {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: MilestoneStatus;
  completedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDTO {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  area: LifeArea;
  status: ProjectStatus;
  priority: Priority;
  startDate: string | null;
  deadline: string | null;
  goalId: string | null;
  progress: number;
  milestonesCount?: number;
  tasksCount?: number;
  completedTasksCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDependencyDTO {
  id: string;
  userId: string;
  taskId: string;
  dependsOnTaskId: string;
  createdAt: string;
}

export interface TaskDTO {
  id: string;
  userId: string;
  projectId: string | null;
  parentTaskId: string | null;
  milestoneId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  scheduledDate: string | null;
  energyLevel: EnergyLevel | null;
  recurrenceRule: RecurrenceRule | null;
  goalId: string | null;
  habitId: string | null;
  noteId: string | null;
  personId: string | null;
  tags: string[];
  dueDate: string | null;
  estimatedDuration: number | null;
  actualDuration: number | null;
  completedAt: string | null;
  priorityScore: number;
  hasUncompletedDependencies?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferencesDTO {
  id: string;
  userId: string;
  theme: "dark" | "light" | "system";
  dateFormat: string;
  timeFormat: "12h" | "24h";
  workingHoursStart: string;
  workingHoursEnd: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUserDTO {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type HabitFrequency =
  | "daily"
  | "weekdays"
  | "weekly"
  | "specific_days"
  | "custom";

export type TimeOfDayCue = "morning" | "afternoon" | "evening" | "anytime";

export type HabitStatus = "active" | "paused" | "archived";

export interface HabitStreakStats {
  currentStreak: number;
  longestStreak: number;
  completionRate30d: number;
  completionRateAllTime: number;
  isCompletedToday: boolean;
  totalCompletions: number;
}

export interface HabitDTO {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  frequency: HabitFrequency;
  frequencyTarget: number;
  frequencyDays: number[];
  intervalDays: number;
  targetValue: number;
  unit: string | null;
  timeOfDay: TimeOfDayCue;
  reminderTime: string | null;
  goalId: string | null;
  identityStatement: string | null;
  status: HabitStatus;
  currentStreak: number;
  longestStreak: number;
  completionRate30d?: number;
  completionRateAllTime?: number;
  isCompletedToday?: boolean;
  entries?: HabitEntryDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface HabitEntryDTO {
  id: string;
  userId: string;
  habitId: string;
  date: string;
  value: number;
  targetValue: number;
  notes: string | null;
  completedAt: string;
  createdAt: string;
}

export type CommitmentLevel = "soft" | "hard";

export type TimeBlockStatus = "scheduled" | "completed" | "cancelled";

export interface TimeBlockDTO {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: TimeBlockStatus;
  commitmentLevel: CommitmentLevel;
  actualMinutes: number | null;
  completedAt: string | null;
  color: string | null;
  taskId: string | null;
  projectId: string | null;
  goalId: string | null;
  habitId: string | null;
  hasConflict?: boolean;
  hasHardConflict?: boolean;
  conflictingBlockIds?: string[];
  taskTitle?: string | null;
  projectTitle?: string | null;
  goalTitle?: string | null;
  habitTitle?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventDeadline {
  id: string;
  type: "task_due" | "task_scheduled" | "project_deadline" | "habit_cue";
  title: string;
  date: string;
  time?: string | null;
  entityId: string;
  status?: string;
  priority?: Priority;
}

export interface CalendarFeedDTO {
  timeBlocks: TimeBlockDTO[];
  deadlines: CalendarEventDeadline[];
  scheduledTasks: TaskDTO[];
  totalScheduledMinutes: number;
  totalCompletedMinutes: number;
  conflictCount: number;
}

export type DailyPlanStatus = "in_progress" | "completed";

export interface DailyPlanDTO {
  id: string;
  userId: string;
  date: string;
  status: DailyPlanStatus;
  priorityTaskIds: string[];
  habitIntentionIds: string[];
  morningNotes: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EveningReviewDTO {
  id: string;
  userId: string;
  dailyPlanId: string | null;
  date: string;
  productivityScore: number;
  positiveReflections: string | null;
  challengesReflections: string | null;
  notes: string | null;
  completedTaskIds: string[];
  incompleteTaskIds: string[];
  rolledOverTaskIds: string[];
  completedHabitIds: string[];
  completedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyPlanContextDTO {
  date: string;
  plan: DailyPlanDTO | null;
  review: EveningReviewDTO | null;
  priorityTasks: TaskDTO[];
  overdueTasks: TaskDTO[];
  todayHabits: HabitDTO[];
  todayTimeBlocks: TimeBlockDTO[];
  suggestedTasks: TaskDTO[];
}

export interface DailyPlanDaySummary {
  date: string;
  hasMorningPlan: boolean;
  morningPlanCompleted: boolean;
  hasEveningReview: boolean;
  productivityScore: number | null;
  priorityTasksCount: number;
  completedPriorityTasksCount: number;
  habitsCount: number;
  completedHabitsCount: number;
  reflections: {
    positive?: string | null;
    challenges?: string | null;
    notes?: string | null;
  } | null;
}

export interface DailyPlanHistoryDTO {
  totalDays: number;
  morningPlanCompletionRate: number;
  eveningReviewCompletionRate: number;
  averageProductivityScore: number;
  days: DailyPlanDaySummary[];
}

export interface RolloverActionItem {
  taskId: string;
  action: "carry_over" | "reschedule" | "backlog";
  targetDate?: string;
}

export interface DashboardMetricsDTO {
  activeGoalsCount: number;
  activeProjectsCount: number;
  pendingTasksCount: number;
  completedTasksCount: number;
  overdueTasksCount: number;
  criticalTasksCount: number;
  todayHabitsTotal: number;
  todayHabitsCompleted: number;
  todayTimeBlocksCount: number;
  todayProductivityScore: number | null;
}

export interface DashboardDailyPlanSummaryDTO {
  hasPlan: boolean;
  planStatus: "none" | "in_progress" | "completed";
  completedAt: string | null;
  morningNotes: string | null;
  hasReview: boolean;
  reviewCompleted: boolean;
  productivityScore: number | null;
  rolledOverCount: number;
}

export interface DashboardPrioritiesDTO {
  todayTasks: TaskDTO[];
  overdueTasks: TaskDTO[];
  criticalTasks: TaskDTO[];
}

export interface DashboardScheduleDTO {
  todayBlocks: TimeBlockDTO[];
  totalScheduledMinutes: number;
  completedMinutes: number;
}

export interface DashboardHabitsDTO {
  items: HabitDTO[];
  completionRateToday: number;
}

export interface DashboardGoalsAndProjectsDTO {
  activeGoals: GoalDTO[];
  activeProjects: ProjectDTO[];
}

export interface DashboardRecentTrendDTO {
  averageProductivityScore: number;
  morningPlanCompletionRate: number;
  eveningReviewCompletionRate: number;
}

export interface DashboardOverviewDTO {
  date: string;
  greeting: {
    userName: string;
    todayFormatted: string;
  };
  metrics: DashboardMetricsDTO;
  dailyPlan: DashboardDailyPlanSummaryDTO;
  priorities: DashboardPrioritiesDTO;
  schedule: DashboardScheduleDTO;
  habits: DashboardHabitsDTO;
  goalsAndProjects: DashboardGoalsAndProjectsDTO;
  recentTrend?: DashboardRecentTrendDTO;
}

// ---------------------------------------------------------------------------
// Phase 3: Notes & Knowledge Graph Types
// ---------------------------------------------------------------------------

export type NoteType =
  | "quick"
  | "meeting"
  | "research"
  | "idea"
  | "journal"
  | "documentation"
  | "reference"
  | "learning";

export interface NoteDTO {
  id: string;
  userId: string;
  title: string;
  slug: string;
  content: string;
  noteType: NoteType;
  area: LifeArea;
  tags: string[];
  isPinned: boolean;
  isArchived: boolean;
  projectId: string | null;
  goalId: string | null;
  taskId: string | null;
  personId?: string | null;
  learningId?: string | null;
  outgoingLinksCount?: number;
  backlinksCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface NoteLinkDTO {
  id: string;
  userId: string;
  sourceNoteId: string;
  targetNoteId: string | null;
  targetTitle: string;
  displayText: string | null;
  createdAt: string;
}

export interface BacklinkItemDTO {
  noteId: string;
  title: string;
  slug: string;
  displayText: string | null;
  snippet: string;
  updatedAt: string;
}

export interface CreateNoteInput {
  title: string;
  content?: string;
  noteType?: NoteType;
  area?: LifeArea;
  tags?: string[];
  isPinned?: boolean;
  projectId?: string | null;
  goalId?: string | null;
  taskId?: string | null;
  personId?: string | null;
  learningId?: string | null;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  noteType?: NoteType;
  area?: LifeArea;
  tags?: string[];
  isPinned?: boolean;
  isArchived?: boolean;
  projectId?: string | null;
  goalId?: string | null;
  taskId?: string | null;
  personId?: string | null;
  learningId?: string | null;
}

// ---------------------------------------------------------------------------
// Phase 3: Relationships / People CRM Types
// ---------------------------------------------------------------------------

export const RELATIONSHIP_TYPES = [
  "client",
  "friend",
  "family",
  "colleague",
  "prospect",
  "mentor",
  "professional",
  "other",
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const INTERACTION_CHANNELS = [
  "meeting",
  "call",
  "email",
  "message",
  "in_person",
  "other",
] as const;

export type InteractionChannel = (typeof INTERACTION_CHANNELS)[number];

export const FOLLOW_UP_STATUSES = ["overdue", "today", "upcoming", "none"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export interface PersonDTO {
  id: string;
  userId: string;
  name: string;
  relationshipType: RelationshipType;
  company: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  contactInfo: Record<string, any>;
  tags: string[];
  notes: string | null;
  isArchived: boolean;
  lastInteractionDate: string | null;
  nextFollowUpDate: string | null;
  followUpStatus: FollowUpStatus;
  interactionsCount?: number;
  linkedTasksCount?: number;
  linkedProjectsCount?: number;
  linkedNotesCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface InteractionDTO {
  id: string;
  userId: string;
  personId: string;
  date: string;
  channel: InteractionChannel;
  summary: string;
  nextFollowUpDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonDetailDTO extends PersonDTO {
  interactions: InteractionDTO[];
  linkedTasks: TaskDTO[];
  linkedProjects: ProjectDTO[];
  linkedNotes: NoteDTO[];
}

export interface CreatePersonInput {
  name: string;
  relationshipType?: RelationshipType;
  company?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  contactInfo?: Record<string, any>;
  tags?: string[];
  notes?: string | null;
  nextFollowUpDate?: string | null;
}

export interface UpdatePersonInput {
  name?: string;
  relationshipType?: RelationshipType;
  company?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  contactInfo?: Record<string, any>;
  tags?: string[];
  notes?: string | null;
  isArchived?: boolean;
  nextFollowUpDate?: string | null;
}

export interface LogInteractionInput {
  date?: string;
  channel?: InteractionChannel;
  summary: string;
  nextFollowUpDate?: string | null;
}

export interface UpdateInteractionInput {
  date?: string;
  channel?: InteractionChannel;
  summary?: string;
  nextFollowUpDate?: string | null;
}

export interface FollowUpRemindersDTO {
  overdue: PersonDTO[];
  today: PersonDTO[];
  upcoming: PersonDTO[];
  totalReminders: number;
}

// ---------------------------------------------------------------------------
// Phase 3: Learning System Types (Phase 3 Plan 03-04)
// ---------------------------------------------------------------------------

export const LEARNING_TYPES = [
  "book",
  "course",
  "article",
  "podcast",
  "skill",
  "documentation",
  "other",
] as const;

export type LearningType = (typeof LEARNING_TYPES)[number];

export const LEARNING_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "archived",
] as const;

export type LearningStatus = (typeof LEARNING_STATUSES)[number];

export interface LearningItemDTO {
  id: string;
  userId: string;
  title: string;
  type: LearningType;
  status: LearningStatus;
  author: string | null;
  url: string | null;
  rating: number | null;
  progress: number;
  currentUnits: number | null;
  totalUnits: number | null;
  unitType: string | null;
  summary: string | null;
  keyTakeaways: string[];
  tags: string[];
  goalId: string | null;
  projectId: string | null;
  goalTitle?: string | null;
  projectName?: string | null;
  isArchived: boolean;
  completedAt: string | null;
  linkedNotesCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LearningItemDetailDTO extends LearningItemDTO {
  linkedNotes: NoteDTO[];
}

export interface CreateLearningItemInput {
  title: string;
  type?: LearningType;
  status?: LearningStatus;
  author?: string | null;
  url?: string | null;
  rating?: number | null;
  progress?: number;
  currentUnits?: number | null;
  totalUnits?: number | null;
  unitType?: string | null;
  summary?: string | null;
  keyTakeaways?: string[];
  tags?: string[];
  goalId?: string | null;
  projectId?: string | null;
}

export interface UpdateLearningItemInput {
  title?: string;
  type?: LearningType;
  status?: LearningStatus;
  author?: string | null;
  url?: string | null;
  rating?: number | null;
  progress?: number;
  currentUnits?: number | null;
  totalUnits?: number | null;
  unitType?: string | null;
  summary?: string | null;
  keyTakeaways?: string[];
  tags?: string[];
  goalId?: string | null;
  projectId?: string | null;
  isArchived?: boolean;
  completedAt?: string | null;
}

export interface LearningStatsDTO {
  totalItems: number;
  activeCount: number;
  completedCount: number;
  averageProgress: number;
  byType: Record<LearningType, number>;
}

// ---------------------------------------------------------------------------
// Unified Search Types (Phase 3 Plan 03-03)
// ---------------------------------------------------------------------------

export type SearchEntityType =
  | "note"
  | "task"
  | "project"
  | "goal"
  | "person"
  | "learning";

export interface SearchResultItem {
  id: string;
  type: SearchEntityType;
  title: string;
  subtitle?: string;
  snippet?: string;
  href: string;
  score: number;
  metadata?: Record<string, unknown>;
  updatedAt: string;
}

export interface SearchResponseDTO {
  query: string;
  results: SearchResultItem[];
  total: number;
  byType: Record<SearchEntityType, number>;
}
