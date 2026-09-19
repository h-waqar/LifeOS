import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { projects } from "@/server/db/schema/projects";
import { tasks } from "@/server/db/schema/tasks";
import { auth } from "@/server/auth";
import {
  createTask,
  updateTask,
  getTask,
  listTasks,
  quickCaptureTask,
} from "@/server/tasks/service";
import { createProject } from "@/server/projects/service";
import { eq } from "drizzle-orm";

describe("Plan 02-01: Task Service Extensions (Recurrence, Filters, Priority Sorting, Quick Capture)", () => {
  let probe: ProbeResult;

  const testUserData = {
    email: "p02_service_ext@example.com",
    password: "Plan02ExtPassword123!",
    name: "Service Extensions Tester",
  };

  let testUserId: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUserData,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const [createdUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUserData.email));
    testUserId = createdUser.id;
  });

  afterAll(async () => {
    if (!probe.isAvailable) return;
    await db.delete(user);
    await closeDatabase();
  });

  describe("Recurrence Spawning on Completion", () => {
    it("spawns the next daily recurrence instance upon task completion", async () => {
      if (!probe.isAvailable) return;

      const initialDueDate = new Date("2026-10-01T10:00:00.000Z");
      const recurringTask = await createTask(testUserId, {
        title: "Daily Standup Routine",
        dueDate: initialDueDate.toISOString(),
        recurrenceRule: {
          frequency: "daily",
          interval: 1,
        },
      });

      // Complete the recurring task
      await updateTask(testUserId, recurringTask.id, {
        status: "completed",
      });

      // Original task is completed
      const original = await getTask(testUserId, recurringTask.id);
      expect(original?.status).toBe("completed");
      expect(original?.completedAt).toBeTruthy();

      // Next task has been spawned
      const allTasks = await listTasks(testUserId, { status: "todo" });
      const spawned = allTasks.find(
        (t) => t.title === "Daily Standup Routine" && t.id !== recurringTask.id
      );

      expect(spawned).toBeDefined();
      expect(spawned?.status).toBe("todo");
      expect(new Date(spawned!.dueDate!).toISOString()).toBe(
        new Date("2026-10-02T10:00:00.000Z").toISOString()
      );
      expect(spawned?.recurrenceRule?.frequency).toBe("daily");
    });

    it("respects recurrence count limit and ceases spawning when exhausted", async () => {
      if (!probe.isAvailable) return;

      const singleRunTask = await createTask(testUserId, {
        title: "Bi-daily Limited Task",
        dueDate: new Date("2026-10-05T09:00:00.000Z").toISOString(),
        recurrenceRule: {
          frequency: "daily",
          interval: 2,
          count: 1, // Already at count 1, so no further occurrences
        },
      });

      await updateTask(testUserId, singleRunTask.id, {
        status: "completed",
      });

      const todoTasks = await listTasks(testUserId, { status: "todo" });
      const spawned = todoTasks.find(
        (t) => t.title === "Bi-daily Limited Task"
      );
      expect(spawned).toBeUndefined();
    });
  });

  describe("Multi-Criteria Filtering & Sorting", () => {
    it("filters by energyLevel, scheduledDate, and overdue correctly", async () => {
      if (!probe.isAvailable) return;

      // Clean tasks for clean query assertions
      await db.delete(tasks);

      const targetDate = "2026-09-20";

      const tHighEnergy = await createTask(testUserId, {
        title: "High Energy Sprint",
        energyLevel: "high",
        scheduledDate: `${targetDate}T09:00:00.000Z`,
        dueDate: "2026-09-25T18:00:00.000Z",
      });

      const tLowEnergy = await createTask(testUserId, {
        title: "Low Energy Admin",
        energyLevel: "low",
        scheduledDate: `${targetDate}T14:00:00.000Z`,
        dueDate: "2026-09-25T18:00:00.000Z",
      });

      const tOverdue = await createTask(testUserId, {
        title: "Overdue Bill Payment",
        energyLevel: "medium",
        scheduledDate: "2026-09-10T10:00:00.000Z",
        dueDate: "2026-09-11T12:00:00.000Z", // In the past
      });

      // 1. Filter by energyLevel
      const highOnly = await listTasks(testUserId, { energyLevel: "high" });
      expect(highOnly.length).toBe(1);
      expect(highOnly[0].id).toBe(tHighEnergy.id);

      // 2. Filter by scheduledDate
      const scheduledOnTarget = await listTasks(testUserId, {
        scheduledDate: targetDate,
      });
      expect(scheduledOnTarget.length).toBe(2);

      // 3. Filter by overdue
      const overdueOnly = await listTasks(testUserId, { overdue: true });
      expect(overdueOnly.length).toBe(1);
      expect(overdueOnly[0].id).toBe(tOverdue.id);
    });

    it("sorts by dynamic priority_score descending with tie-breakers", async () => {
      if (!probe.isAvailable) return;

      await db.delete(tasks);

      // Task 1: Low priority, no due date -> Score = 20
      const tLow = await createTask(testUserId, {
        title: "T Low",
        priority: "low",
      });

      // Task 2: High priority, due in 2 hours -> Score ~ 100 + 40 = 140
      const twoHoursLater = new Date(Date.now() + 2 * 3600 * 1000);
      const tUrgent = await createTask(testUserId, {
        title: "T Urgent",
        priority: "high",
        dueDate: twoHoursLater.toISOString(),
      });

      // Task 3: Critical priority, due today -> Score ~ 150 + 40 = 190
      const tCritical = await createTask(testUserId, {
        title: "T Critical",
        priority: "critical",
        dueDate: twoHoursLater.toISOString(),
      });

      const sorted = await listTasks(testUserId, {
        sortBy: "priority_score",
        sortDir: "desc",
      });

      expect(sorted.length).toBe(3);
      expect(sorted[0].id).toBe(tCritical.id);
      expect(sorted[1].id).toBe(tUrgent.id);
      expect(sorted[2].id).toBe(tLow.id);
      expect(sorted[0].priorityScore).toBeGreaterThan(sorted[1].priorityScore);
      expect(sorted[1].priorityScore).toBeGreaterThan(sorted[2].priorityScore);
    });
  });

  describe("Quick Capture Service Processing", () => {
    it("parses tokens, resolves project by name, and creates task", async () => {
      if (!probe.isAvailable) return;

      // Create a project to test automatic slug/name resolution
      const project = await createProject(testUserId, {
        name: "DeepWork",
        description: "Focus blocks",
      });

      const raw =
        "Complete quarterly architectural review !critical ^tomorrow @high #DeepWork ~90m +urgent +review";

      const captured = await quickCaptureTask(testUserId, { raw });

      expect(captured.title).toBe("Complete quarterly architectural review");
      expect(captured.priority).toBe("critical");
      expect(captured.energyLevel).toBe("high");
      expect(captured.projectId).toBe(project.id);
      expect(captured.estimatedDuration).toBe(90);
      expect(captured.tags).toContain("urgent");
      expect(captured.tags).toContain("review");
      expect(captured.dueDate).toBeTruthy();
    });
  });
});
