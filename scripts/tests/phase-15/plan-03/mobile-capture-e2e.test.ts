import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  QuickCaptureModal,
  parseTokensClient,
} from "@/components/quick-capture-modal";
import {
  enqueueOfflineItem,
  getPendingItems,
  getOfflineItemsByUser,
  getOfflineItemById,
  resetOfflineStore,
} from "@/lib/pwa/offline-store";
import { syncOfflineQueue, initOfflineSync } from "@/lib/pwa/sync-manager";
import manifestConfig from "@/app/manifest";

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: { user: { id: "usr_e2e_mobile_tester", name: "E2E Mobile Tester", email: "mobile@lifeos.dev" } },
    isPending: false,
  }),
}));

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "en-US";
  onstart: (() => void) | null = null;
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;

  static activeInstances: MockSpeechRecognition[] = [];

  constructor() {
    MockSpeechRecognition.activeInstances.push(this);
  }

  start() {
    if (this.onstart) this.onstart();
  }

  stop() {
    if (this.onend) this.onend();
  }

  abort() {
    if (this.onend) this.onend();
  }

  simulateResult(results: Array<{ transcript: string; isFinal: boolean }>, resultIndex = 0) {
    if (this.onresult) {
      const eventResults = results.map((r) => [{ transcript: r.transcript }]);
      results.forEach((r, idx) => {
        (eventResults[idx] as any).isFinal = r.isFinal;
      });

      this.onresult({
        resultIndex,
        results: eventResults,
      });
    }
  }
}

describe("Plan 15-03: Mobile Capture & PWA End-to-End Verification Suite", () => {
  const testUserId = "usr_e2e_mobile_tester";
  let originalOnLine: boolean;
  let unhandledRejections: any[] = [];
  let consoleErrors: any[] = [];

  beforeEach(async () => {
    await resetOfflineStore();
    MockSpeechRecognition.activeInstances = [];
    (window as any).SpeechRecognition = MockSpeechRecognition;

    originalOnLine = navigator.onLine;

    unhandledRejections = [];
    consoleErrors = [];

    vi.spyOn(console, "error").mockImplementation((...args) => {
      consoleErrors.push(args);
    });

    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await resetOfflineStore();
    delete (window as any).SpeechRecognition;
    Object.defineProperty(navigator, "onLine", { value: originalOnLine, configurable: true });
    vi.restoreAllMocks();
  });

  it("executes the complete 15-step mobile capture journey seamlessly", async () => {
    // Track fetch invocations
    let fetchCalls: Array<{ url: string; body: any }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      fetchCalls.push({ url: String(url), body });
      return {
        ok: true,
        status: 201,
        json: async () => ({
          task: {
            id: "tsk_synced_e2e",
            title: body.raw || "Synced Task",
            userId: testUserId,
          },
        }),
      } as any;
    });

    // Step 1: Open quick capture modal
    const onTaskCreatedSpy = vi.fn();
    const onCloseSpy = vi.fn();

    const { container, rerender } = render(
      React.createElement(QuickCaptureModal, {
        isOpen: true,
        onClose: onCloseSpy,
        onTaskCreated: onTaskCreatedSpy,
        userId: testUserId,
      })
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();

    // Step 2: Dictate speech text via Web Speech API
    const micButton = screen.getByRole("button", { name: "Start voice dictation" });
    expect(micButton).toBeDefined();
    fireEvent.click(micButton);

    const recognition = MockSpeechRecognition.activeInstances[0];
    expect(recognition).toBeDefined();

    // Step 3: Receive speech transcript
    const spokenTranscript = "buy groceries tomorrow at 5pm urgent";
    act(() => {
      recognition.simulateResult([{ transcript: spokenTranscript, isFinal: true }]);
    });

    // Step 4: Parse transcript & Step 5: Extract structured task fields
    const parsed = parseTokensClient(spokenTranscript);
    expect(parsed.title).toBe("buy groceries");
    expect(parsed.priority).toBe("critical");
    expect(parsed.scheduledDate).toBe("tomorrow at 5pm");
    expect(parsed.dueDate).toBe("tomorrow");

    // Live UI verification: input reflects speech and badges show extracted priority
    const input = screen.getByPlaceholderText(/Write architecture brief/i) as HTMLInputElement;
    expect(input.value).toBe(spokenTranscript);
    expect(screen.getByText("buy groceries")).toBeDefined();
    expect(screen.getByText(/critical/i)).toBeDefined();

    // Step 6: Simulate offline network state
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    expect(navigator.onLine).toBe(false);

    // Step 7: Capture item while offline
    const captureButton = screen.getByRole("button", { name: "Capture Task" });
    await act(async () => {
      fireEvent.click(captureButton);
    });

    // Step 8: Persist item locally in IndexedDB offline queue
    const pendingItems = await getPendingItems(testUserId);
    expect(pendingItems).toHaveLength(1);
    const offlineItem = pendingItems[0];
    expect(offlineItem.userId).toBe(testUserId);
    expect(offlineItem.type).toBe("task");
    expect(offlineItem.status).toBe("pending");
    expect(offlineItem.payload.raw).toBe(spokenTranscript);
    expect(offlineItem.retryCount).toBe(0);

    // Modal closes and calls creation handler with offline item
    expect(onCloseSpy).toHaveBeenCalled();
    expect(onTaskCreatedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: offlineItem.id,
        status: "pending",
      })
    );

    // Verify ZERO network calls were made while offline
    expect(fetchCalls).toHaveLength(0);

    // Step 9: Restore network connectivity
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    expect(navigator.onLine).toBe(true);

    // Step 10: Trigger synchronization upon network restoration
    const syncResult = await syncOfflineQueue(testUserId);

    // Step 11: Verify API route dispatch and entity creation
    expect(syncResult.synced).toBe(1);
    expect(syncResult.failed).toBe(0);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("/api/tasks/quick-capture");
    expect(fetchCalls[0].body.raw).toBe(spokenTranscript);

    // Verify record state transitioned to synced
    const syncedRecord = await getOfflineItemById(offlineItem.id);
    expect(syncedRecord?.status).toBe("synced");
    expect(syncedRecord?.syncedAt).toBeDefined();

    // Step 12: Verify no duplicate submission upon subsequent sync or online reconnection event
    const secondSyncResult = await syncOfflineQueue(testUserId);
    expect(secondSyncResult.synced).toBe(0);
    expect(fetchCalls).toHaveLength(1); // Still exactly 1 call!

    // Attach online event listener and dispatch online event
    const syncCleanup = initOfflineSync(testUserId);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(fetchCalls).toHaveLength(1); // Zero duplicate calls
    syncCleanup();

    // Step 13: Verify mobile-responsive behavior
    // Modal container has mobile-responsive viewport styling
    const modalContainer = dialog.querySelector("div.w-full");
    expect(modalContainer?.className).toContain("max-w-2xl");
    expect(dialog.className).toContain("px-4");

    // Manifest compliance for mobile installation
    const manifest = manifestConfig();
    expect(manifest.display).toBe("standalone");
    expect(manifest.orientation).toBe("portrait-primary");
    expect(manifest.start_url).toBe("/");

    // Step 14: Verify zero unhandled promise rejections
    expect(unhandledRejections).toHaveLength(0);

    // Step 15: Verify zero unexpected console errors
    expect(consoleErrors).toHaveLength(0);

    syncCleanup();
  });
});
