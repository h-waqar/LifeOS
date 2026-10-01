"use client";

import * as React from "react";
import { registerServiceWorker } from "@/lib/pwa/service-worker";
import { initOfflineSync } from "@/lib/pwa/sync-manager";
import { useSession } from "@/lib/auth-client";

/**
 * PWA Client Registration Component.
 * Registers the root service worker and attaches offline queue synchronization listeners.
 */
export function PwaRegister() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  React.useEffect(() => {
    // 1. Register service worker
    registerServiceWorker();

    // 2. Initialize automatic offline sync listeners if user is signed in
    if (userId) {
      const cleanup = initOfflineSync(userId);
      return () => {
        cleanup();
      };
    }
  }, [userId]);

  return null;
}
