/**
 * Goals and Projects Deterministic Progress Rollup Engine
 * Implements pure mathematical rollup algorithms for:
 * - Project progress based on tasks and milestones completion (50/50 weighting when both present).
 * - Goal metric progress based on numeric, currency, boolean, and percentage metrics.
 * - Goal deliverables progress combining linked projects, direct tasks, and child goals.
 * - Goal total progress combining metric (50%) and deliverables (50%).
 * - Upward tree cascading with cycle detection.
 */

export type GoalMetricType =
  | "none"
  | "numeric"
  | "currency"
  | "boolean"
  | "percentage";

export interface GoalMetricInput {
  metricType: GoalMetricType;
  targetValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
}

export interface ProjectProgressInput {
  tasks: Array<{ status: string }>;
  milestones?: Array<{ status: string }>;
  status?: string;
}

export interface GoalDeliverablesInput {
  projects?: Array<{
    id: string;
    progress: number;
    status: string;
  }>;
  directTasks?: Array<{ status: string }>;
  childGoals?: Array<{ progress: number; status?: string }>;
  includeArchivedProjects?: boolean;
}

export interface GoalProgressInput {
  status?: string;
  metric?: GoalMetricInput | null;
  deliverables?: GoalDeliverablesInput | null;
}

export interface GoalProgressNode {
  id: string;
  parentId: string | null;
  progress: number;
  status: string;
  childIds: string[];
  projects: Array<{ id: string; progress: number; status: string }>;
  directTasks: Array<{ status: string }>;
  metric: GoalMetricInput | null;
}

/**
 * Calculates project progress bounded [0, 100].
 * - If tasks and milestones both exist: 50% tasks completion + 50% milestones completion.
 * - If only tasks exist: 100% tasks completion.
 * - If only milestones exist: 100% milestones completion.
 * - If neither exist: 100 if status = 'completed', else 0.
 */
export function calculateProjectProgress(input: ProjectProgressInput): number {
  const totalTasks = input.tasks?.length ?? 0;
  const completedTasks =
    input.tasks?.filter((t) => t.status === "completed").length ?? 0;

  const totalMilestones = input.milestones?.length ?? 0;
  const completedMilestones =
    input.milestones?.filter((m) => m.status === "completed").length ?? 0;

  if (totalTasks === 0 && totalMilestones === 0) {
    return input.status === "completed" ? 100 : 0;
  }

  let progress = 0;
  if (totalTasks > 0 && totalMilestones > 0) {
    const taskPct = (completedTasks / totalTasks) * 100;
    const milestonePct = (completedMilestones / totalMilestones) * 100;
    progress = Math.round(0.5 * taskPct + 0.5 * milestonePct);
  } else if (totalTasks > 0) {
    progress = Math.round((completedTasks / totalTasks) * 100);
  } else {
    progress = Math.round((completedMilestones / totalMilestones) * 100);
  }

  return Math.min(100, Math.max(0, progress));
}

/**
 * Calculates metric progress bounded [0, 100] or returns null if no metric configured.
 */
export function calculateMetricProgress(
  metric?: GoalMetricInput | null
): number | null {
  if (!metric || metric.metricType === "none") {
    return null;
  }

  if (metric.metricType === "boolean") {
    const target = metric.targetValue ?? 1;
    const current = metric.currentValue ?? 0;
    return current >= target ? 100 : 0;
  }

  const target = metric.targetValue;
  if (target === undefined || target === null || target <= 0) {
    return 0;
  }

  const current = metric.currentValue ?? 0;
  if (current <= 0) {
    return 0;
  }

  const pct = Math.round((current / target) * 100);
  return Math.min(100, Math.max(0, pct));
}

/**
 * Calculates deliverables progress combining projects, direct tasks, and child goals with equal category weighting.
 * Handles archived projects:
 * - Completed archived projects contribute 100% to goal deliverables.
 * - Incomplete archived projects are excluded by default unless includeArchivedProjects is true.
 * Returns null if no active deliverable items exist.
 */
