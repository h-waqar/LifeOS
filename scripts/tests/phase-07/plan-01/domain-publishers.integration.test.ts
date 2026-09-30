// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import {
  tasks,
  projects,
  goals,
  habits,
  habitEntries,
  contentItems,
  aiConversations,
  aiActions,
  auditLog,
  accounts,
} from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq, and, desc } from "drizzle-orm";
import {
  eventBus,
  createDomainEvent,
  type DomainEvent,
  type AnyDomainEvent,
  RecursionLimitError,
} from "@/server/events";
import { createTask, updateTask, deleteTask } from "@/server/tasks/service";
import { createProject, updateProject } from "@/server/projects/service";
import { createGoal, updateGoal, recalculateGoalProgress } from "@/server/goals/service";
import { createHabit, logHabitEntry } from "@/server/habits/service";
import { createAccount } from "@/server/finance/account-service";
import { createTransaction } from "@/server/finance/transaction-service";
import { createContentItem, transitionContentStatus } from "@/server/content/service";
import { getToolById } from "@/server/ai/tools/registry";
import { interceptToolCall, rejectAction } from "@/server/ai/hitl/gate-service";
import { confirmAndExecuteAction } from "@/server/ai/hitl/action-executor";

const probe: ProbeResult = await probeDatabase();

