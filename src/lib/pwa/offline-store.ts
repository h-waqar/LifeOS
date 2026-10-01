/**
 * Versioned IndexedDB Offline Store for LifeOS.
 * Persists queued tasks and notes captured while offline.
 * Enforces strict multi-user isolation by userId.
 * SSR-safe with in-memory fallback when IndexedDB is not supported.
 */

export type OfflineItemType = "task" | "note";
export type OfflineItemStatus = "pending" | "syncing" | "synced" | "failed";

export interface OfflineQueueItem<T = Record<string, any>> {
  id: string;
  userId: string;
  type: OfflineItemType;
  payload: T;
  status: OfflineItemStatus;
  retryCount: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  syncedAt?: number | null;
}

export const OFFLINE_DB_NAME = "lifeos_offline_db";
export const OFFLINE_DB_VERSION = 1;
export const OFFLINE_STORE_NAME = "offline_queue";

// In-memory fallback store for environments without IndexedDB (e.g. SSR, test environments)
const memoryStore = new Map<string, OfflineQueueItem>();

export function isIndexedDBSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof indexedDB !== "undefined" &&
    indexedDB !== null
  );
}

/**
 * Opens and initializes the versioned IndexedDB database.
 */
export function openOfflineDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDBSupported()) {
    return Promise.reject(new Error("IndexedDB is not supported in this environment."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
        const store = db.createObjectStore(OFFLINE_STORE_NAME, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("userId_status", ["userId", "status"], { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error("Failed to open IndexedDB"));
    };
  });
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "offline_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
}

/**
 * Enqueues a new item (task or note) into the offline store.
 * Requires an authenticated userId for multi-user isolation.
 */
export async function enqueueOfflineItem<T = Record<string, any>>(params: {
  userId: string;
  type: OfflineItemType;
  payload: T;
}): Promise<OfflineQueueItem<T>> {
  if (!params.userId || typeof params.userId !== "string") {
    throw new Error("Cannot enqueue offline item: userId is required for isolation.");
  }

  const now = Date.now();
  const newItem: OfflineQueueItem<T> = {
    id: generateId(),
    userId: params.userId,
    type: params.type,
    payload: params.payload,
    status: "pending",
    retryCount: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  if (!isIndexedDBSupported()) {
    memoryStore.set(newItem.id, newItem as unknown as OfflineQueueItem);
    return newItem;
  }

  try {
    const db = await openOfflineDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE_NAME, "readwrite");
      const store = tx.objectStore(OFFLINE_STORE_NAME);
      const req = store.add(newItem);

      req.onsuccess = () => resolve(newItem);
      req.onerror = () => reject(req.error || new Error("Failed to insert offline item"));
      tx.oncomplete = () => db.close();
    });
  } catch {
    // Graceful fallback to memory store if IDB fails
    memoryStore.set(newItem.id, newItem as unknown as OfflineQueueItem);
    return newItem;
  }
}

/**
 * Retrieves all pending items for a specific userId.
 * Enforces strict tenant isolation: never returns items for another user.
 */
export async function getPendingItems(userId: string): Promise<OfflineQueueItem[]> {
  if (!userId) return [];

  if (!isIndexedDBSupported()) {
    return Array.from(memoryStore.values()).filter(
      (item) => item.userId === userId && item.status === "pending"
    );
  }

  try {
    const db = await openOfflineDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE_NAME, "readonly");
      const store = tx.objectStore(OFFLINE_STORE_NAME);

      if (store.indexNames.contains("userId_status")) {
        const index = store.index("userId_status");
        const req = index.getAll(IDBKeyRange.only([userId, "pending"]));
        req.onsuccess = () => {
          // Double check isolation
          const items = (req.result || []).filter((item) => item.userId === userId);
          resolve(items);
        };
        req.onerror = () => reject(req.error);
      } else {
        const req = store.getAll();
        req.onsuccess = () => {
          const items = (req.result || []).filter(
            (item: OfflineQueueItem) => item.userId === userId && item.status === "pending"
          );
          resolve(items);
        };
        req.onerror = () => reject(req.error);
      }

      tx.oncomplete = () => db.close();
    });
  } catch {
    return Array.from(memoryStore.values()).filter(
      (item) => item.userId === userId && item.status === "pending"
    );
  }
}

/**
 * Retrieves all items (pending, syncing, synced, failed) belonging to a specific userId.
 */
export async function getOfflineItemsByUser(userId: string): Promise<OfflineQueueItem[]> {
  if (!userId) return [];

  if (!isIndexedDBSupported()) {
    return Array.from(memoryStore.values()).filter((item) => item.userId === userId);
  }

  try {
    const db = await openOfflineDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE_NAME, "readonly");
      const store = tx.objectStore(OFFLINE_STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const items = (req.result || []).filter(
          (item: OfflineQueueItem) => item.userId === userId
        );
        resolve(items);
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return Array.from(memoryStore.values()).filter((item) => item.userId === userId);
  }
}

/**
 * Retrieves a single queue item by ID.
 */
export async function getOfflineItemById(id: string): Promise<OfflineQueueItem | null> {
  if (!isIndexedDBSupported()) {
    return memoryStore.get(id) || null;
  }

  try {
    const db = await openOfflineDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE_NAME, "readonly");
      const store = tx.objectStore(OFFLINE_STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return memoryStore.get(id) || null;
  }
}

/**
 * Updates an existing queue item (e.g. status transition, retryCount, lastError).
 */
export async function updateOfflineItem(
  id: string,
  updates: Partial<Omit<OfflineQueueItem, "id" | "userId" | "createdAt">>
): Promise<OfflineQueueItem | null> {
  const existing = await getOfflineItemById(id);
  if (!existing) return null;

  const updated: OfflineQueueItem = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };

  if (!isIndexedDBSupported()) {
    memoryStore.set(id, updated);
    return updated;
  }

  try {
    const db = await openOfflineDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE_NAME, "readwrite");
      const store = tx.objectStore(OFFLINE_STORE_NAME);
      const req = store.put(updated);

      req.onsuccess = () => resolve(updated);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    memoryStore.set(id, updated);
    return updated;
  }
}

/**
 * Deletes an item from the offline store.
 */
export async function deleteOfflineItem(id: string): Promise<boolean> {
  if (!isIndexedDBSupported()) {
    return memoryStore.delete(id);
  }

  try {
    const db = await openOfflineDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE_NAME, "readwrite");
      const store = tx.objectStore(OFFLINE_STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return memoryStore.delete(id);
  }
}

/**
 * Cleans up successfully synced items for a specific user.
 */
export async function clearSyncedItems(userId: string): Promise<number> {
  const allUserItems = await getOfflineItemsByUser(userId);
  const syncedItems = allUserItems.filter((item) => item.status === "synced");

  for (const item of syncedItems) {
    await deleteOfflineItem(item.id);
  }

  return syncedItems.length;
}

/**
 * Resets the offline store (used for tests and cache resets).
 */
export async function resetOfflineStore(): Promise<void> {
  memoryStore.clear();

  if (!isIndexedDBSupported()) return;

  try {
    const db = await openOfflineDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE_NAME, "readwrite");
      const store = tx.objectStore(OFFLINE_STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    // Ignore error if database cannot be cleared
  }
}
