import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  EventBus,
  eventBus,
  MAX_EVENT_DEPTH,
  createDomainEvent,
  RecursionLimitError,
  InvalidEventError,
  type DomainEvent,
  type AnyDomainEvent,
} from "@/server/events";
import * as auditModule from "@/server/audit";

describe("Plan 07-01: EventBus Unit Tests", () => {
  let bus: EventBus;
  let auditSpy: any;

  beforeEach(() => {
    bus = new EventBus();
    auditSpy = vi
      .spyOn(auditModule, "createAuditLog")
      .mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    bus.clearSubscribers();
    vi.restoreAllMocks();
  });

  describe("Subscription & Topic Routing", () => {
    it("subscribes and receives matching events", async () => {
      const received: DomainEvent<"task.created">[] = [];
      bus.subscribe("task.created", (event) => {
        received.push(event);
      });

      const event = createDomainEvent("task.created", "user-123", {
        task: {
          id: "task-1",
          userId: "user-123",
          title: "Test Task",
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
      });

      await bus.publish(event);

      expect(received).toHaveLength(1);
      expect(received[0].name).toBe("task.created");
      expect(received[0].payload.task.title).toBe("Test Task");
      expect(received[0].userId).toBe("user-123");
    });

    it("does not receive non-matching event topics", async () => {
      const taskEvents: any[] = [];
      const goalEvents: any[] = [];

      bus.subscribe("task.created", (event) => {
        taskEvents.push(event);
      });
      bus.subscribe("goal.created", (event) => {
        goalEvents.push(event);
      });

      const event = createDomainEvent("task.created", "user-123", {
        task: {
          id: "task-1",
          userId: "user-123",
          title: "Test Task",
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
      });

      await bus.publish(event);

      expect(taskEvents).toHaveLength(1);
      expect(goalEvents).toHaveLength(0);
    });

    it("wildcard subscriber receives all domain events", async () => {
      const received: AnyDomainEvent[] = [];
      bus.subscribeAll((event) => {
        received.push(event);
      });

      const taskEvent = createDomainEvent("task.deleted", "user-123", {
        taskId: "task-1",
      });
      const goalEvent = createDomainEvent("goal.stagnant", "user-123", {
        goal: {
          id: "goal-1",
          userId: "user-123",
          title: "Goal 1",
          description: null,
          horizon: "medium_term",
          area: "career",
          status: "in_progress",
          priority: "high",
          metricType: "none",
          targetValue: null,
          currentValue: null,
          unit: null,
          startDate: null,
          targetDate: null,
          parentGoalId: null,
          progress: 20,
          completedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        daysWithoutProgress: 14,
      });

      await bus.publish(taskEvent);
      await bus.publish(goalEvent);

      expect(received).toHaveLength(2);
      expect(received[0].name).toBe("task.deleted");
      expect(received[1].name).toBe("goal.stagnant");
    });
  });

  describe("Concurrency & Multiple Subscribers", () => {
    it("dispatches to multiple topic and wildcard subscribers concurrently", async () => {
      const order: string[] = [];

      bus.subscribe("finance.budget_exceeded", async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push("subscriber-1");
      });

      bus.subscribe("finance.budget_exceeded", async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push("subscriber-2");
      });

      bus.subscribeAll(async () => {
        await new Promise((r) => setTimeout(r, 15));
        order.push("wildcard");
      });

      const event = createDomainEvent("finance.budget_exceeded", "user-123", {
        categoryId: "cat-1",
        budgetAmount: 1000,
        spentAmount: 1200,
      });

      await bus.publish(event);

      expect(order).toHaveLength(3);
      // Because subscriber-2 has shorter delay (10ms) than wildcard (15ms) and subscriber-1 (20ms),
      // concurrent execution finishes in order of resolution
      expect(order).toEqual(["subscriber-2", "wildcard", "subscriber-1"]);
    });
  });

  describe("Error Boundary & Failure Isolation", () => {
    it("isolates subscriber errors: failing subscriber does not throw or prevent other subscribers", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      let healthySubscriberExecuted = false;

      bus.subscribe("task.completed", async () => {
        throw new Error("Catastrophic downstream failure in notification delivery");
      });

      bus.subscribe("task.completed", async () => {
        healthySubscriberExecuted = true;
      });

      const event = createDomainEvent("task.completed", "user-123", {
        task: {
          id: "task-1",
          userId: "user-123",
          title: "Completed Task",
          status: "completed",
          priority: "high",
          priorityScore: 80,
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
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        completedAt: new Date().toISOString(),
      });

      // publish MUST NOT throw
      await expect(bus.publish(event)).resolves.toBeUndefined();

      expect(healthySubscriberExecuted).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("Recursion & Cascade Depth Guard", () => {
    it("rejects publication and logs audit warning when depth >= MAX_EVENT_DEPTH (3)", async () => {
      const event = createDomainEvent(
        "task.created",
        "user-123",
        {
          task: {
            id: "task-cycle",
            userId: "user-123",
            title: "Cycle Task",
            status: "todo",
            priority: "low",
            priorityScore: 10,
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
        },
        { depth: 3, correlationId: "corr-123" }
      );

      await expect(bus.publish(event)).rejects.toThrow(RecursionLimitError);

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-123",
          category: "security",
          action: "system.recursion_limit_exceeded",
          status: "failure",
          details: expect.objectContaining({
            eventName: "task.created",
            depth: 3,
            maxDepth: MAX_EVENT_DEPTH,
            correlationId: "corr-123",
          }),
        })
      );
    });

    it("allows publication when depth < MAX_EVENT_DEPTH (e.g. depth 0, 1, 2)", async () => {
      const received: number[] = [];

      bus.subscribe("habit.streak_milestone", (ev) => {
        received.push(ev.metadata?.depth ?? 0);
      });

      for (let d = 0; d < 3; d++) {
        const event = createDomainEvent(
          "habit.streak_milestone",
          "user-123",
          {
            habit: {
              id: "h-1",
              userId: "user-123",
              title: "Read",
              description: null,
              frequency: "daily",
              frequencyTarget: 1,
              frequencyDays: [],
              intervalDays: 1,
              targetValue: 1,
              unit: "pages",
              timeOfDay: "morning",
              reminderTime: null,
              goalId: null,
              identityStatement: null,
              status: "active",
              currentStreak: 7,
              longestStreak: 14,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            streak: 7,
          },
          { depth: d }
        );

        await expect(bus.publish(event)).resolves.toBeUndefined();
      }

      expect(received).toEqual([0, 1, 2]);
      expect(auditSpy).not.toHaveBeenCalled();
    });
  });

  describe("Unsubscribe & Teardown Lifecycle", () => {
    it("stops delivering events when unsubscribe is invoked", async () => {
      let count = 0;
      const unsubscribe = bus.subscribe("project.completed", () => {
        count++;
      });

      const event = createDomainEvent("project.completed", "user-123", {
        project: {
          id: "proj-1",
          userId: "user-123",
          name: "Launch V1",
          description: null,
          area: "career",
          status: "completed",
          priority: "high",
          startDate: null,
          deadline: null,
          goalId: null,
          progress: 100,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        completedAt: new Date().toISOString(),
      });

      await bus.publish(event);
      expect(count).toBe(1);

      unsubscribe();

      await bus.publish(event);
      expect(count).toBe(1); // Not called again
    });

    it("unsubscribing is idempotent and does not error on multiple calls", () => {
      const unsub = bus.subscribe("ai.action_rejected", () => {});
      expect(() => {
        unsub();
        unsub();
        unsub();
      }).not.toThrow();
    });

    it("clearSubscribers removes all topic and wildcard subscriptions", async () => {
      bus.subscribe("task.created", () => {});
      bus.subscribeAll(() => {});

      expect(bus.listenerCount("task.created")).toBe(2);

      bus.clearSubscribers();

      expect(bus.listenerCount("task.created")).toBe(0);
      expect(bus.listenerCount()).toBe(0);
    });
  });

  describe("Input Validation & Invariants", () => {
    it("rejects non-object or missing event", async () => {
      await expect(bus.publish(null as any)).rejects.toThrow(InvalidEventError);
      await expect(bus.publish(undefined as any)).rejects.toThrow(InvalidEventError);
    });

    it("rejects event with missing or empty name", async () => {
      await expect(
        bus.publish({ userId: "u-1", payload: {} } as any)
      ).rejects.toThrow(InvalidEventError);
      await expect(
        bus.publish({ name: "", userId: "u-1", payload: {} } as any)
      ).rejects.toThrow(InvalidEventError);
    });

    it("rejects event with missing or empty userId", async () => {
      await expect(
        bus.publish({ name: "task.created", userId: "", payload: {} } as any)
      ).rejects.toThrow(InvalidEventError);
      await expect(
        bus.publish({ name: "task.created", userId: "   ", payload: {} } as any)
      ).rejects.toThrow(InvalidEventError);
      await expect(
        bus.publish({ name: "task.created", payload: {} } as any)
      ).rejects.toThrow(InvalidEventError);
    });

    it("auto-populates id and timestamp if omitted", async () => {
      let captured: any = null;
      bus.subscribe("system.morning_routine_due", (ev) => {
        captured = ev;
      });

      const rawEvent = {
        name: "system.morning_routine_due" as const,
        userId: "user-999",
        payload: {
          userId: "user-999",
          date: "2026-09-23",
          targetHour: "08:00",
        },
      };

      await bus.publish(rawEvent as any);

      expect(captured).not.toBeNull();
      expect(captured.id).toBeDefined();
      expect(captured.timestamp).toBeDefined();
      expect(captured.userId).toBe("user-999");
    });
  });

  describe("Drain Helper", () => {
    it("waits for active background publish operations to settle", async () => {
      let resolved = false;
      bus.subscribe("content.published", async () => {
        await new Promise((r) => setTimeout(r, 20));
        resolved = true;
      });

      const event = createDomainEvent("content.published", "user-123", {
        content: {
          id: "content-1",
          userId: "user-123",
          title: "My Article",
          contentType: "article",
          topic: "Tech",
          targetAudience: "Developers",
          primaryPlatform: "blog",
          targetChannels: ["blog"],
          tags: [],
          status: "published",
          scheduledAt: null,
          publishedAt: new Date().toISOString(),
          projectId: null,
          goalId: null,
          noteId: null,
          summary: null,
          mediaUrls: [],
          isArchived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        publishedAt: new Date().toISOString(),
      });

      void bus.publish(event);
      expect(resolved).toBe(false);

      await bus.drain();
      expect(resolved).toBe(true);
    });
  });

  describe("Singleton Instance", () => {
    it("exports a global singleton eventBus instance", () => {
      expect(eventBus).toBeInstanceOf(EventBus);
    });
  });
});
