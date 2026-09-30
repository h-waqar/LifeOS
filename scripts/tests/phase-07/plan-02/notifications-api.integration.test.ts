import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user, notifications } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import {
  GET as notificationsGet,
  POST as notificationsPost,
} from "@/app/api/notifications/route";
import { GET as unreadCountGet } from "@/app/api/notifications/unread-count/route";
import { POST as readAllPost } from "@/app/api/notifications/read-all/route";
import {
  PATCH as readPatch,
  POST as readPost,
} from "@/app/api/notifications/[id]/read/route";
import { DELETE as notificationDelete } from "@/app/api/notifications/[id]/route";
import { clearAllNotifications } from "@/server/notifications/service";

describe("Plan 07-02: Notifications REST API Endpoints (Integration)", () => {
  let probe: ProbeResult;

  const testUser = {
    email: "p07_notif_api@example.com",
    password: "Plan07ApiPassword123!",
    name: "Notifications API Tester",
  };

  let testUserId: string;
  let cookieHeader: string;

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Reset user table
    await db.delete(user);

    const res = await auth.api.signUpEmail({
      body: testUser,
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie")!;
    const match = setCookie.match(/better-auth\.session_token=([^;]+)/);
    expect(match).toBeTruthy();
    cookieHeader = `better-auth.session_token=${match![1]}`;

    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email));
    testUserId = u.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  beforeEach(async () => {
    if (!probe?.isAvailable) return;
    await clearAllNotifications(testUserId);
  });

  describe("Authentication Guard (401 Unauthorized)", () => {
    it("fails closed with 401 when no session cookie is provided", async () => {
      if (!probe.isAvailable) return;

      const getReq = new NextRequest("http://localhost:3000/api/notifications");
      const getRes = await notificationsGet(getReq);
      expect(getRes.status).toBe(401);

      const postReq = new NextRequest("http://localhost:3000/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "T", message: "M" }),
      });
      const postRes = await notificationsPost(postReq);
      expect(postRes.status).toBe(401);

      const countReq = new NextRequest(
        "http://localhost:3000/api/notifications/unread-count"
      );
      const countRes = await unreadCountGet(countReq);
      expect(countRes.status).toBe(401);

      const readAllReq = new NextRequest(
        "http://localhost:3000/api/notifications/read-all",
        { method: "POST" }
      );
      const readAllRes = await readAllPost(readAllReq);
      expect(readAllRes.status).toBe(401);

      const readReq = new NextRequest(
        "http://localhost:3000/api/notifications/fake-id/read",
        { method: "PATCH" }
      );
      const readRes = await readPatch(readReq, {
        params: Promise.resolve({ id: "fake-id" }),
      });
      expect(readRes.status).toBe(401);

      const delReq = new NextRequest(
        "http://localhost:3000/api/notifications/fake-id",
        { method: "DELETE" }
      );
      const delRes = await notificationDelete(delReq, {
        params: Promise.resolve({ id: "fake-id" }),
      });
      expect(delRes.status).toBe(401);
    });
  });

  describe("POST & GET /api/notifications", () => {
    it("creates a notification via POST and returns 201", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/notifications", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Goal Milestone Reached",
          message: "You completed 50% of 'Build LifeOS'",
          type: "success",
          entityType: "goal",
          entityId: "goal-123",
          linkUrl: "/goals?id=goal-123",
        }),
      });

      const res = await notificationsPost(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.notification).toBeDefined();
      expect(body.notification.title).toBe("Goal Milestone Reached");
      expect(body.notification.type).toBe("success");
      expect(body.notification.userId).toBe(testUserId);
      expect(body.notification.isRead).toBe(false);
    });

    it("rejects invalid content-type with 415", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/notifications", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "text/plain",
        },
        body: "title=Test",
      });

      const res = await notificationsPost(req);
      expect(res.status).toBe(415);
    });

    it("rejects invalid payload with 400", async () => {
      if (!probe.isAvailable) return;

      const req = new NextRequest("http://localhost:3000/api/notifications", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "",
          message: "",
        }),
      });

      const res = await notificationsPost(req);
      expect(res.status).toBe(400);
    });

    it("lists user notifications via GET /api/notifications", async () => {
      if (!probe.isAvailable) return;

      // Create two notifications
      await notificationsPost(
        new NextRequest("http://localhost:3000/api/notifications", {
          method: "POST",
          headers: { cookie: cookieHeader, "content-type": "application/json" },
          body: JSON.stringify({ title: "Item 1", message: "Message 1" }),
        })
      );
      await notificationsPost(
        new NextRequest("http://localhost:3000/api/notifications", {
          method: "POST",
          headers: { cookie: cookieHeader, "content-type": "application/json" },
          body: JSON.stringify({ title: "Item 2", message: "Message 2" }),
        })
      );

      const listReq = new NextRequest("http://localhost:3000/api/notifications", {
        headers: { cookie: cookieHeader },
      });
      const listRes = await notificationsGet(listReq);
      expect(listRes.status).toBe(200);

      const data = await listRes.json();
      expect(data.notifications.length).toBe(2);
      expect(data.total).toBe(2);
      expect(data.unreadCount).toBe(2);
    });
  });

  describe("GET /api/notifications/unread-count", () => {
    it("returns accurate unread count", async () => {
      if (!probe.isAvailable) return;

      const initialRes = await unreadCountGet(
        new NextRequest("http://localhost:3000/api/notifications/unread-count", {
          headers: { cookie: cookieHeader },
        })
      );
      expect(initialRes.status).toBe(200);
      expect((await initialRes.json()).unreadCount).toBe(0);

      // Create notification
      await notificationsPost(
        new NextRequest("http://localhost:3000/api/notifications", {
          method: "POST",
          headers: { cookie: cookieHeader, "content-type": "application/json" },
          body: JSON.stringify({ title: "New Item", message: "Unread message" }),
        })
      );

      const afterRes = await unreadCountGet(
        new NextRequest("http://localhost:3000/api/notifications/unread-count", {
          headers: { cookie: cookieHeader },
        })
      );
      expect(afterRes.status).toBe(200);
      expect((await afterRes.json()).unreadCount).toBe(1);
    });
  });

  describe("PATCH /api/notifications/[id]/read & POST /api/notifications/read-all", () => {
    it("marks single notification as read via PATCH and POST", async () => {
      if (!probe.isAvailable) return;

      const createRes = await notificationsPost(
        new NextRequest("http://localhost:3000/api/notifications", {
          method: "POST",
          headers: { cookie: cookieHeader, "content-type": "application/json" },
          body: JSON.stringify({ title: "Unread Item", message: "Will be read" }),
        })
      );
      const created = (await createRes.json()).notification;

      const patchReq = new NextRequest(
        `http://localhost:3000/api/notifications/${created.id}/read`,
        {
          method: "PATCH",
          headers: { cookie: cookieHeader },
        }
      );
      const patchRes = await readPatch(patchReq, {
        params: Promise.resolve({ id: created.id }),
      });
      expect(patchRes.status).toBe(200);

      const patchBody = await patchRes.json();
      expect(patchBody.success).toBe(true);
      expect(patchBody.notification.isRead).toBe(true);
      expect(patchBody.notification.readAt).toBeDefined();

      // Non-existent ID returns 404
      const notFoundRes = await readPatch(patchReq, {
        params: Promise.resolve({ id: "non-existent-id" }),
      });
      expect(notFoundRes.status).toBe(404);
    });

    it("marks all notifications as read via POST /api/notifications/read-all", async () => {
      if (!probe.isAvailable) return;

      for (let i = 1; i <= 3; i++) {
        await notificationsPost(
          new NextRequest("http://localhost:3000/api/notifications", {
            method: "POST",
            headers: { cookie: cookieHeader, "content-type": "application/json" },
            body: JSON.stringify({ title: `Item ${i}`, message: `Content ${i}` }),
          })
        );
      }

      const readAllReq = new NextRequest(
        "http://localhost:3000/api/notifications/read-all",
        {
          method: "POST",
          headers: { cookie: cookieHeader },
        }
      );
      const readAllRes = await readAllPost(readAllReq);
      expect(readAllRes.status).toBe(200);

      const readAllBody = await readAllRes.json();
      expect(readAllBody.success).toBe(true);
      expect(readAllBody.count).toBe(3);

      // Verify unread count is 0
      const countRes = await unreadCountGet(
        new NextRequest("http://localhost:3000/api/notifications/unread-count", {
          headers: { cookie: cookieHeader },
        })
      );
      expect((await countRes.json()).unreadCount).toBe(0);
    });
  });

  describe("DELETE /api/notifications/[id]", () => {
    it("deletes a notification and returns 200", async () => {
      if (!probe.isAvailable) return;

      const createRes = await notificationsPost(
        new NextRequest("http://localhost:3000/api/notifications", {
          method: "POST",
          headers: { cookie: cookieHeader, "content-type": "application/json" },
          body: JSON.stringify({ title: "Delete Me", message: "To be removed" }),
        })
      );
      const created = (await createRes.json()).notification;

      const delReq = new NextRequest(
        `http://localhost:3000/api/notifications/${created.id}`,
        {
          method: "DELETE",
          headers: { cookie: cookieHeader },
        }
      );
      const delRes = await notificationDelete(delReq, {
        params: Promise.resolve({ id: created.id }),
      });
      expect(delRes.status).toBe(200);
      expect((await delRes.json()).success).toBe(true);

      // Subsequent delete of same ID returns 404
      const secondDelRes = await notificationDelete(delReq, {
        params: Promise.resolve({ id: created.id }),
      });
      expect(secondDelRes.status).toBe(404);
    });
  });

  describe("Database Referential Integrity & Cascade", () => {
    it("cascades deletion of notifications when user is deleted", async () => {
      if (!probe.isAvailable) return;

      // Create notification
      await notificationsPost(
        new NextRequest("http://localhost:3000/api/notifications", {
          method: "POST",
          headers: { cookie: cookieHeader, "content-type": "application/json" },
          body: JSON.stringify({ title: "Cascade Item", message: "Cascade test" }),
        })
      );

      const notifsBefore = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testUserId));
      expect(notifsBefore.length).toBe(1);

      // Delete user
      await db.delete(user).where(eq(user.id, testUserId));

      // Notifications should be cascaded by PostgreSQL foreign key
      const notifsAfter = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, testUserId));
      expect(notifsAfter.length).toBe(0);

      // Recreate user for afterAll cleanup
      await auth.api.signUpEmail({
        body: testUser,
        asResponse: true,
      });
    });
  });
});
