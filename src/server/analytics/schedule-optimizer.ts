import type { EnergyLevel } from "@/types";
import type {
  HistoricalRawData,
  ScheduleOptimizationResult,
  FocusWindow,
  EnergyTierRecommendation,
} from "./types";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Pure Deterministic Schedule Optimization Engine (INTEL-04)
 * Analyzes historical task completions, energy levels, timeblock execution,
 * and evening review productivity scores to suggest optimal focus blocks
 * and daily energy tier mapping.
 */
export function calculateScheduleOptimization(
  tasks: HistoricalRawData["tasks"],
  timeBlocks: HistoricalRawData["timeBlocks"],
  eveningReviews: HistoricalRawData["eveningReviews"]
): ScheduleOptimizationResult {
  // 1. Analyze Completed Tasks by Hour and Energy Level
  const hourlyEnergyCounts: Record<number, { high: number; medium: number; low: number; total: number }> = {};
  for (let i = 0; i < 24; i++) {
    hourlyEnergyCounts[i] = { high: 0, medium: 0, low: 0, total: 0 };
  }

  let tasksWithEnergyCount = 0;
  const completedTasksWithTimes: Array<{ hour: number; energy: EnergyLevel; duration: number }> = [];

  for (const t of tasks) {
    if (t.status === "completed" && t.completedAt) {
      const dateObj = new Date(t.completedAt);
      if (!isNaN(dateObj.getTime())) {
        const hour = dateObj.getUTCHours();
        const energy: EnergyLevel = t.energyLevel || "medium";
        if (t.energyLevel) tasksWithEnergyCount++;

        hourlyEnergyCounts[hour][energy]++;
        hourlyEnergyCounts[hour].total++;

        completedTasksWithTimes.push({
          hour,
          energy,
          duration: t.actualDuration || t.estimatedDuration || 45,
        });
      }
    }
  }

  // 2. Identify Peak Morning / High-Energy Window (Sliding 2-3 hour window)
  // Look across morning hours (6am - 13pm) for peak high-energy tasks
  let bestMorningScore = -1;
  let bestMorningStart = 9;

  for (let h = 6; h <= 12; h++) {
    const score =
      (hourlyEnergyCounts[h]?.high || 0) * 3 +
      (hourlyEnergyCounts[h + 1]?.high || 0) * 3 +
      (hourlyEnergyCounts[h]?.total || 0) +
      (hourlyEnergyCounts[h + 1]?.total || 0);

    if (score > bestMorningScore) {
      bestMorningScore = score;
      bestMorningStart = h;
    }
  }

  // 3. Identify Secondary Afternoon Window (13pm - 18pm)
  let bestAfternoonScore = -1;
  let bestAfternoonStart = 14;

  for (let h = 13; h <= 17; h++) {
    const score =
      (hourlyEnergyCounts[h]?.medium || 0) * 2 +
      (hourlyEnergyCounts[h + 1]?.medium || 0) * 2 +
      (hourlyEnergyCounts[h]?.total || 0) +
      (hourlyEnergyCounts[h + 1]?.total || 0);

    if (score > bestAfternoonScore) {
      bestAfternoonScore = score;
      bestAfternoonStart = h;
    }
  }

  const hasHistoricalData = tasksWithEnergyCount >= 3 || completedTasksWithTimes.length >= 5;

  const peakStartStr = String(hasHistoricalData ? bestMorningStart : 9).padStart(2, "0") + ":00";
  const peakEndHour = hasHistoricalData ? Math.min(23, bestMorningStart + 2) : 11;
  const peakEndStr = String(peakEndHour).padStart(2, "0") + ":30";

  const secStartStr = String(hasHistoricalData ? bestAfternoonStart : 14).padStart(2, "0") + ":00";
  const secEndHour = hasHistoricalData ? Math.min(23, bestAfternoonStart + 2) : 16;
  const secEndStr = String(secEndHour).padStart(2, "0") + ":00";

  const peakConfidence = hasHistoricalData
    ? Math.min(95, Math.round(50 + Math.min(45, tasksWithEnergyCount * 4)))
    : 70;

  const peakFocusWindow: FocusWindow = {
    startHour: peakStartStr,
    endHour: peakEndStr,
    title: "Prime Deep-Work Window",
    rationale: hasHistoricalData
      ? `Historical completion data shows your highest concentration of High-Energy task completions occurs between ${peakStartStr} and ${peakEndStr}.`
      : "Circadian rhythm baseline recommends scheduling complex, high-energy cognitive tasks in the morning peak.",
    confidenceScore: peakConfidence,
  };

  const secondaryFocusWindow: FocusWindow = {
    startHour: secStartStr,
    endHour: secEndStr,
    title: "Secondary Execution Window",
    rationale: hasHistoricalData
      ? `Afternoon focus recovers between ${secStartStr} and ${secEndStr}, suitable for medium-energy collaborative tasks and reviews.`
      : "Post-lunch circadian recovery window for steady execution, reviews, and project collaboration.",
    confidenceScore: Math.max(50, peakConfidence - 15),
  };

  // 4. Calculate Average Completed Timeblock Duration
  const completedBlocks = timeBlocks.filter(
    (b) => b.status === "completed" && (b.actualMinutes || b.durationMinutes) > 0
  );
  let recommendedBlockDurationMinutes = 60;

  if (completedBlocks.length >= 3) {
    const totalMins = completedBlocks.reduce(
      (acc, b) => acc + (b.actualMinutes || b.durationMinutes),
      0
    );
    const avgMins = Math.round(totalMins / completedBlocks.length);
    // Snap to sensible block sizes: 30, 45, 60, 90
    if (avgMins <= 35) recommendedBlockDurationMinutes = 30;
    else if (avgMins <= 50) recommendedBlockDurationMinutes = 45;
    else if (avgMins <= 75) recommendedBlockDurationMinutes = 60;
    else recommendedBlockDurationMinutes = 90;
  }

  // 5. Day of Week Productivity Ranking
  const dayScores: Record<number, { totalScore: number; count: number; tasks: number }> = {};
  for (let i = 0; i < 7; i++) {
    dayScores[i] = { totalScore: 0, count: 0, tasks: 0 };
  }

  for (const r of eveningReviews) {
    const d = new Date(r.date + "T00:00:00Z");
    if (!isNaN(d.getTime())) {
      const dayIdx = d.getUTCDay();
      dayScores[dayIdx].totalScore += r.productivityScore || 0;
      dayScores[dayIdx].count++;
      dayScores[dayIdx].tasks += r.completedTaskIds?.length || 0;
    }
  }

  const bestProductivityDays = Object.entries(dayScores)
    .map(([dayIdx, val]) => {
      const idx = Number(dayIdx);
      const averageScore =
        val.count > 0 ? Math.round((val.totalScore / val.count) * 10) / 10 : 75;
      const averageTasksCompleted =
        val.count > 0 ? Math.round((val.tasks / val.count) * 10) / 10 : 3;
      return {
        dayOfWeek: DAY_NAMES[idx],
        averageScore,
        averageTasksCompleted,
      };
    })
    .sort((a, b) => b.averageScore - a.averageScore);

  // 6. Energy Tier Recommendations
  const highEnergySuccess =
    hasHistoricalData && hourlyEnergyCounts[bestMorningStart]?.high > 0
      ? Math.min(95, Math.round(75 + hourlyEnergyCounts[bestMorningStart].high * 3))
      : 85;

  const energyTiers: EnergyTierRecommendation[] = [
    {
      tier: "high",
      recommendedTimeWindow: `${peakStartStr} - ${peakEndStr}`,
      bestTaskTypes: [
        "Deep Work & Architecture",
        "Complex Coding & Debugging",
        "Writing & Creative Strategy",
        "P0 Milestone Deliverables",
      ],
      historicalSuccessRate: highEnergySuccess,
    },
    {
      tier: "medium",
      recommendedTimeWindow: `${secStartStr} - ${secEndStr}`,
      bestTaskTypes: [
        "Code Reviews & PR Triage",
        "Project Planning & Task Breakdown",
        "Meetings & Collaborative Discussions",
        "Documentation & Refactoring",
      ],
      historicalSuccessRate: Math.max(70, highEnergySuccess - 10),
    },
    {
      tier: "low",
      recommendedTimeWindow: "16:30 - 18:30 & After 20:00",
      bestTaskTypes: [
        "Inbox Zero & Quick Capture Triage",
        "Habit Check-ins & Daily Rollover",
        "Administrative Work & Status Updates",
        "Evening Review & Reflection",
      ],
      historicalSuccessRate: 90,
    },
  ];

  // 7. Actionable Recommendations
  const topDay1 = bestProductivityDays[0]?.dayOfWeek || "Tuesday";
  const topDay2 = bestProductivityDays[1]?.dayOfWeek || "Thursday";

  const actionableRecommendations: string[] = [
    `Protect your ${peakStartStr}–${peakEndStr} prime focus window: schedule P0 high-energy tasks exclusively during this time block.`,
    `Optimal focus block length is ${recommendedBlockDurationMinutes} minutes: split deep-work sessions into ${recommendedBlockDurationMinutes}m intervals with 5–10m breaks to sustain velocity.`,
    `${topDay1} and ${topDay2} are your highest productivity days (averaging ${bestProductivityDays[0]?.averageScore || 80}+ on evening reviews). Plan critical milestones early in these days.`,
    `Defer shallow tasks and communication to the 16:30+ low-energy tier to avoid fracturing morning focus blocks.`,
  ];

  return {
    peakFocusWindow,
    secondaryFocusWindow,
    energyTiers,
    recommendedBlockDurationMinutes,
    bestProductivityDays,
    actionableRecommendations,
    dataPointsAnalyzed: {
      tasksWithEnergyCount,
      completedTimeBlocksCount: completedBlocks.length,
      eveningReviewsCount: eveningReviews.length,
      daysSampled: Object.keys(dayScores).length,
    },
  };
}
