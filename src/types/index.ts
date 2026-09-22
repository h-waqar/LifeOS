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
  | "learning"
  | "content";

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
  byType: Partial<Record<SearchEntityType, number>>;
}

// ---------------------------------------------------------------------------
// Personal Finance Types (Phase 4)
// ---------------------------------------------------------------------------

export type FinanceAccountType =
  | "checking"
  | "savings"
  | "investment"
  | "credit_card"
  | "cash";

export type FinanceCategoryType = "income" | "expense";

export type FinanceTransactionType = "income" | "expense" | "transfer";

export interface FinanceAccount {
  id: string;
  userId: string;
  name: string;
  accountType: FinanceAccountType;
  currency: string;
  initialBalance: string;
  balance: string;
  isArchived: boolean;
  notes?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type FinanceAccountDTO = FinanceAccount;

export interface FinanceCategory {
  id: string;
  userId: string;
  name: string;
  categoryType: FinanceCategoryType;
  icon?: string | null;
  color?: string | null;
  isSystem: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type FinanceCategoryDTO = FinanceCategory;

export interface FinanceTransaction {
  id: string;
  userId: string;
  accountId: string;
  toAccountId?: string | null;
  categoryId?: string | null;
  goalId?: string | null;
  transactionType: FinanceTransactionType;
  amount: string;
  currency: string;
  date: Date | string;
  payee?: string | null;
  description?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type FinanceTransactionDTO = FinanceTransaction;

export interface EnrichedTransaction extends FinanceTransaction {
  accountName: string;
  toAccountName?: string | null;
  categoryName?: string | null;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  goalTitle?: string | null;
}

export interface FinanceBudget {
  id: string;
  userId: string;
  categoryId: string;
  month: string;
  targetAmount: string;
  currency: string;
  notes?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type FinanceBudgetDTO = FinanceBudget;

export interface CategoryBudgetProgress {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  month: string;
  targetAmount: number;
  spentAmount: number;
  remainingAmount: number;
  utilizationPercentage: number;
  isOverBudget: boolean;
  currency: string;
  notes?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CategorySpendingItem {
  categoryId: string;
  categoryName: string;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  spent: number;
  percentageOfTotal: number;
}

export interface FinanceSummaryReport {
  month: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  totalIncome: number;
  totalExpenses: number;
  cashFlow: number;
  savingsRate: number;
  categorySpendingBreakdown: CategorySpendingItem[];
}

export interface FinancialGoalSummary {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  metricType: string;
  targetValue: number | null;
  currentValue: number;
  progress: number;
  unit?: string | null;
  targetDate?: Date | string | null;
  recentTransactions: Array<{
    id: string;
    amount: string;
    currency: string;
    date: Date | string;
    description?: string | null;
    payee?: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Phase 5: Content & Social Media Types
// ---------------------------------------------------------------------------

export const CONTENT_TYPES = [
  "post",
  "thread",
  "article",
  "short_video",
  "carousel",
  "newsletter",
  "other",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_STATUSES = [
  "idea",
  "draft",
  "in_review",
  "scheduled",
  "published",
  "archived",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_PLATFORMS = [
  "twitter",
  "linkedin",
  "blog",
  "instagram",
  "youtube",
  "newsletter",
  "other",
] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];

export const VARIANT_STATUSES = ["draft", "ready", "published"] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];

export const PUBLICATION_STATUSES = [
  "scheduled",
  "published",
  "failed",
  "cancelled",
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export interface VariantCustomSettings {
  slug?: string;
  canonicalUrl?: string;
  metaDescription?: string;
  hashtags?: string[];
  threadNumbering?: boolean;
}

export interface ContentVariantDTO {
  id: string;
  userId: string;
  contentItemId: string;
  platform: ContentPlatform;
  title: string | null;
  body: string;
  threadItems: string[];
  charCount: number;
  status: VariantStatus;
  customSettings: VariantCustomSettings;
  createdAt: string;
  updatedAt: string;
}

export interface ContentItemDTO {
  id: string;
  userId: string;
  title: string;
  contentType: ContentType;
  status: ContentStatus;
  topic: string | null;
  targetAudience: string | null;
  primaryPlatform: ContentPlatform | null;
  targetChannels: ContentPlatform[];
  tags: string[];
  summary: string | null;
  mediaUrls: string[];
  scheduledAt: string | null;
  publishedAt: string | null;
  projectId: string | null;
  goalId: string | null;
  noteId: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  variantsCount?: number;
  variants?: ContentVariantDTO[];
  projectName?: string | null;
  goalTitle?: string | null;
  noteTitle?: string | null;
}

export interface CreateContentItemInput {
  title: string;
  contentType?: ContentType;
  status?: ContentStatus;
  topic?: string | null;
  targetAudience?: string | null;
  primaryPlatform?: ContentPlatform | null;
  targetChannels?: ContentPlatform[];
  tags?: string[];
  summary?: string | null;
  mediaUrls?: string[];
  scheduledAt?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  noteId?: string | null;
}

export interface UpdateContentItemInput {
  title?: string;
  contentType?: ContentType;
  status?: ContentStatus;
  topic?: string | null;
  targetAudience?: string | null;
  primaryPlatform?: ContentPlatform | null;
  targetChannels?: ContentPlatform[];
  tags?: string[];
  summary?: string | null;
  mediaUrls?: string[];
  scheduledAt?: string | null;
  publishedAt?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  noteId?: string | null;
  isArchived?: boolean;
}

export interface UpsertContentVariantInput {
  platform: ContentPlatform;
  title?: string | null;
  body: string;
  threadItems?: string[];
  status?: VariantStatus;
  customSettings?: VariantCustomSettings;
}

export interface ContentPublicationDTO {
  id: string;
  userId: string;
  contentItemId: string;
  variantId: string | null;
  platform: ContentPlatform;
  status: PublicationStatus;
  scheduledFor: string;
  publishedAt: string | null;
  postUrl: string | null;
  externalPostId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  contentTitle?: string;
  contentType?: ContentType;
}

export interface ContentMetricDTO {
  id: string;
  userId: string;
  publicationId: string;
  contentItemId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  engagementRate: number;
  notes: string | null;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelMetricsSummary {
  platform: ContentPlatform;
  totalPosts: number;
  totalViews: number;
  totalEngagements: number;
  averageEngagementRate: number;
}

export interface LeaderboardItemDTO {
  contentItemId: string;
  publicationId: string;
  title: string;
  platform: ContentPlatform;
  publishedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  totalEngagements: number;
  engagementRate: number;
}

export interface ContentAnalyticsDTO {
  totalViews: number;
  totalEngagements: number;
  averageEngagementRate: number;
  publishedCount: number;
  channelBreakdown: ChannelMetricsSummary[];
  leaderboard: LeaderboardItemDTO[];
}

export interface SchedulePublicationInput {
  contentItemId: string;
  variantId?: string | null;
  platform: ContentPlatform;
  scheduledFor: string;
}

export interface ReschedulePublicationInput {
  scheduledFor: string;
}

export interface MarkPublishedInput {
  publishedAt?: string | null;
  postUrl?: string | null;
  externalPostId?: string | null;
  notes?: string | null;
}

export interface LogMetricsInput {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  notes?: string | null;
}