export function calculateDeliverablesProgress(
  deliverables?: GoalDeliverablesInput | null
): number | null {
  if (!deliverables) {
    return null;
  }

  const categoryAverages: number[] = [];

  // 1. Projects Category
  if (deliverables.projects && deliverables.projects.length > 0) {
    const qualifyingProjects = deliverables.projects.filter((p) => {
      if (p.status !== "archived") return true;
      if (deliverables.includeArchivedProjects) return true;
      // If archived without includeArchivedProjects flag, only include if already completed (progress >= 100)
      return p.progress >= 100;
    });

    if (qualifyingProjects.length > 0) {
      const sum = qualifyingProjects.reduce((acc, p) => acc + p.progress, 0);
      categoryAverages.push(sum / qualifyingProjects.length);
    }
  }

  // 2. Direct Tasks Category
  if (deliverables.directTasks && deliverables.directTasks.length > 0) {
    const total = deliverables.directTasks.length;
    const completed = deliverables.directTasks.filter(
      (t) => t.status === "completed"
    ).length;
    categoryAverages.push((completed / total) * 100);
  }

  // 3. Child Goals Category
  if (deliverables.childGoals && deliverables.childGoals.length > 0) {
    const sum = deliverables.childGoals.reduce((acc, g) => acc + g.progress, 0);
    categoryAverages.push(sum / deliverables.childGoals.length);
  }

  if (categoryAverages.length === 0) {
    return null;
  }

  const average =
    categoryAverages.reduce((acc, v) => acc + v, 0) / categoryAverages.length;
  return Math.min(100, Math.max(0, Math.round(average)));
}

/**
 * Calculates total goal progress:
 * - If metric and deliverables exist: 50% metric + 50% deliverables.
 * - If metric only: 100% metric.
 * - If deliverables only: 100% deliverables.
 * - If neither: 100 if status = 'completed', else 0.
 * Always strictly bounded [0, 100].
 */
export function calculateGoalProgress(input: GoalProgressInput): number {
  const metricPct = calculateMetricProgress(input.metric);
  const delivPct = calculateDeliverablesProgress(input.deliverables);

  if (metricPct !== null && delivPct !== null) {
    return Math.min(100, Math.max(0, Math.round(0.5 * metricPct + 0.5 * delivPct)));
  }

  if (metricPct !== null) {
    return metricPct;
  }

  if (delivPct !== null) {
    return delivPct;
  }

  return input.status === "completed" ? 100 : 0;
}

/**
 * Cascades progress updates up the goal hierarchy tree.
 * Prevents infinite loops if cycles exist.
 * Returns array of { goalId, oldProgress, newProgress } that were updated.
 */
export function cascadeGoalProgress(
  goalTree: Map<string, GoalProgressNode>,
  updatedGoalId: string
): Array<{ goalId: string; oldProgress: number; newProgress: number }> {
  const visited = new Set<string>();
  const updates: Array<{
    goalId: string;
    oldProgress: number;
    newProgress: number;
  }> = [];

  let currentId: string | null = updatedGoalId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = goalTree.get(currentId);
    if (!node) break;

    const childGoals = (node.childIds || [])
      .map((cId) => goalTree.get(cId))
      .filter((c): c is GoalProgressNode => Boolean(c))
      .map((c) => ({ progress: c.progress, status: c.status }));

    const hasInputs =
      node.metric !== null ||
      (node.projects && node.projects.length > 0) ||
      (node.directTasks && node.directTasks.length > 0) ||
      childGoals.length > 0;

    const newProgress = hasInputs
      ? calculateGoalProgress({
          status: node.status,
          metric: node.metric,
          deliverables: {
            projects: node.projects,
            directTasks: node.directTasks,
            childGoals,
          },
        })
      : currentId === updatedGoalId
        ? node.progress
        : calculateGoalProgress({
            status: node.status,
            metric: null,
            deliverables: null,
          });

    const oldProgress = node.progress;
    node.progress = newProgress;

    updates.push({
      goalId: currentId,
      oldProgress,
      newProgress,
    });

    currentId = node.parentId;
  }

  return updates;
}
