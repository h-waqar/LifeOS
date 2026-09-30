import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/server/db";
import { habitEntries, financeTransactions } from "@/server/db/schema";
import { listTasks } from "@/server/tasks/service";
import { listHabits } from "@/server/habits/service";
import { listContentItems } from "@/server/content/service";
import { type WeeklyReviewSynthesis } from "./types";

/**
 * Weekly Synthesis Review Engine.
 * Analyzes velocity, habit consistency, financial movements, and content output
 * across the past 7 days to generate an actionable strategic debrief.
 */
export async function generateWeeklyReview(
  userId: string,
  endDateInput?: string | Date
): Promise<WeeklyReviewSynthesis> {
  const endDateObj = endDateInput
    ? typeof endDateInput === "string"
      ? new Date(endDateInput)
      : endDateInput
    : new Date();

  const startDateObj = new Date(endDateObj.getTime() - 7 * 24 * 60 * 60 * 1000);

  const startDateStr = startDateObj.toISOString().slice(0, 10);
  const endDateStr = endDateObj.toISOString().slice(0, 10);

  // 1. Fetch completed tasks in range
  const allCompletedTasks = await listTasks(userId, { status: "completed" }).catch(
    () => []
  );
  const recentCompletedTasks = allCompletedTasks.filter((t) => {
    const d = t.updatedAt ? new Date(t.updatedAt) : null;
    return d && d >= startDateObj && d <= endDateObj;
  });

  // 2. Fetch active habits and recorded entries
  const activeHabits = await listHabits(userId, { status: "active" }).catch(
    () => []
  );
  const entries = await db
    .select()
    .from(habitEntries)
    .where(
      and(
        eq(habitEntries.userId, userId),
        gte(habitEntries.date, startDateStr),
        lte(habitEntries.date, endDateStr)
      )
    )
    .catch(() => []);

  const totalPossibleHabitCompletions = activeHabits.length * 7;
  const habitConsistencyPercentage =
    totalPossibleHabitCompletions > 0
      ? Math.min(
          100,
          Math.round((entries.length / totalPossibleHabitCompletions) * 100)
        )
      : 100;

  // 3. Fetch financial transactions in range
  const transactions = await db
    .select()
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        gte(financeTransactions.date, startDateObj),
        lte(financeTransactions.date, endDateObj)
      )
    )
    .catch(() => []);

  let totalExpenses = 0;
  let totalIncome = 0;
  for (const tx of transactions) {
    const amt = Number(tx.amount);
    if (tx.transactionType === "expense") {
      totalExpenses += amt;
    } else if (tx.transactionType === "income") {
      totalIncome += amt;
    }
  }

  // 4. Fetch published content items in range
  const contentResult = await listContentItems(userId, {
    status: "published",
  }).catch(() => ({ items: [], total: 0 }));

  const recentPublishedContent = contentResult.items.filter((item) => {
    const pDate = item.publishedAt ? new Date(item.publishedAt) : null;
    return pDate && pDate >= startDateObj && pDate <= endDateObj;
  });

  // 5. Construct Strategic Recommendations
  const recommendations: string[] = [];

  if (recentCompletedTasks.length === 0) {
    recommendations.push(
      "Task velocity stalled: schedule dedicated 90-minute focus blocks to clear blockers."
    );
  } else if (recentCompletedTasks.length >= 5) {
    recommendations.push(
      `Strong execution velocity with ${recentCompletedTasks.length} tasks completed. Maintain current sprint cadence.`
    );
  }

  if (habitConsistencyPercentage < 60) {
    recommendations.push(
      `Habit consistency dropped to ${habitConsistencyPercentage}%. Lower friction on core anchor habits.`
    );
  } else {
    recommendations.push(
      `Solid habit adherence at ${habitConsistencyPercentage}%. Stacking morning routines is working.`
    );
  }

  if (totalExpenses > totalIncome && totalIncome > 0) {
    recommendations.push(
      `Weekly expenses (${totalExpenses.toLocaleString()} PKR) exceeded income (${totalIncome.toLocaleString()} PKR). Review discretionary category budgets.`
    );
  }

  if (recommendations.length < 3) {
    recommendations.push(
      "Conduct a 15-minute weekly horizon review to re-align projects with quarterly goals."
    );
  }

  // 6. Generate Markdown Report
  const completedTaskLines =
    recentCompletedTasks.length > 0
      ? recentCompletedTasks
          .slice(0, 5)
          .map((t) => `- ✅ **${t.title}**${t.priority ? ` [${t.priority}]` : ""}`)
          .join("\n")
      : "- No tasks completed this week.";

  const contentLines =
    recentPublishedContent.length > 0
      ? recentPublishedContent
          .map((c) => `- 📝 **${c.title}** (${c.contentType})`)
          .join("\n")
      : "- No content published this week.";

  const markdownReport = `# 📊 Weekly Synthesis Review (${startDateStr} to ${endDateStr})

## 🚀 Velocity & Wins
- **Tasks Completed:** ${recentCompletedTasks.length} task(s) shipped
${completedTaskLines}
- **Content Published:** ${recentPublishedContent.length} item(s)
${contentLines}

## ⚠️ Friction & Drift
- **Habit Consistency:** ${habitConsistencyPercentage}% adherence across ${activeHabits.length} active habits
- **Logged Check-ins:** ${entries.length} of ${totalPossibleHabitCompletions} expected completions

## 💰 Financial Summary & Pacing
- **Total Income:** ${totalIncome.toLocaleString()} PKR
- **Total Expenses:** ${totalExpenses.toLocaleString()} PKR
- **Net Cashflow:** ${(totalIncome - totalExpenses).toLocaleString()} PKR

## 🎯 Next Week Strategic Focus
${recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}
`;

  return {
    period: {
      startDate: startDateStr,
      endDate: endDateStr,
    },
    metrics: {
      completedTasksCount: recentCompletedTasks.length,
      milestonesAchievedCount: 0,
      habitConsistencyPercentage,
      totalExpenses,
      totalIncome,
      publishedContentCount: recentPublishedContent.length,
    },
    markdownReport,
    recommendations,
  };
}
