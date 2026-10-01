import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppShell } from "@/components/app-shell";
import { QuickCaptureModal } from "@/components/quick-capture-modal";
import { VoiceDictationButton } from "@/components/voice/voice-dictation-button";

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "usr_mock_a11y_123",
        name: "Accessibility Tester",
        email: "a11y@lifeos.dev",
      },
    },
    isPending: false,
  }),
  signOut: vi.fn(),
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    theme: "dark",
    resolvedTheme: "dark",
    toggleTheme: vi.fn(),
    setTheme: vi.fn(),
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/notifications/notification-center", () => ({
  NotificationCenter: () => <div data-testid="notification-center-mock" />,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("Plan 19-02: Native Screen-Reader Accessibility, Auditory Traversal & Semantic ARIA Hardening", () => {
  describe("1. Accessible Landmarks & Skip Link (QA-04)", () => {
    it("renders an accessible Skip to Main Content link pointing to #main-content", () => {
      render(
        <AppShell>
          <div>Page Content</div>
        </AppShell>
      );

      const skipLink = screen.getByRole("link", { name: /skip to main content/i });
      expect(skipLink).toBeDefined();
      expect(skipLink.getAttribute("href")).toBe("#main-content");
      expect(skipLink.className).toContain("sr-only");
      expect(skipLink.className).toContain("focus:not-sr-only");
    });

    it("renders semantic landmarks with descriptive ARIA labels to prevent auditory traps", () => {
      render(
        <AppShell>
          <div>Page Content</div>
        </AppShell>
      );

      const mainLandmark = screen.getByRole("main");
      expect(mainLandmark.id).toBe("main-content");
      expect(mainLandmark.getAttribute("tabindex")).toBe("-1");

      const bannerLandmark = screen.getByRole("banner");
      expect(bannerLandmark).toBeDefined();

      const navs = screen.getAllByRole("navigation");
      const navLabels = navs.map((nav) => nav.getAttribute("aria-label"));
      expect(navLabels).toContain("Desktop Navigation");
      expect(navLabels).toContain("Mobile Bottom Navigation");

      const sidebarAside = screen.getByTestId("sidebar");
      expect(sidebarAside.getAttribute("aria-label")).toBe("Sidebar Navigation");
    });
  });

  describe("2. Modal Dialog Focus Containment & Trapping (QA-04)", () => {
    let triggerButton: HTMLButtonElement;

    beforeEach(() => {
      triggerButton = document.createElement("button");
      triggerButton.textContent = "Open Quick Capture";
      document.body.appendChild(triggerButton);
      triggerButton.focus();
    });

    afterEach(() => {
      if (document.body.contains(triggerButton)) {
        document.body.removeChild(triggerButton);
      }
    });

    it("has WAI-ARIA dialog semantics and links title with aria-labelledby", () => {
      render(<QuickCaptureModal isOpen={true} onClose={vi.fn()} />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.getAttribute("aria-labelledby")).toBe("quick-capture-title");

      const title = screen.getByText("Universal Quick Capture");
      expect(title.id).toBe("quick-capture-title");
    });

    it("dismisses on Escape key without executing mutations", () => {
      const handleClose = vi.fn();
      render(<QuickCaptureModal isOpen={true} onClose={handleClose} />);

      fireEvent.keyDown(window, { key: "Escape" });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("traps focus inside the dialog when Tab / Shift+Tab is pressed", async () => {
      render(<QuickCaptureModal isOpen={true} onClose={vi.fn()} />);

      const dialog = screen.getByRole("dialog");
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      const focusableArray = Array.from(focusable);
      expect(focusableArray.length).toBeGreaterThan(1);

      const firstEl = focusableArray[0];
      const lastEl = focusableArray[focusableArray.length - 1];

      // Tab on last element should cycle to first element
      lastEl.focus();
      expect(document.activeElement).toBe(lastEl);

      fireEvent.keyDown(window, { key: "Tab", shiftKey: false });
      expect(document.activeElement).toBe(firstEl);

      // Shift+Tab on first element should cycle to last element
      firstEl.focus();
      expect(document.activeElement).toBe(firstEl);

      fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(lastEl);
    });

    it("restores focus to the triggering element when modal closes", () => {
      triggerButton.focus();
      expect(document.activeElement).toBe(triggerButton);

      const { rerender } = render(
        <QuickCaptureModal isOpen={true} onClose={vi.fn()} />
      );

      // Modal open saves trigger element
      rerender(<QuickCaptureModal isOpen={false} onClose={vi.fn()} />);

      // Focus should be restored back to triggerButton
      expect(document.activeElement).toBe(triggerButton);
    });
  });

  describe("3. Accessible Form Controls & Live Error Regions (QA-04)", () => {
    it("provides accessible name for quick capture input", () => {
      render(<QuickCaptureModal isOpen={true} onClose={vi.fn()} />);

      const input = screen.getByRole("textbox", { name: /quick capture task input/i });
      expect(input).toBeDefined();
    });

    it("announces errors in an assertive live region for non-visual screen readers", async () => {
      render(<QuickCaptureModal isOpen={true} onClose={vi.fn()} />);

      const input = screen.getByRole("textbox", { name: /quick capture task input/i });
      fireEvent.change(input, { target: { value: "Fail task" } });

      // Mock submit failure
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Validation failed: invalid title" }),
      });

      const submitBtn = screen.getByRole("button", { name: /capture task/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        const alertRegion = screen.getByRole("alert");
        expect(alertRegion).toBeDefined();
        expect(alertRegion.getAttribute("aria-live")).toBe("assertive");
        expect(alertRegion.textContent).toContain("Validation failed");
      });
    });
  });

  describe("4. Screen Reader Voice Dictation Feedback (QA-04)", () => {
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "en-US";
      onstart: (() => void) | null = null;
      onresult: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        if (this.onstart) this.onstart();
      }
      stop() {
        if (this.onend) this.onend();
      }
      abort() {
        if (this.onend) this.onend();
      }
    }

    it("renders dynamic aria-pressed and aria-live status announcement when supported", () => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      render(<VoiceDictationButton />);

      const btn = screen.getByRole("button");
      expect(btn.getAttribute("aria-pressed")).toBe("false");
      expect(btn.getAttribute("aria-label")).toBe("Start voice dictation");

      const statusAnnouncement = screen.getByRole("status");
      expect(statusAnnouncement).toBeDefined();
      expect(statusAnnouncement.getAttribute("aria-live")).toBe("polite");
      expect(statusAnnouncement.textContent).toContain("Voice dictation inactive");
    });

    it("renders accessible status announcement when speech recognition is unsupported", () => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;

      render(<VoiceDictationButton />);

      const btn = screen.getByRole("button");
      expect(btn.getAttribute("aria-disabled")).toBe("true");
      expect(btn.getAttribute("aria-label")).toBe("Voice dictation unsupported");

      const statusAnnouncement = screen.getByRole("status");
      expect(statusAnnouncement).toBeDefined();
      expect(statusAnnouncement.textContent).toContain("unsupported");
    });
  });
});
