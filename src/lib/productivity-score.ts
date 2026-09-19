/**
 * Pure Deterministic Productivity Scoring Engine (PLAN-02)
 *
 * Rules:
 * - Pure mathematical calculation with zero database, zero API, and zero React dependencies.
 * - Deterministic output for any given inputs.
 * - Score strictly bounded between 0 and 100.
 * - Dynamic weight redistribution: If a user has no scheduled time blocks or no habits,
 *   weights are redistributed proportionally across active categories rather than penalizing or gifting points.
 */

export interface ProductivityScoreInput {
  plannedTasksCount: number;
  completedTasksCount: number;
  plannedHabitsCount: number;
  completedHabitsCount: number;
  plannedTimeBlocksCount?: number;
  completedTimeBlocksCount?: number;
  selfRating?: number | null; // Optional subjective rating from 1 to 10
}

export interface ProductivityScoreResult {
  score: number; // Strictly 0 to 100
  taskCompletionRate: number; // 0 to 100
  habitCompletionRate: number; // 0 to 100
  timeBlockCompletionRate: number; // 0 to 100
  weightsUsed: {
    tasks: number;
    habits: number;
    timeBlocks: number;
    selfRating: number;
  };
  summary: string;
}

/**
 * Calculates a daily productivity score between 0 and 100.
 */
export function calculateProductivityScore(
  input: ProductivityScoreInput
): ProductivityScoreResult {
  const totalTasks = Math.max(0, Math.floor(input.plannedTasksCount || 0));
  const doneTasks = Math.max(0, Math.floor(input.completedTasksCount || 0));

  const totalHabits = Math.max(0, Math.floor(input.plannedHabitsCount || 0));
  const doneHabits = Math.max(0, Math.floor(input.completedHabitsCount || 0));

  const totalBlocks = Math.max(0, Math.floor(input.plannedTimeBlocksCount || 0));
  const doneBlocks = Math.max(0, Math.floor(input.completedTimeBlocksCount || 0));

  // Compute percentage rates (0 to 100)
  const taskRate =
    totalTasks > 0 ? Math.min(100, (doneTasks / totalTasks) * 100) : 0;
  const habitRate =
    totalHabits > 0 ? Math.min(100, (doneHabits / totalHabits) * 100) : 0;
  const blockRate =
    totalBlocks > 0 ? Math.min(100, (doneBlocks / totalBlocks) * 100) : 0;

  // Handle self-rating (1 to 10 converted to 0-100 scale)
  const hasSelfRating =
    input.selfRating !== undefined &&
    input.selfRating !== null &&
    !isNaN(input.selfRating);
  const normalizedSelfRating = hasSelfRating
    ? Math.max(0, Math.min(100, (Math.max(1, Math.min(10, input.selfRating!)) / 10) * 100))
    : 0;

  // Determine active categories and initial nominal weights
  // Default ideal weights: Tasks 50%, Habits 30%, Time Blocks 20%
  // If self-rating present: Tasks 40%, Habits 25%, Time Blocks 15%, Self-Rating 20%
  const nominalWeights = hasSelfRating
    ? {
        tasks: totalTasks > 0 ? 40 : 0,
        habits: totalHabits > 0 ? 25 : 0,
        timeBlocks: totalBlocks > 0 ? 15 : 0,
        selfRating: 20,
      }
    : {
        tasks: totalTasks > 0 ? 50 : 0,
        habits: totalHabits > 0 ? 30 : 0,
        timeBlocks: totalBlocks > 0 ? 20 : 0,
        selfRating: 0,
      };

  const totalNominalWeight =
    nominalWeights.tasks +
    nominalWeights.habits +
    nominalWeights.timeBlocks +
    nominalWeights.selfRating;

  // If nothing was planned and no self rating, score is 0
  if (totalNominalWeight === 0) {
    return {
      score: 0,
      taskCompletionRate: 0,
      habitCompletionRate: 0,
      timeBlockCompletionRate: 0,
      weightsUsed: { tasks: 0, habits: 0, timeBlocks: 0, selfRating: 0 },
      summary: "No planned items or ratings recorded for this day.",
    };
  }

  // Normalize weights so they sum exactly to 1.0 (100%)
  const normalizedWeights = {
    tasks: nominalWeights.tasks / totalNominalWeight,
    habits: nominalWeights.habits / totalNominalWeight,
    timeBlocks: nominalWeights.timeBlocks / totalNominalWeight,
    selfRating: nominalWeights.selfRating / totalNominalWeight,
  };

  const weightedScore =
    taskRate * normalizedWeights.tasks +
    habitRate * normalizedWeights.habits +
    blockRate * normalizedWeights.timeBlocks +
    normalizedSelfRating * normalizedWeights.selfRating;

  const finalScore = Math.max(0, Math.min(100, Math.round(weightedScore)));

  // Generate concise human-readable summary
  let summary = "";
  if (finalScore >= 90) {
    summary = "Exceptional day! High execution consistency across priorities and habits.";
  } else if (finalScore >= 75) {
    summary = "Solid productivity! Most planned focus work and habits achieved.";
  } else if (finalScore >= 50) {
    summary = "Moderate progress. Core commitments addressed with room for carry-over.";
  } else {
    summary = "Low completion today. Review friction points during evening rollover.";
  }

  const rawTaskWeight = Math.round(normalizedWeights.tasks * 100);
  const rawHabitWeight = Math.round(normalizedWeights.habits * 100);
  const rawBlockWeight = Math.round(normalizedWeights.timeBlocks * 100);
  const rawSelfWeight = Math.round(normalizedWeights.selfRating * 100);

  const diff = 100 - (rawTaskWeight + rawHabitWeight + rawBlockWeight + rawSelfWeight);
  let adjustedTask = rawTaskWeight;
  let adjustedHabit = rawHabitWeight;
  let adjustedBlock = rawBlockWeight;
  let adjustedSelf = rawSelfWeight;

  if (diff !== 0) {
    if (adjustedTask >= Math.max(adjustedHabit, adjustedBlock, adjustedSelf) && adjustedTask > 0) {
      adjustedTask += diff;
    } else if (adjustedHabit >= Math.max(adjustedBlock, adjustedSelf) && adjustedHabit > 0) {
      adjustedHabit += diff;
    } else if (adjustedBlock >= adjustedSelf && adjustedBlock > 0) {
      adjustedBlock += diff;
    } else if (adjustedSelf > 0) {
      adjustedSelf += diff;
    }
  }

  return {
    score: finalScore,
    taskCompletionRate: Math.round(taskRate),
    habitCompletionRate: Math.round(habitRate),
    timeBlockCompletionRate: Math.round(blockRate),
    weightsUsed: {
      tasks: adjustedTask,
      habits: adjustedHabit,
      timeBlocks: adjustedBlock,
      selfRating: adjustedSelf,
    },
    summary,
  };
}
