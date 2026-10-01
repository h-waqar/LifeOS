import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import manifestConfig from "@/app/manifest";
import {
  enqueueOfflineItem,
  getPendingItems,
  getOfflineItemsByUser,
  getOfflineItemById,
  updateOfflineItem,
  deleteOfflineItem,
  clearSyncedItems,
  resetOfflineStore,
  OFFLINE_DB_NAME,
  OFFLINE_STORE_NAME,
  type OfflineQueueItem,
} from "@/lib/pwa/offline-store";
import {
  syncOfflineQueue,
  initOfflineSync,
  MAX_RETRY_ATTEMPTS,
} from "@/lib/pwa/sync-manager";
import {
  isServiceWorkerSupported,
  registerServiceWorker,
  unregisterServiceWorker,
} from "@/lib/pwa/service-worker";

describe("Plan 15-01: Progressive Web App Manifest, Service Worker & Offline Sync Engine", () => {
  beforeEach(async () => {
    await resetOfflineStore();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await resetOfflineStore();
    vi.restoreAllMocks();
  });

  describe("1. Web App Manifest & Static PWA Assets", () => {
    it("provides a valid, spec-compliant public/manifest.json", () => {
      const manifestPath = path.resolve(process.cwd(), "public/manifest.json");
      expect(fs.existsSync(manifestPath)).toBe(true);

      const raw = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(raw);

      expect(manifest.name).toBe("LifeOS - Personal Operating System");
      expect(manifest.short_name).toBe("LifeOS");
      expect(manifest.start_url).toBe("/");
      expect(manifest.display).toBe("standalone");
      expect(manifest.scope).toBe("/");
      expect(manifest.background_color).toBe("#09090b");
      expect(manifest.theme_color).toBe("#09090b");

      // Verify icons
      expect(Array.isArray(manifest.icons)).toBe(true);
      const icon192 = manifest.icons.find((i: any) => i.sizes === "192x192" && i.type === "image/png");
      const icon512 = manifest.icons.find((i: any) => i.sizes === "512x512" && i.type === "image/png");
      const maskable = manifest.icons.find((i: any) => i.purpose?.includes("maskable"));

      expect(icon192).toBeDefined();
      expect(icon512).toBeDefined();
      expect(maskable).toBeDefined();
    });

    it("ensures framework metadata route src/app/manifest.ts matches manifest specification", () => {
      const generated = manifestConfig();
      expect(generated.name).toBe("LifeOS - Personal Operating System");
      expect(generated.short_name).toBe("LifeOS");
      expect(generated.start_url).toBe("/");
      expect(generated.display).toBe("standalone");
      expect(generated.theme_color).toBe("#09090b");
      expect(generated.background_color).toBe("#09090b");
      expect(generated.icons).toHaveLength(5);
    });

    it("verifies physical existence and format of required icon assets", () => {
      const iconsDir = path.resolve(process.cwd(), "public/icons");
      expect(fs.existsSync(iconsDir)).toBe(true);

      expect(fs.existsSync(path.join(iconsDir, "icon-192.svg"))).toBe(true);
      expect(fs.existsSync(path.join(iconsDir, "icon-512.svg"))).toBe(true);
      expect(fs.existsSync(path.join(iconsDir, "icon-192.png"))).toBe(true);
      expect(fs.existsSync(path.join(iconsDir, "icon-512.png"))).toBe(true);

      const stat192 = fs.statSync(path.join(iconsDir, "icon-192.png"));
      const stat512 = fs.statSync(path.join(iconsDir, "icon-512.png"));
      expect(stat192.size).toBeGreaterThan(500);
      expect(stat512.size).toBeGreaterThan(1000);
    });
  });

  describe("2. Service Worker Security & Shell Caching Invariants", () => {
    const swPath = path.resolve(process.cwd(), "public/sw.js");
    let swContent: string;

    beforeEach(() => {
      expect(fs.existsSync(swPath)).toBe(true);
      swContent = fs.readFileSync(swPath, "utf-8");
    });

    it("contains cache name and precaches static shell assets", () => {
      expect(swContent).toContain("lifeos-shell-v1");
      expect(swContent).toContain("STATIC_SHELL_ASSETS");
      expect(swContent).toContain("'/manifest.json'");
      expect(swContent).toContain("'/icons/icon-192.png'");
      expect(swContent).toContain("'/icons/icon-512.png'");
    });

    it("enforces strict Rule 11: NEVER caches /api/*, auth, or finance endpoints", () => {
      // Must explicitly check for /api/
      expect(swContent).toMatch(/url\.pathname\.startsWith\(['"]\/api\/['"]\)/);
      // Must check for auth
      expect(swContent).toMatch(/auth/);
      // Must check for finance
      expect(swContent).toMatch(/finance/);

      // Must bypass cache for non-GET methods
      expect(swContent).toMatch(/request\.method !== ['"]GET['"]/);
    });

    it("provides an offline fallback for HTML navigation requests", () => {
      expect(swContent).toContain("mode === 'navigate'");
      expect(swContent).toContain("OFFLINE_FALLBACK_HTML");
    });

    it("ensures client service-worker.ts is SSR-safe", async () => {
      // In SSR (no window/navigator), isServiceWorkerSupported should be false or safe
      expect(typeof isServiceWorkerSupported()).toBe("boolean");

      // registerServiceWorker should resolve to null or registration without throwing
      const reg = await registerServiceWorker();
      expect(reg === null || typeof reg === "object").toBe(true);

      // unregisterServiceWorker should be safe
      const unreg = await unregisterServiceWorker();
      expect(typeof unreg).toBe("boolean");
    });
  });

  describe("3. IndexedDB Offline Queue Store & Lifecycle", () => {
    const userA = "usr_tenant_alice";
    const userB = "usr_tenant_bob";

    it("enqueues tasks and notes with initial 'pending' status and retryCount 0", async () => {
      const task = await enqueueOfflineItem({
        userId: userA,
        type: "task",
        payload: { raw: "Buy groceries !high ^tomorrow +personal" },
      });

      expect(task.id).toBeDefined();
      expect(task.userId).toBe(userA);
      expect(task.type).toBe("task");
      expect(task.status).toBe("pending");
      expect(task.retryCount).toBe(0);
      expect(task.lastError).toBeNull();
      expect(task.createdAt).toBeGreaterThan(0);

      const note = await enqueueOfflineItem({
        userId: userA,
        type: "note",
        payload: { title: "Draft idea", content: "Exciting architectural concept" },
      });

      expect(note.id).toBeDefined();
      expect(note.userId).toBe(userA);
      expect(note.type).toBe("note");
      expect(note.status).toBe("pending");
    });

    it("fails closed if userId is missing during enqueue", async () => {
      await expect(
        enqueueOfflineItem({
          userId: "",
          type: "task",
          payload: { raw: "Unauthenticated task" },
        })
      ).rejects.toThrow(/userId is required/);
    });

    it("enforces multi-user isolation on getPendingItems", async () => {
      await enqueueOfflineItem({
        userId: userA,
        type: "task",
        payload: { raw: "Alice Task 1" },
      });
      await enqueueOfflineItem({
        userId: userA,
        type: "task",
        payload: { raw: "Alice Task 2" },
      });
      await enqueueOfflineItem({
        userId: userB,
        type: "task",
        payload: { raw: "Bob Secret Task" },
      });

      const alicePending = await getPendingItems(userA);
      const bobPending = await getPendingItems(userB);

      expect(alicePending).toHaveLength(2);
      expect(alicePending.every((i) => i.userId === userA)).toBe(true);
      expect(alicePending.some((i) => i.payload.raw === "Bob Secret Task")).toBe(false);

      expect(bobPending).toHaveLength(1);
      expect(bobPending[0].userId).toBe(userB);
      expect(bobPending[0].payload.raw).toBe("Bob Secret Task");
    });

    it("transitions lifecycle states from pending -> syncing -> synced", async () => {
      const item = await enqueueOfflineItem({
        userId: userA,
        type: "task",
        payload: { raw: "Prepare release notes" },
      });

      // 1. Pending
      expect(item.status).toBe("pending");

      // 2. Syncing
      const syncing = await updateOfflineItem(item.id, { status: "syncing" });
      expect(syncing?.status).toBe("syncing");

      // 3. Synced
      const now = Date.now();
      const synced = await updateOfflineItem(item.id, {
        status: "synced",
        syncedAt: now,
      });
      expect(synced?.status).toBe("synced");
      expect(synced?.syncedAt).toBe(now);

      // Verify pending items no longer include synced item
      const pending = await getPendingItems(userA);
      expect(pending.some((i) => i.id === item.id)).toBe(false);
    });

    it("transitions lifecycle states from pending -> syncing -> failed", async () => {
      const item = await enqueueOfflineItem({
        userId: userA,
        type: "task",
        payload: { raw: "Bad input payload" },
      });

      await updateOfflineItem(item.id, { status: "syncing" });
      const failed = await updateOfflineItem(item.id, {
        status: "failed",
        lastError: "Validation failed: invalid priority syntax",
        retryCount: 1,
      });

      expect(failed?.status).toBe("failed");
      expect(failed?.lastError).toContain("Validation failed");
      expect(failed?.retryCount).toBe(1);

      // Verify pending items no longer include failed item
      const pending = await getPendingItems(userA);
      expect(pending.some((i) => i.id === item.id)).toBe(false);
    });

    it("clears synced items without affecting pending or failed records", async () => {
      const syncedItem = await enqueueOfflineItem({
        userId: userA,
        type: "task",
        payload: { raw: "Completed sync" },
      });
      await updateOfflineItem(syncedItem.id, { status: "synced" });

      const pendingItem = await enqueueOfflineItem({
        userId: userA,
        type: "task",
        payload: { raw: "Still pending" },
      });

      const failedItem = await enqueueOfflineItem({
        userId: userA,
        type: "task",
        payload: { raw: "Failed item" },
      });
      await updateOfflineItem(failedItem.id, { status: "failed" });

      const clearedCount = await clearSyncedItems(userA);
      expect(clearedCount).toBe(1);

      const remaining = await getOfflineItemsByUser(userA);
      expect(remaining).toHaveLength(2);
      expect(remaining.some((i) => i.id === syncedItem.id)).toBe(false);
      expect(remaining.some((i) => i.id === pendingItem.id)).toBe(true);
      expect(remaining.some((i) => i.id === failedItem.id)).toBe(true);
    });
  });

  describe("4. Queue Synchronization Engine & Multi-User Isolation", () => {
    const userA = "usr_tenant_alice";
    const userB = "usr_tenant_bob";

    it("synchronizes pending tasks to /api/tasks/quick-capture with 200 OK", async () => {
      await enqueueOfflineItem({
        userId: userA,
        type: "task",
        payload: { raw: "Submit quarterly report !critical" },
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ task: { id: "tsk_123", title: "Submit quarterly report" } }),
      } as any);

      const result = await syncOfflineQueue(userA);

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/tasks/quick-capture",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-lifeos-offline-sync": "true",
          }),
          body: JSON.stringify({ raw: "Submit quarterly report !critical" }),
        })
      );

      const items = await getOfflineItemsByUser(userA);
      expect(items[0].status).toBe("synced");
      expect(items[0].syncedAt).toBeDefined();
    });

    it("synchronizes pending notes to /api/notes with 200 OK", async () => {
      await enqueueOfflineItem({
        userId: userA,
        type: "note",
        payload: { title: "Offline Reflection", content: "Captured on subway" },
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: "nt_456", title: "Offline Reflection" } }),
      } as any);

      const result = await syncOfflineQueue(userA);

      expect(result.synced).toBe(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/notes",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ title: "Offline Reflection", content: "Captured on subway" }),
        })
      );
    });

    it("strictly isolates users: User B items are NEVER submitted under User A session", async () => {
      await enqueueOfflineItem({
        userId: userA,
        type: "task",
        payload: { raw: "Alice Task" },
      });
      await enqueueOfflineItem({
        userId: userB,
        type: "task",
        payload: { raw: "Bob Confidential Document" },
      });

      const fetchCalls: any[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        fetchCalls.push({ url, body: JSON.parse((init?.body as string) || "{}") });
        return {
          ok: true,
          status: 201,
          json: async () => ({ success: true }),
        } as any;
      });

      // Synchronize under User A session
      const result = await syncOfflineQueue(userA);

      expect(result.synced).toBe(1);
      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0].body.raw).toBe("Alice Task");

      // Verify Bob's item remains completely untouched and pending
      const bobItems = await getOfflineItemsByUser(userB);
      expect(bobItems).toHaveLength(1);
      expect(bobItems[0].status).toBe("pending");
      expect(bobItems[0].retryCount).toBe(0);
    });

    it("terminates immediately into failed state on permanent 400/422 validation failure", async () => {
      const item = await enqueueOfflineItem({
        userId: userA,
        type: "task",
        payload: { raw: "Invalid syntax causing 400" },
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Validation error: Malformed priority token" }),
      } as any);

      const result = await syncOfflineQueue(userA);

      expect(result.failed).toBe(1);
      expect(result.synced).toBe(0);

      const updated = await getOfflineItemById(item.id);
      expect(updated?.status).toBe("failed");
      expect(updated?.retryCount).toBe(1);
      expect(updated?.lastError).toContain("Malformed priority token");

      // Attempting another sync must not retry the failed item
      const secondResult = await syncOfflineQueue(userA);
      expect(secondResult.synced).toBe(0);
      expect(secondResult.failed).toBe(0);
    });

    it("retries transient 500 errors and caps retries at 3 attempts", async () => {
      const item = await enqueueOfflineItem({
        userId: userA,
        type: "task",
        payload: { raw: "Transient server error task" },
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Database connection timeout" }),
      } as any);

      // Attempt 1: Transient failure -> reverts to pending
      const res1 = await syncOfflineQueue(userA);
      expect(res1.failed).toBe(1);
      let record = await getOfflineItemById(item.id);
      expect(record?.status).toBe("pending");
      expect(record?.retryCount).toBe(1);

      // Attempt 2: Transient failure -> reverts to pending
      const res2 = await syncOfflineQueue(userA);
      expect(res2.failed).toBe(1);
      record = await getOfflineItemById(item.id);
      expect(record?.status).toBe("pending");
      expect(record?.retryCount).toBe(2);

      // Attempt 3: Capped -> transitions to terminal 'failed' state
      const res3 = await syncOfflineQueue(userA);
      expect(res3.failed).toBe(1);
      record = await getOfflineItemById(item.id);
      expect(record?.status).toBe("failed");
      expect(record?.retryCount).toBe(MAX_RETRY_ATTEMPTS);
      expect(record?.lastError).toContain("Max retry limit");

      // Attempt 4: No longer processed
      const res4 = await syncOfflineQueue(userA);
      expect(res4.synced).toBe(0);
      expect(res4.failed).toBe(0);
    });

    it("prevents concurrent duplicate synchronization using in-flight lock", async () => {
      await enqueueOfflineItem({
        userId: userA,
        type: "task",
        payload: { raw: "Concurrent test task" },
      });

      let resolveFetch: () => void = () => {};
      let fetchCallCount = 0;

      vi.spyOn(globalThis, "fetch").mockImplementation(() => {
        fetchCallCount++;
        return new Promise((res) => {
          resolveFetch = () =>
            res({
              ok: true,
              status: 201,
              json: async () => ({ task: { id: "1" } }),
            } as any);
        });
      });

      // Launch first sync (which hangs until resolveFetch is called)
      const sync1Promise = syncOfflineQueue(userA);

      // Concurrently launch second sync
      const sync2Result = await syncOfflineQueue(userA);
      // Second sync must immediately abort due to in-flight lock
      expect(sync2Result.synced).toBe(0);

      // Complete first sync
      resolveFetch();
      const sync1Result = await sync1Promise;
      expect(sync1Result.synced).toBe(1);
      expect(fetchCallCount).toBe(1);
    });

    it("attaches and detaches window 'online' event listener via initOfflineSync", async () => {
      const addSpy = vi.spyOn(window, "addEventListener");
      const removeSpy = vi.spyOn(window, "removeEventListener");

      const cleanup = initOfflineSync(userA);

      expect(addSpy).toHaveBeenCalledWith("online", expect.any(Function));

      cleanup();

      expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
    });
  });
});
