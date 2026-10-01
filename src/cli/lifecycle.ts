/**
 * CLI Process Lifecycle & Database Teardown
 *
 * Ensures graceful shutdown, pool draining via closeDatabase(), and signal trapping
 * (SIGINT, SIGTERM) to prevent hanging CLI processes or leaked connections.
 */

import { closeDatabase } from "@/server/db";

let isShuttingDown = false;
let handlersRegistered = false;

/**
 * Gracefully shuts down resources and closes database connections.
 */
export async function teardownResources(): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  try {
    await closeDatabase();
  } catch (error) {
    // Non-blocking error logging to stderr during teardown
    if (process.env.DEBUG) {
      console.error("Error closing database pool:", error);
    }
  } finally {
    isShuttingDown = false;
  }
}

/**
 * Registers process signal traps for clean termination.
 */
export function registerSignalHandlers(): void {
  if (handlersRegistered) {
    return;
  }
  handlersRegistered = true;

  const onSignal = async (signal: string, exitCode: number) => {
    try {
      await teardownResources();
    } finally {
      process.exit(exitCode);
    }
  };

  process.once("SIGINT", () => {
    void onSignal("SIGINT", 130);
  });

  process.once("SIGTERM", () => {
    void onSignal("SIGTERM", 143);
  });
}

/**
 * Executes an async action wrapped in full lifecycle teardown.
 */
export async function withLifecycle<T>(
  action: () => Promise<T>
): Promise<T> {
  registerSignalHandlers();
  try {
    return await action();
  } finally {
    await teardownResources();
  }
}