describe.skipIf(!probe.isAvailable)("Phase 7 Plan 07-01: Domain Event Publishers (Integration)", () => {
  const testUser = {
    email: "p07_domain_publishers@example.com",
    password: "Plan07PublishersPassword123!",
    name: "Domain Publishers Tester",
  };

  let testUserId: string;
  let testAccountId: string;

  beforeAll(async () => {
    if (!probe.isAvailable) return;

    // Reset database to ensure clean test state
    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUser,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = u.id;

    // Create a default finance account for transaction tests
    const account = await createAccount(testUserId, {
      name: "Main Checking",
      accountType: "checking",
      currency: "USD",
      initialBalance: 1000,
    });
    testAccountId = account.id;
  });

  afterAll(async () => {
    eventBus.clearSubscribers();
    await closeDatabase();
  });

  beforeEach(() => {
    eventBus.clearSubscribers();
  });

  describe("Task Domain Events", () => {
    it("publishes task.created upon successful task creation", async () => {
      const received: DomainEvent<"task.created">[] = [];
      eventBus.subscribe("task.created", (ev) => {
        received.push(ev);
      });

      const task = await createTask(testUserId, {
        title: "Integration Test Task",
        priority: "high",
      });
      await eventBus.drain();

      expect(received).toHaveLength(1);
      const ev = received[0];
      expect(ev.name).toBe("task.created");
      expect(ev.userId).toBe(testUserId);
      expect(ev.payload.task.id).toBe(task.id);
      expect(ev.payload.task.title).toBe("Integration Test Task");
      expect(ev.metadata?.depth).toBe(0);
      expect(ev.metadata?.correlationId).toBeDefined();
    });

    it("publishes task.updated and task.completed when marking task completed", async () => {
      const task = await createTask(testUserId, {
        title: "Task To Complete",
      });

      const updatedEvents: DomainEvent<"task.updated">[] = [];
      const completedEvents: DomainEvent<"task.completed">[] = [];

      eventBus.subscribe("task.updated", (ev) => {
        updatedEvents.push(ev);
      });
      eventBus.subscribe("task.completed", (ev) => {
        completedEvents.push(ev);
      });

      await updateTask(testUserId, task.id, {
        status: "completed",
      });
      await eventBus.drain();

      expect(updatedEvents.length).toBeGreaterThanOrEqual(1);
      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0].payload.task.id).toBe(task.id);
      expect(completedEvents[0].payload.task.status).toBe("completed");
      expect(completedEvents[0].payload.completedAt).toBeDefined();
    });

    it("publishes project.all_tasks_completed when last task of a project is completed", async () => {
      const project = await createProject(testUserId, {
        name: "Project With Tasks",
      });

      const task1 = await createTask(testUserId, {
        title: "Subtask 1",
        projectId: project.id,
      });

      // Complete the task
      const allCompletedEvents: DomainEvent<"project.all_tasks_completed">[] = [];
      eventBus.subscribe("project.all_tasks_completed", (ev) => {
        allCompletedEvents.push(ev);
      });

      await updateTask(testUserId, task1.id, {
        status: "completed",
      });
      await eventBus.drain();

      expect(allCompletedEvents).toHaveLength(1);
      expect(allCompletedEvents[0].payload.project.id).toBe(project.id);
    });

    it("publishes task.deleted when task is deleted", async () => {
      const task = await createTask(testUserId, {
        title: "Task to delete",
      });

      const deletedEvents: DomainEvent<"task.deleted">[] = [];
      eventBus.subscribe("task.deleted", (ev) => {
        deletedEvents.push(ev);
      });

      await deleteTask(testUserId, task.id);
      await eventBus.drain();

      expect(deletedEvents).toHaveLength(1);
      expect(deletedEvents[0].payload.taskId).toBe(task.id);
    });
  });

  describe("Project Domain Events", () => {
    it("publishes project.created upon project creation", async () => {
      const received: DomainEvent<"project.created">[] = [];
      eventBus.subscribe("project.created", (ev) => {
        received.push(ev);
      });

      const project = await createProject(testUserId, {
        name: "Alpha Project",
        area: "career",
      });
      await eventBus.drain();

      expect(received).toHaveLength(1);
      expect(received[0].payload.project.id).toBe(project.id);
      expect(received[0].payload.project.name).toBe("Alpha Project");
    });

    it("publishes project.completed when project status is set to completed", async () => {
      const project = await createProject(testUserId, {
        name: "Beta Project",
      });

      const completedEvents: DomainEvent<"project.completed">[] = [];
      eventBus.subscribe("project.completed", (ev) => {
        completedEvents.push(ev);
      });

      await updateProject(testUserId, project.id, {
        status: "completed",
      });
      await eventBus.drain();

      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0].payload.project.id).toBe(project.id);
      expect(completedEvents[0].payload.project.status).toBe("completed");
    });
  });

  describe("Goal Domain Events", () => {
    it("publishes goal.created upon goal creation", async () => {
      const received: DomainEvent<"goal.created">[] = [];
      eventBus.subscribe("goal.created", (ev) => {
        received.push(ev);
      });

      const goal = await createGoal(testUserId, {
        title: "Read 12 Books",
        horizon: "medium_term",
        metricType: "numeric",
        targetValue: 12,
      });
      await eventBus.drain();

      expect(received).toHaveLength(1);
      expect(received[0].payload.goal.id).toBe(goal.id);
      expect(received[0].payload.goal.title).toBe("Read 12 Books");
    });

    it("publishes goal.progress_updated when goal progress changes", async () => {
      const goal = await createGoal(testUserId, {
        title: "Complete 2 Milestones",
        horizon: "medium_term",
        metricType: "numeric",
        targetValue: 2,
      });

      // Link a task to the goal
      const task = await createTask(testUserId, {
        title: "Goal Task 1",
        goalId: goal.id,
      });

      const progressEvents: DomainEvent<"goal.progress_updated">[] = [];
      eventBus.subscribe("goal.progress_updated", (ev) => {
        progressEvents.push(ev);
      });

      // Complete the task which triggers progress recalculation
      await updateTask(testUserId, task.id, {
        status: "completed",
      });
      await eventBus.drain();

      expect(progressEvents.length).toBeGreaterThanOrEqual(1);
      const match = progressEvents.find((e) => e.payload.goal.id === goal.id);
      expect(match).toBeDefined();
      expect(match!.payload.currentProgress).toBe(50);
    });

    it("publishes goal.completed when goal status becomes completed", async () => {
      const goal = await createGoal(testUserId, {
        title: "Finish Marathon",
        horizon: "long_term",
      });

      const completedEvents: DomainEvent<"goal.completed">[] = [];
      eventBus.subscribe("goal.completed", (ev) => {
        completedEvents.push(ev);
      });

      await updateGoal(testUserId, goal.id, {
        status: "completed",
      });
      await eventBus.drain();

      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0].payload.goal.id).toBe(goal.id);
      expect(completedEvents[0].payload.goal.status).toBe("completed");
    });
  });

  describe("Habit Domain Events", () => {
    it("publishes habit.logged on habit entry creation", async () => {
      const habit = await createHabit(testUserId, {
        title: "Daily Meditation",
        frequency: "daily",
      });

      const loggedEvents: DomainEvent<"habit.logged">[] = [];
      eventBus.subscribe("habit.logged", (ev) => {
        loggedEvents.push(ev);
      });

      await logHabitEntry(testUserId, habit.id, {
        date: "2026-09-23",
        value: 1,
      });
      await eventBus.drain();

      expect(loggedEvents).toHaveLength(1);
      expect(loggedEvents[0].payload.habit.id).toBe(habit.id);
      expect(loggedEvents[0].payload.entry.date).toBe("2026-09-23");
      expect(loggedEvents[0].payload.streak).toBeGreaterThanOrEqual(1);
    });

    it("publishes habit.streak_milestone when streak reaches a milestone", async () => {
      const habit = await createHabit(testUserId, {
        title: "Morning Jog",
        frequency: "daily",
      });

      const milestoneEvents: DomainEvent<"habit.streak_milestone">[] = [];
      eventBus.subscribe("habit.streak_milestone", (ev) => {
        milestoneEvents.push(ev);
      });

      // Log 3 consecutive days to hit milestone 3
      await logHabitEntry(testUserId, habit.id, { date: "2026-09-21", value: 1 });
      await logHabitEntry(testUserId, habit.id, { date: "2026-09-22", value: 1 });
      await logHabitEntry(testUserId, habit.id, { date: "2026-09-23", value: 1 });
      await eventBus.drain();

      expect(milestoneEvents.length).toBeGreaterThanOrEqual(1);
      const match = milestoneEvents.find((e) => e.payload.streak === 3);
      expect(match).toBeDefined();
      expect(match!.payload.habit.id).toBe(habit.id);
    });
  });

  describe("Finance Domain Events", () => {
    it("publishes finance.transaction_created on new transaction", async () => {
      const received: DomainEvent<"finance.transaction_created">[] = [];
      eventBus.subscribe("finance.transaction_created", (ev) => {
        received.push(ev);
      });

      const tx = await createTransaction(testUserId, {
        accountId: testAccountId,
        amount: 45.5,
        transactionType: "expense",
        date: new Date(),
        description: "Coffee & Lunch",
      });
      await eventBus.drain();

      expect(received).toHaveLength(1);
      expect(received[0].payload.transaction.id).toBe(tx.id);
      expect(received[0].payload.transaction.accountId).toBe(testAccountId);
      expect(Number(received[0].payload.transaction.amount)).toBe(45.5);
    });
  });

  describe("Content Domain Events", () => {
    it("publishes content.status_changed and content.published on transitions", async () => {
      const item = await createContentItem(testUserId, {
        title: "Building an Event Bus",
        contentType: "article",
        status: "draft",
      });

      const statusChangedEvents: DomainEvent<"content.status_changed">[] = [];
      const publishedEvents: DomainEvent<"content.published">[] = [];

      eventBus.subscribe("content.status_changed", (ev) => {
        statusChangedEvents.push(ev);
      });
      eventBus.subscribe("content.published", (ev) => {
        publishedEvents.push(ev);
      });

      // Transition draft -> in_review
      await transitionContentStatus(testUserId, item.id, "in_review");
      await eventBus.drain();

      expect(statusChangedEvents).toHaveLength(1);
      expect(statusChangedEvents[0].payload.previousStatus).toBe("draft");
      expect(statusChangedEvents[0].payload.newStatus).toBe("in_review");
      expect(publishedEvents).toHaveLength(0);

      // Transition in_review -> published
      await transitionContentStatus(testUserId, item.id, "published");
      await eventBus.drain();

      expect(statusChangedEvents).toHaveLength(2);
      expect(statusChangedEvents[1].payload.previousStatus).toBe("in_review");
      expect(statusChangedEvents[1].payload.newStatus).toBe("published");

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].payload.content.id).toBe(item.id);
      expect(publishedEvents[0].payload.publishedAt).toBeDefined();
    });
  });

  describe("AI Domain Events", () => {
    it("publishes ai.action_confirmed when HITL action is confirmed", async () => {
      const tool = getToolById("tasks_complete");
      expect(tool).toBeDefined();

      const task = await createTask(testUserId, { title: "Task to complete via AI" });

      const intercepted = await interceptToolCall(
        { userId: testUserId },
        tool!,
        { taskId: task.id }
      );
      expect(intercepted.isPending).toBe(true);

      const confirmedEvents: DomainEvent<"ai.action_confirmed">[] = [];
      eventBus.subscribe("ai.action_confirmed", (ev) => {
        confirmedEvents.push(ev);
      });

      await confirmAndExecuteAction(testUserId, intercepted.actionId!);
      await eventBus.drain();

      expect(confirmedEvents).toHaveLength(1);
      expect(confirmedEvents[0].payload.actionId).toBe(intercepted.actionId);
      expect(confirmedEvents[0].payload.toolName).toBe("tasks_complete");
      expect(confirmedEvents[0].payload.parameters).toEqual({ taskId: task.id });
    });

    it("publishes ai.action_rejected when HITL action is rejected", async () => {
      const tool = getToolById("tasks_complete");
      expect(tool).toBeDefined();

      const task = await createTask(testUserId, { title: "Task not to complete" });

      const intercepted = await interceptToolCall(
        { userId: testUserId },
        tool!,
        { taskId: task.id }
      );
      expect(intercepted.isPending).toBe(true);

      const rejectedEvents: DomainEvent<"ai.action_rejected">[] = [];
      eventBus.subscribe("ai.action_rejected", (ev) => {
        rejectedEvents.push(ev);
      });

      await rejectAction(testUserId, intercepted.actionId!, "User rejected the operation");
      await eventBus.drain();

      expect(rejectedEvents).toHaveLength(1);
      expect(rejectedEvents[0].payload.actionId).toBe(intercepted.actionId);
      expect(rejectedEvents[0].payload.toolName).toBe("tasks_complete");
      expect(rejectedEvents[0].payload.reason).toBe("User rejected the operation");
    });
  });

  describe("Zero Phantom Events & Transaction Rollback", () => {
    it("never emits events if transaction fails or rolls back", async () => {
      const received: AnyDomainEvent[] = [];
      eventBus.subscribeAll((ev) => {
        received.push(ev);
      });

      const pendingEvents: AnyDomainEvent[] = [];

      try {
        await db.transaction(async (tx) => {
          (tx as any).__pendingEvents = pendingEvents;

          pendingEvents.push(
            createDomainEvent("task.created", testUserId, {
              task: {
                id: "phantom-task",
                userId: testUserId,
                title: "Phantom Task",
                status: "todo",
                priority: "medium",
                priorityScore: 50,
                projectId: null,
                parentTaskId: null,
                milestoneId: null,
                description: null,
                scheduledDate: null,
                energyLevel: null,
                recurrenceRule: null,
                goalId: null,
                habitId: null,
                noteId: null,
                personId: null,
                tags: [],
                dueDate: null,
                estimatedDuration: null,
                actualDuration: null,
                completedAt: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            })
          );

          // Force a transaction failure
          throw new Error("Simulated rollback error");
        });
      } catch (err: any) {
        expect(err.message).toBe("Simulated rollback error");
      }

      await eventBus.drain();
      expect(received).toHaveLength(0);
    });
  });

  describe("Subscriber Error Containment", () => {
    it("does not crash or rollback domain mutation when subscriber throws", async () => {
      // Register a rogue subscriber that throws
      eventBus.subscribe("task.created", () => {
        throw new Error("Exploding subscriber failure");
      });

      // The mutation must succeed despite the subscriber failure
      const created = await createTask(testUserId, {
        title: "Resilient Task Creation",
      });
      await eventBus.drain();

      expect(created.id).toBeDefined();
      expect(created.title).toBe("Resilient Task Creation");

      // Verify the task exists in the database
      const [inDb] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, testUserId), eq(tasks.id, created.id)));
      expect(inDb).toBeDefined();
      expect(inDb.title).toBe("Resilient Task Creation");
    });
  });

  describe("Recursion Limit & Cascade Defense", () => {
    it("stops infinite cascades at depth 3 and writes audit log", async () => {
      let depthReached = 0;

      // Event chain that increments depth
      eventBus.subscribe("system.morning_routine_due", async (ev) => {
        depthReached = ev.metadata?.depth ?? 0;
        // Trigger next event in chain with depth increment
        await eventBus.publish(
          createDomainEvent(
            "system.morning_routine_due",
            testUserId,
            { userId: testUserId, date: "2026-09-23", targetHour: "08:00" },
            {
              correlationId: ev.metadata?.correlationId,
              depth: (ev.metadata?.depth ?? 1) + 1,
            }
          )
        );
      });

      // Seed event at depth 1
      const seedEvent = createDomainEvent("system.morning_routine_due", testUserId, {
        userId: testUserId,
        date: "2026-09-23",
        targetHour: "08:00",
      });

      await eventBus.publish(seedEvent);
      await eventBus.drain();

      expect(depthReached).toBe(2);

      // Check audit log for recursion limit exceeded
      const [auditEntry] = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.userId, testUserId),
            eq(auditLog.action, "system.recursion_limit_exceeded")
          )
        )
        .orderBy(desc(auditLog.createdAt))
        .limit(1);

      expect(auditEntry).toBeDefined();
      expect(auditEntry.action).toBe("system.recursion_limit_exceeded");
      expect((auditEntry.details as any)?.depth).toBe(3);
    });
  });
});
