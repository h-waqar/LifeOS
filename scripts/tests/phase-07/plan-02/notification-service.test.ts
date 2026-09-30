import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user, notifications, userPreferences } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import {
  createNotification,
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
} from "@/server/notifications/service";
import { eventBus } from "@/server/events/event-bus";
import { AuthorizationError } from "@/server/auth/guard";

const probe: ProbeResult = await probeDatabase();

describe("Plan 07-02: Notification Service Unit & Integration Tests", () => {
  const testUser = {
    email: "p07_notif_service@example.com",
    password: "Plan07ServicePassword123!",
    name: "Notification Service Tester",
  };

  let testUserId: string;
  const otherUserId = "unauthorized_user_" + crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    if (!probe.isAvailable) return;

    const existingUsers = await db.select({ id: user.id }).from(user).limit(1);
    if (existingUsers.length > 0) {
      testUserId = existingUsers[0].id;
    } else {
      const res = await auth.api.signUpEmail({
        body: testUser,
        asResponse: true,
      });
      if (res.status === 200) {
        const [u] = await db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, testUser.email));
        testUserId = u.id;
      } else {
        const [u] = await db.select({ id: user.id }).from(user).limit(1);
        testUserId = u.id;
      }
    }
  });

  afterAll(async () => {
    if (probe?.isAvailable && testUserId) {
      await clearAllNotifications(testUserId);
      await closeDatabase();
    }
  });

  beforeEach(async () => {
    if (!probe?.isAvailable) return;
    await clearAllNotifications(testUserId);
    eventBus.clearSubscribers();
  });

  describe("Validation & Security Boundaries", () => {
    it("fails closed when authenticated userId is empty or whitespace", async () => {
      await expect(
        createNotification("", { title: "Test", message: "Test message" })
      ).rejects.toThrow(AuthorizationError);

      await expect(
        createNotification("   ", { title: "Test", message: "Test message" })
      ).rejects.toThrow(AuthorizationError);

      await expect(listNotifications("")).rejects.toThrow(AuthorizationError);
      await expect(getUnreadCount("")).rejects.toThrow(AuthorizationError);
      await expect(markAsRead("", "some-id")).rejects.toThrow(AuthorizationError);
      await expect(markAllAsRead("")).rejects.toThrow(AuthorizationError);
      await expect(deleteNotification("", "some-id")).rejects.toThrow(
        AuthorizationError
      );
    });

    it("rejects invalid input schema (empty title, empty message)", async () => {
      await expect(
        createNotification(testUserId, { title: "", message: "Hello" })
      ).rejects.toThrow();

      await expect(
        createNotification(testUserId, { title: "Title", message: "" })
      ).rejects.toThrow();
    });

    it("rejects client-injected userId, id, or isRead to preserve server ownership", async () => {
      await expect(
        createNotification(testUserId, {
          title: "Title",
          message: "Msg",
          // @ts-expect-error - testing schema strictness
          userId: otherUserId,
        })
      ).rejects.toThrow();

      await expect(
        createNotification(testUserId, {
          title: "Title",
          message: "Msg",
          // @ts-expect-error - testing schema strictness
          isRead: true,
        })
      ).rejects.toThrow();
    });

    it.skipIf(!probe.isAvailable)(
      "enforces database foreign key constraint: cannot create notification for non-existent user",
      async () => {
        await expect(
          createNotification(otherUserId, {
            title: "FK Test",
            message: "Should violate foreign key",
          })
        ).rejects.toThrow();
      }
    );
  });

  describe.skipIf(!probe.isAvailable)(
    "Notification Creation & Default Values",
    () => {
    it("creates a notification with default type 'info' and isRead false", async () => {
      const notif = await createNotification(testUserId, {
        title: "Daily Plan Ready",
        message: "Your morning daily plan is ready for review.",
      });

      expect(notif.id).toBeDefined();
      expect(notif.userId).toBe(testUserId);
      expect(notif.title).toBe("Daily Plan Ready");
      expect(notif.message).toBe("Your morning daily plan is ready for review.");
      expect(notif.type).toBe("info");
      expect(notif.isRead).toBe(false);
      expect(notif.readAt).toBeNull();
      expect(notif.createdAt).toBeDefined();
    });

    it("creates notifications with custom types, entity references, and links", async () => {
      const notif = await createNotification(testUserId, {
        title: "Overdue Task",
        message: "Task 'Tax Audit' is past due.",
        type: "warning",
        entityType: "task",
        entityId: "task-12345",
        linkUrl: "/tasks?id=task-12345",
        metadata: { priority: "high" },
      });

      expect(notif.type).toBe("warning");
      expect(notif.entityType).toBe("task");
      expect(notif.entityId).toBe("task-12345");
      expect(notif.linkUrl).toBe("/tasks?id=task-12345");
      expect(notif.metadata).toMatchObject({ priority: "high" });
    });
  });

  describe.skipIf(!probe.isAvailable)("Event Bus Integration", () => {
    it("publishes notification.created on the Event Bus when a notification is created", async () => {
      const receivedEvents: any[] = [];
      const unsub = eventBus.subscribe("notification.created", (e) => {
        receivedEvents.push(e);
      });

      const notif = await createNotification(testUserId, {
        title: "Event Bus Test",
        message: "Testing event emission",
      });

      await eventBus.drain();
      unsub();

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].name).toBe("notification.created");
      expect(receivedEvents[0].userId).toBe(testUserId);
      expect(receivedEvents[0].payload.notification.id).toBe(notif.id);
    });
  });

  describe.skipIf(!probe.isAvailable)(
    "Quiet Hours & Notification Eligibility Integration",
    () => {
    it("marks notification as silenced when user has quiet hours enabled and current time is in window", async () => {
      // Configure user preferences with quiet hours enabled (22:00 to 08:00 UTC)
      await db
        .insert(userPreferences)
        .values({
          userId: testUserId,
          quietHoursEnabled: true,
          quietHoursStart: "22:00",
          quietHoursEnd: "08:00",
          timezone: "UTC",
        })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: {
            quietHoursEnabled: true,
            quietHoursStart: "22:00",
            quietHoursEnd: "08:00",
            timezone: "UTC",
          },
        });

      // Reference date: 23:30 UTC (during quiet hours)
      const quietDate = new Date("2026-09-23T23:30:00Z");

      const notif = await createNotification(
        testUserId,
        {
          title: "Late Reminder",
          message: "Do not forget to stretch.",
          type: "reminder",
        },
        { atDate: quietDate }
      );

      expect(notif.metadata.duringQuietHours).toBe(true);
      expect(notif.metadata.silenced).toBe(true);
      expect(notif.metadata.eligibilityReason).toBe("quiet_hours_active");
    });

    it("allows urgent/error notifications to bypass quiet hours during active window", async () => {
      const quietDate = new Date("2026-09-23T23:30:00Z");

      // Error alert
      const errorNotif = await createNotification(
        testUserId,
        {
          title: "Sync Error",
          message: "Google Calendar sync failed.",
          type: "error",
        },
        { atDate: quietDate }
      );

      expect(errorNotif.metadata.duringQuietHours).toBe(true);
      expect(errorNotif.metadata.silenced).toBe(false);
      expect(errorNotif.metadata.eligibilityReason).toBe("urgent_bypass");

      // Explicit urgent bypass
      const urgentNotif = await createNotification(
        testUserId,
        {
          title: "Critical Budget Exceeded",
          message: "Budget exceeded by 150%",
          type: "warning",
          urgent: true,
        },
        { atDate: quietDate }
      );

      expect(urgentNotif.metadata.duringQuietHours).toBe(true);
      expect(urgentNotif.metadata.silenced).toBe(false);
      expect(urgentNotif.metadata.eligibilityReason).toBe("urgent_bypass");
    });
  });

  describe.skipIf(!probe.isAvailable)(
    "Read / Unread Lifecycle & Counts",
    () => {
    it("accurately tracks unread counts and transitions", async () => {
      expect(await getUnreadCount(testUserId)).toBe(0);

      const n1 = await createNotification(testUserId, {
        title: "N1",
        message: "Message 1",
      });
      const n2 = await createNotification(testUserId, {
        title: "N2",
        message: "Message 2",
      });
      const n3 = await createNotification(testUserId, {
        title: "N3",
        message: "Message 3",
      });

      expect(await getUnreadCount(testUserId)).toBe(3);

      // Mark single notification as read
      const updatedN1 = await markAsRead(testUserId, n1.id);
      expect(updatedN1).not.toBeNull();
      expect(updatedN1?.isRead).toBe(true);
      expect(updatedN1?.readAt).toBeDefined();

      expect(await getUnreadCount(testUserId)).toBe(2);

      // Mark all remaining notifications as read
      const batchResult = await markAllAsRead(testUserId);
      expect(batchResult.count).toBe(2);

      expect(await getUnreadCount(testUserId)).toBe(0);
    });

    it("supports pagination and unreadOnly filter in listNotifications", async () => {
      // Create 5 notifications
      for (let i = 1; i <= 5; i++) {
        await createNotification(testUserId, {
          title: `Item ${i}`,
          message: `Content ${i}`,
        });
      }

      // Read 2 of them
      const listBefore = await listNotifications(testUserId, { limit: 10 });
      expect(listBefore.total).toBe(5);
      expect(listBefore.unreadCount).toBe(5);

      await markAsRead(testUserId, listBefore.notifications[0].id);
      await markAsRead(testUserId, listBefore.notifications[1].id);

      // Query with unreadOnly: true
      const unreadOnlyList = await listNotifications(testUserId, {
        unreadOnly: true,
      });
      expect(unreadOnlyList.notifications.length).toBe(3);
      expect(unreadOnlyList.total).toBe(3);
      expect(unreadOnlyList.unreadCount).toBe(3);

      // Query with pagination limit: 2, offset: 1
      const paginated = await listNotifications(testUserId, {
        limit: 2,
        offset: 1,
      });
      expect(paginated.notifications.length).toBe(2);
      expect(paginated.total).toBe(5);
    });
  });

  describe.skipIf(!probe.isAvailable)("Multi-Tenant Isolation", () => {
    it("prevents cross-user notification reading, counting, updating, and deletion", async () => {
      // Create notification for testUser
      const notif = await createNotification(testUserId, {
        title: "Owner Notification",
        message: "Only owner can access this",
      });

      // Another user queries notifications -> sees empty
      const otherList = await listNotifications(otherUserId);
      expect(otherList.notifications.length).toBe(0);
      expect(otherList.total).toBe(0);
      expect(otherList.unreadCount).toBe(0);

      // Another user unread count is 0
      expect(await getUnreadCount(otherUserId)).toBe(0);

      // Another user attempts to mark testUser's notification as read
      const markCrossUser = await markAsRead(otherUserId, notif.id);
      expect(markCrossUser).toBeNull();

      // Verify notification remains unread for owner
      expect(await getUnreadCount(testUserId)).toBe(1);

      // Another user attempts to delete testUser's notification
      const deleteCrossUser = await deleteNotification(otherUserId, notif.id);
      expect(deleteCrossUser).toBe(false);

      // Verify owner's notification still exists
      const ownerList = await listNotifications(testUserId);
      expect(ownerList.notifications.length).toBe(1);
    });

    it("deleting a notification removes it from the user's list", async () => {
      const notif = await createNotification(testUserId, {
        title: "To Delete",
        message: "Will be removed",
      });

      const deleted = await deleteNotification(testUserId, notif.id);
      expect(deleted).toBe(true);

      const list = await listNotifications(testUserId);
      expect(list.notifications.find((n) => n.id === notif.id)).toBeUndefined();
    });
  });
});
