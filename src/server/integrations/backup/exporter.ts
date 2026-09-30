import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  tasks,
  taskDependencies,
  projects,
  projectMilestones,
  goals,
  habits,
  habitEntries,
  timeBlocks,
  dailyPlans,
  eveningReviews,
  notes,
  noteLinks,
  people,
  interactions,
  learningItems,
  financeAccounts,
  financeCategories,
  financeTransactions,
  financeBudgets,
  contentItems,
  contentVariants,
  contentPublications,
  contentMetrics,
  automations,
  automationRuns,
  userPreferences,
} from "@/server/db/schema";
import { encryptSecret } from "@/lib/crypto";
import type {
  BackupManifest,
  BackupPayload,
  BackupNoteItem,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Backup exporter cannot be initialized in the browser."
  );
}

export interface ExportResult {
  backupId: string;
  buffer: Buffer;
  manifest: BackupManifest;
  entityCounts: Record<string, number>;
  checksum: string;
  isEncrypted: boolean;
}

export class BackupExporter {
  /**
   * Performs a comprehensive, user-isolated data export across all LifeOS tables and notes.
   */
  async exportUserData(userId: string, encrypt = false): Promise<ExportResult> {
    if (!userId?.trim()) {
      throw new Error("Missing user identifier for backup export");
    }

    const timestamp = new Date().toISOString();
    const backupId = `lifeos-backup-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    // Query user-scoped records from all domain tables in parallel
    const [
      userTasks,
      userTaskDeps,
      userProjects,
      userMilestones,
      userGoals,
      userHabits,
      userHabitEntries,
      userTimeBlocks,
      userDailyPlans,
      userEveningReviews,
      userNotes,
      userNoteLinks,
      userPeople,
      userInteractions,
      userLearning,
      userAccounts,
      userCategories,
      userTransactions,
      userBudgets,
      userContentItems,
      userContentVariants,
      userPublications,
      userMetrics,
      userAutomations,
      userAutomationRuns,
      userPrefs,
    ] = await Promise.all([
      db.select().from(tasks).where(eq(tasks.userId, userId)),
      db.select().from(taskDependencies).where(eq(taskDependencies.userId, userId)),
      db.select().from(projects).where(eq(projects.userId, userId)),
      db.select().from(projectMilestones).where(eq(projectMilestones.userId, userId)),
      db.select().from(goals).where(eq(goals.userId, userId)),
      db.select().from(habits).where(eq(habits.userId, userId)),
      db.select().from(habitEntries).where(eq(habitEntries.userId, userId)),
      db.select().from(timeBlocks).where(eq(timeBlocks.userId, userId)),
      db.select().from(dailyPlans).where(eq(dailyPlans.userId, userId)),
      db.select().from(eveningReviews).where(eq(eveningReviews.userId, userId)),
      db.select().from(notes).where(eq(notes.userId, userId)),
      db.select().from(noteLinks).where(eq(noteLinks.userId, userId)),
      db.select().from(people).where(eq(people.userId, userId)),
      db.select().from(interactions).where(eq(interactions.userId, userId)),
      db.select().from(learningItems).where(eq(learningItems.userId, userId)),
      db.select().from(financeAccounts).where(eq(financeAccounts.userId, userId)),
      db.select().from(financeCategories).where(eq(financeCategories.userId, userId)),
      db.select().from(financeTransactions).where(eq(financeTransactions.userId, userId)),
      db.select().from(financeBudgets).where(eq(financeBudgets.userId, userId)),
      db.select().from(contentItems).where(eq(contentItems.userId, userId)),
      db.select().from(contentVariants).where(eq(contentVariants.userId, userId)),
      db.select().from(contentPublications).where(eq(contentPublications.userId, userId)),
      db.select().from(contentMetrics).where(eq(contentMetrics.userId, userId)),
      db.select().from(automations).where(eq(automations.userId, userId)),
      db.select().from(automationRuns).where(eq(automationRuns.userId, userId)),
      db.select().from(userPreferences).where(eq(userPreferences.userId, userId)),
    ]);

    const entityCounts: Record<string, number> = {
      tasks: userTasks.length,
      taskDependencies: userTaskDeps.length,
      projects: userProjects.length,
      projectMilestones: userMilestones.length,
      goals: userGoals.length,
      habits: userHabits.length,
      habitEntries: userHabitEntries.length,
      timeBlocks: userTimeBlocks.length,
      dailyPlans: userDailyPlans.length,
      eveningReviews: userEveningReviews.length,
      notes: userNotes.length,
      noteLinks: userNoteLinks.length,
      people: userPeople.length,
      interactions: userInteractions.length,
      learningItems: userLearning.length,
      financeAccounts: userAccounts.length,
      financeCategories: userCategories.length,
      financeTransactions: userTransactions.length,
      financeBudgets: userBudgets.length,
      contentItems: userContentItems.length,
      contentVariants: userContentVariants.length,
      contentPublications: userPublications.length,
      contentMetrics: userMetrics.length,
      automations: userAutomations.length,
      automationRuns: userAutomationRuns.length,
      preferences: userPrefs.length,
    };

    // Export notes with clean markdown representation and frontmatter metadata
    const exportedNotes: BackupNoteItem[] = userNotes.map((n) => ({
      id: n.id,
      title: n.title,
      slug: (n.title || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      content: n.content || "",
      tags: Array.isArray(n.tags) ? (n.tags as string[]) : [],
      isPinned: n.isPinned,
      createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: n.updatedAt ? new Date(n.updatedAt).toISOString() : new Date().toISOString(),
    }));

    const rawPayload: Omit<BackupPayload, "manifest"> = {
      database: {
        tasks: userTasks,
        taskDependencies: userTaskDeps,
        projects: userProjects,
        projectMilestones: userMilestones,
        goals: userGoals,
        habits: userHabits,
        habitEntries: userHabitEntries,
        timeBlocks: userTimeBlocks,
        dailyPlans: userDailyPlans,
        eveningReviews: userEveningReviews,
        notes: userNotes,
        noteLinks: userNoteLinks,
        people: userPeople,
        interactions: userInteractions,
        learningItems: userLearning,
        financeAccounts: userAccounts,
        financeCategories: userCategories,
        financeTransactions: userTransactions,
        financeBudgets: userBudgets,
        contentItems: userContentItems,
        contentVariants: userContentVariants,
        contentPublications: userPublications,
        contentMetrics: userMetrics,
        automations: userAutomations,
        automationRuns: userAutomationRuns,
        preferences: userPrefs,
      },
      notes: exportedNotes,
    };

    // Calculate deterministic content SHA-256 checksum
    const rawSerialized = JSON.stringify(rawPayload);
    const checksum = crypto.createHash("sha256").update(rawSerialized).digest("hex");

    const manifest: BackupManifest = {
      backupId,
      schemaVersion: "1.0",
      timestamp,
      userId,
      checksum,
      encrypted: encrypt,
      entityCounts,
    };

    const finalBackup: BackupPayload = {
      manifest,
      database: rawPayload.database,
      notes: rawPayload.notes,
    };

    const serializedFinal = JSON.stringify(finalBackup, null, 2);

    let finalBuffer: Buffer;
    if (encrypt) {
      const encryptedString = encryptSecret(serializedFinal);
      finalBuffer = Buffer.from(encryptedString, "utf-8");
    } else {
      finalBuffer = Buffer.from(serializedFinal, "utf-8");
    }

    return {
      backupId,
      buffer: finalBuffer,
      manifest,
      entityCounts,
      checksum,
      isEncrypted: encrypt,
    };
  }
}

export const backupExporter = new BackupExporter();
