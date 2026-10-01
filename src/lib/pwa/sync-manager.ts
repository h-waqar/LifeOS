/**
 * Background Offline Queue Synchronization Manager.
 * Orchestrates sending queued tasks and notes to PostgreSQL via API routes.
 * Enforces:
 * 1. Strict multi-user isolation by userId.
 * 2. Concurrency-safe synchronization (Web Locks API + atomic in-flight guard).
 * 3. 3-attempt retry cap with terminal failure for permanent 400/422 validation errors.
 * 4. Automatic reconciliation upon network reconnection.
 */

import {
  getPendingItems,
  updateOfflineItem,
  type OfflineQueueItem,
} from "./offline-store";

export interface SyncResult {
  synced: number;
  failed: number;
  skipped: number;
}

export const MAX_RETRY_ATTEMPTS = 3;
const SYNC_LOCK_NAME = "lifeos_offline_sync_lock";

let isSyncInProgress = false;

/**
 * Checks whether Web Locks API is available.
 */
function hasWebLocks(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.locks) &&
    typeof navigator.locks.request === "function"
  );
}

/**
 * Dispatches a single queued item to its respective API route.
 * Throws on failure with error details or HTTP status code.
 */
async function dispatchItem(item: OfflineQueueItem): Promise<void> {
  let endpoint = "";
  let body: Record<string, any> = {};

  if (item.type === "task") {
    if (item.payload && typeof item.payload.raw === "string") {
      endpoint = "/api/tasks/quick-capture";
      body = {
        raw: item.payload.raw,
        overrideProjectId: item.payload.overrideProjectId ?? undefined,
      };
    } else {
      endpoint = "/api/tasks";
      body = item.payload;
    }
  } else if (item.type === "note") {
    endpoint = "/api/notes";
    body = item.payload;
  } else {
    throw {
      status: 400,
      message: `Unknown offline item type: ${(item as any).type}`,
      permanent: true,
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-lifeos-offline-sync": "true",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: Failed to synchronize ${item.type}`;
    try {
      const data = await response.json();
      if (data && (data.error || data.message)) {
        errorMessage = data.error || data.message;
      }
    } catch {
      // Use fallback error message
    }

    const isPermanent = response.status === 400 || response.status === 422 || response.status === 413 || response.status === 415;
    throw {
      status: response.status,
      message: errorMessage,
      permanent: isPermanent,
    };
  }
}

/**
 * Synchronizes offline items for the current authenticated user.
 * Guarantees that items belonging to other users are NEVER synchronized under this session.
 */
export async function syncOfflineQueue(currentUserId?: string): Promise<SyncResult> {
  if (!currentUserId || typeof currentUserId !== "string") {
    return { synced: 0, failed: 0, skipped: 0 };
  }

  if (hasWebLocks()) {
    return new Promise<SyncResult>((resolve) => {
      navigator.locks.request(
        SYNC_LOCK_NAME,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            // Another tab is already synchronizing
            resolve({ synced: 0, failed: 0, skipped: 0 });
            return;
          }
          const result = await executeQueueSync(currentUserId);
          resolve(result);
        }
      ).catch(() => {
        // Fallback to in-flight guard if lock request errors
        executeQueueSync(currentUserId).then(resolve);
      });
    });
  }

  return executeQueueSync(currentUserId);
}

/**
 * Core synchronization loop protected by an in-flight guard and atomic status updates.
 */
async function executeQueueSync(currentUserId: string): Promise<SyncResult> {
  if (isSyncInProgress) {
    return { synced: 0, failed: 0, skipped: 0 };
  }

  isSyncInProgress = true;
  const result: SyncResult = { synced: 0, failed: 0, skipped: 0 };

  try {
    const pendingItems = await getPendingItems(currentUserId);

    for (const item of pendingItems) {
      // Strict multi-user isolation check:
      // Never synchronize an item belonging to another user.
      if (item.userId !== currentUserId) {
        result.skipped++;
        continue;
      }

      // Check retry cap before processing
      if (item.retryCount >= MAX_RETRY_ATTEMPTS) {
        await updateOfflineItem(item.id, {
          status: "failed",
          lastError: `Max retry limit (${MAX_RETRY_ATTEMPTS}) reached.`,
        });
        result.failed++;
        continue;
      }

      // Concurrency guard: Atomically mark as syncing
      await updateOfflineItem(item.id, { status: "syncing" });

      try {
        await dispatchItem(item);

        // Success: transition to synced
        await updateOfflineItem(item.id, {
          status: "synced",
          syncedAt: Date.now(),
          lastError: null,
        });
        result.synced++;
      } catch (err: any) {
        const isPermanent = Boolean(err?.permanent) || err?.status === 400 || err?.status === 422;
        const errorMessage = err?.message || String(err) || "Unknown synchronization error";
        const nextRetryCount = item.retryCount + 1;

        if (isPermanent || nextRetryCount >= MAX_RETRY_ATTEMPTS) {
          // Terminal failure: Do not retry further
          await updateOfflineItem(item.id, {
            status: "failed",
            retryCount: nextRetryCount,
            lastError: isPermanent
              ? `Validation error: ${errorMessage}`
              : `Max retry limit reached: ${errorMessage}`,
          });
          result.failed++;
        } else {
          // Transient failure: Revert to pending for subsequent attempt
          await updateOfflineItem(item.id, {
            status: "pending",
            retryCount: nextRetryCount,
            lastError: errorMessage,
          });
          result.failed++;
        }
      }
    }
  } finally {
    isSyncInProgress = false;
  }

  return result;
}

/**
 * Initializes automatic synchronization listeners.
 * Listens for online reconnection events and triggers sync.
 * Returns a cleanup unsubscribe callback.
 */
export function initOfflineSync(currentUserId?: string): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleOnline = () => {
    if (currentUserId) {
      syncOfflineQueue(currentUserId).catch((err) => {
        console.warn("[PWA] Automatic online sync encountered an error:", err);
      });
    }
  };

  window.addEventListener("online", handleOnline);

  // If already online at initialization, schedule an initial synchronization
  if (navigator.onLine && currentUserId) {
    syncOfflineQueue(currentUserId).catch((err) => {
      console.warn("[PWA] Initial queue sync encountered an error:", err);
    });
  }

  return () => {
    window.removeEventListener("online", handleOnline);
  };
}
