import { createAuditLog } from "@/server/audit";
import {
  type DomainEventName,
  type DomainEvent,
  type AnyDomainEvent,
  type EventHandler,
  type WildcardEventHandler,
  type UnsubscribeFn,
  RecursionLimitError,
  InvalidEventError,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: EventBus cannot be initialized in the browser."
  );
}

export const MAX_EVENT_DEPTH = 3;

/**
 * In-Process Strongly Typed Asynchronous Event Bus.
 * Decouples domain mutations from downstream consumers (notifications, automations, audit).
 * Operates with concurrent subscriber dispatch via Promise.allSettled(),
 * execution depth tracking, and subscriber error boundary containment.
 */
export class EventBus {
  private topicSubscribers: Map<DomainEventName, Set<EventHandler<any>>> =
    new Map();
  private wildcardSubscribers: Set<WildcardEventHandler> = new Set();
  private activePublishPromises: Set<Promise<void>> = new Set();

  /**
   * Subscribes a handler function to a specific domain event topic.
   * Returns an idempotent unsubscribe cleanup function.
   */
  subscribe<T extends DomainEventName>(
    eventName: T,
    handler: EventHandler<T>
  ): UnsubscribeFn {
    if (!this.topicSubscribers.has(eventName)) {
      this.topicSubscribers.set(eventName, new Set());
    }
    const set = this.topicSubscribers.get(eventName)!;
    set.add(handler);

    return () => {
      set.delete(handler);
      if (set.size === 0) {
        this.topicSubscribers.delete(eventName);
      }
    };
  }

  /**
   * Subscribes a wildcard handler function that receives all domain events.
   * Returns an idempotent unsubscribe cleanup function.
   */
  subscribeAll(handler: WildcardEventHandler): UnsubscribeFn {
    this.wildcardSubscribers.add(handler);

    return () => {
      this.wildcardSubscribers.delete(handler);
    };
  }

  /**
   * Publishes a domain event asynchronously.
   * Enforces non-empty userId, verifies recursion depth (max 3),
   * and dispatches concurrently to topic and wildcard subscribers using Promise.allSettled().
   * Subscriber errors are contained and logged without throwing to caller.
   */
  async publish<T extends DomainEventName>(
    event: DomainEvent<T>
  ): Promise<void> {
    if (!event || typeof event !== "object") {
      throw new InvalidEventError("Event must be a valid object.");
    }
    if (!event.name || typeof event.name !== "string") {
      throw new InvalidEventError("Event must have a valid string name.");
    }
    if (
      !event.userId ||
      typeof event.userId !== "string" ||
      event.userId.trim().length === 0
    ) {
      throw new InvalidEventError("Event must have a non-empty userId.");
    }

    const depth = event.metadata?.depth ?? 0;
    if (depth >= MAX_EVENT_DEPTH) {
      try {
        await createAuditLog({
          userId: event.userId,
          category: "security",
          action: "system.recursion_limit_exceeded",
          status: "failure",
          actor: `user:${event.userId}`,
          details: {
            eventName: event.name,
            depth,
            maxDepth: MAX_EVENT_DEPTH,
            eventId: event.id,
            correlationId: event.metadata?.correlationId,
          },
        });
      } catch (auditErr) {
        console.error(
          "[EventBus] Failed to write recursion limit audit log:",
          auditErr
        );
      }

      throw new RecursionLimitError(
        `Recursion limit exceeded for event "${event.name}": depth ${depth} >= ${MAX_EVENT_DEPTH}`
      );
    }

    // Default id and timestamp if omitted
    if (!event.id) {
      (event as any).id = crypto.randomUUID();
    }
    if (!event.timestamp) {
      (event as any).timestamp = new Date().toISOString();
    }

    // Snapshot subscribers to avoid concurrent modification issues during dispatch
    const topicSet = this.topicSubscribers.get(event.name);
    const handlers: Array<(ev: any) => Promise<void> | void> = [];

    if (topicSet && topicSet.size > 0) {
      handlers.push(...Array.from(topicSet));
    }
    if (this.wildcardSubscribers.size > 0) {
      handlers.push(...Array.from(this.wildcardSubscribers));
    }

    if (handlers.length === 0) {
      return;
    }

    const publishTask = (async () => {
      // Dispatch concurrently via Promise.allSettled
      const results = await Promise.allSettled(
        handlers.map(async (handler) => {
          await handler(event);
        })
      );

      // Log subscriber errors without failing the publisher
      for (const res of results) {
        if (res.status === "rejected") {
          console.error(
            `[EventBus] Subscriber error for event "${event.name}":`,
            res.reason
          );
        }
      }
    })();

    this.activePublishPromises.add(publishTask);
    try {
      await publishTask;
    } finally {
      this.activePublishPromises.delete(publishTask);
    }
  }

  /**
   * Waits for all currently running publish operations to settle.
   * Useful for ensuring background publish jobs finish in integration tests.
   */
  async drain(): Promise<void> {
    while (this.activePublishPromises.size > 0) {
      await Promise.all(Array.from(this.activePublishPromises));
    }
  }

  /**
   * Clears all topic and wildcard subscriptions.
   * Utility for test teardown and isolation.
   */
  clearSubscribers(): void {
    this.topicSubscribers.clear();
    this.wildcardSubscribers.clear();
  }

  /**
   * Returns the count of registered subscribers for a topic or across the entire bus.
   */
  listenerCount(eventName?: DomainEventName): number {
    if (eventName) {
      return (
        (this.topicSubscribers.get(eventName)?.size ?? 0) +
        this.wildcardSubscribers.size
      );
    }
    let count = this.wildcardSubscribers.size;
    for (const set of this.topicSubscribers.values()) {
      count += set.size;
    }
    return count;
  }
}

// Global in-process singleton instance
export const eventBus = new EventBus();
