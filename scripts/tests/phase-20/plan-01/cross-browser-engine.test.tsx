import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import * as fs from "node:fs";
import * as path from "node:path";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { VoiceDictationButton } from "@/components/voice/voice-dictation-button";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { AppShell } from "@/components/app-shell";

// Mock auth client
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "usr_mock_browser_qa",
        name: "Cross Browser Tester",
        email: "qa-browser@lifeos.dev",
      },
    },
    isPending: false,
  }),
  signOut: vi.fn(),
}));

// Mock notifications
vi.mock("@/components/notifications/notification-center", () => ({
  NotificationCenter: () => <div data-testid="notification-center-mock" />,
}));

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock Sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function ConsumerComponent() {
  const { theme, resolvedTheme, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-val">{theme}</span>
      <span data-testid="resolved-theme-val">{resolvedTheme}</span>
      <button data-testid="toggle-theme-btn" onClick={toggleTheme}>
        Toggle
      </button>
      <button data-testid="set-light-btn" onClick={() => setTheme("light")}>
        Set Light
      </button>
    </div>
  );
}

describe("Plan 20-01: Cross-Browser Engine Compatibility & Rendering/Interaction Hardening (QA-05)", () => {
  const originalLocalStorage = window.localStorage;
  const originalSpeechRecognition = (window as any).SpeechRecognition;
  const originalWebkitSpeechRecognition = (window as any).webkitSpeechRecognition;
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({}),
      })
    );
  });

  afterEach(() => {
    // Restore globals
    global.fetch = originalFetch;
    Object.defineProperty(window, "localStorage", {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    (window as any).SpeechRecognition = originalSpeechRecognition;
    (window as any).webkitSpeechRecognition = originalWebkitSpeechRecognition;
    vi.restoreAllMocks();
  });

  describe("1. CSS Engine Rules & Scrollbar Normalization (QA-05)", () => {
    const globalsCssPath = path.resolve(process.cwd(), "src/app/globals.css");
    const globalsCss = fs.readFileSync(globalsCssPath, "utf-8");

    it("declares standard Firefox scrollbar properties (scrollbar-width and scrollbar-color)", () => {
      expect(globalsCss).toContain("scrollbar-width: thin");
      expect(globalsCss).toContain("scrollbar-color:");
    });

    it("declares WebKit/Blink scrollbar pseudo-elements for Chromium, Edge, and Safari", () => {
      expect(globalsCss).toContain("::-webkit-scrollbar");
      expect(globalsCss).toContain("::-webkit-scrollbar-thumb");
      expect(globalsCss).toContain("::-webkit-scrollbar-track");
    });

    it("declares @supports fallback for environments lacking backdrop-filter support", () => {
      expect(globalsCss).toContain("@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px)))");
      expect(globalsCss).toContain(".backdrop-blur");
    });
  });

  describe("2. Safari WebKit Storage Resiliency & Private Browsing (QA-05)", () => {
    it("handles Safari Private Browsing SecurityError on localStorage.getItem without crashing", () => {
      // Simulate Safari private mode throwing SecurityError
      Object.defineProperty(window, "localStorage", {
        value: {
          getItem: vi.fn(() => {
            const err = new Error("The operation is insecure.");
            err.name = "SecurityError";
            throw err;
          }),
          setItem: vi.fn(() => {
            const err = new Error("The operation is insecure.");
            err.name = "SecurityError";
            throw err;
          }),
          removeItem: vi.fn(),
          clear: vi.fn(),
          key: vi.fn(),
          length: 0,
        },
        writable: true,
        configurable: true,
      });

      render(
        <ThemeProvider>
          <ConsumerComponent />
        </ThemeProvider>
      );

      // Successfully mounts with default dark theme despite storage security rejection
      expect(screen.getByTestId("theme-val").textContent).toBe("dark");
      expect(screen.getByTestId("resolved-theme-val").textContent).toBe("dark");
    });

    it("handles Safari QuotaExceededError or storage write failure during theme toggle without crashing", () => {
      // Storage readable but throws QuotaExceededError on setItem
      Object.defineProperty(window, "localStorage", {
        value: {
          getItem: vi.fn(() => "dark"),
          setItem: vi.fn(() => {
            const err = new Error("QuotaExceededError: DomException 22");
            err.name = "QuotaExceededError";
            throw err;
          }),
          removeItem: vi.fn(),
          clear: vi.fn(),
          key: vi.fn(),
          length: 0,
        },
        writable: true,
        configurable: true,
      });

      render(
        <ThemeProvider>
          <ConsumerComponent />
        </ThemeProvider>
      );

      const toggleBtn = screen.getByTestId("toggle-theme-btn");

      // Toggling theme should update in-memory state and DOM class despite storage error
      act(() => {
        fireEvent.click(toggleBtn);
      });

      expect(screen.getByTestId("theme-val").textContent).toBe("light");
      expect(screen.getByTestId("resolved-theme-val").textContent).toBe("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  describe("3. Web Speech API Cross-Engine Detection & Degradation (QA-05)", () => {
    it("Gecko/Firefox: gracefully handles absence of SpeechRecognition and webkitSpeechRecognition", () => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;

      const onErrorMock = vi.fn();

      function SpeechConsumer() {
        const { isSupported, error, startListening } = useSpeechRecognition({
          onError: onErrorMock,
        });

        return (
          <div>
            <span data-testid="is-supported">{String(isSupported)}</span>
            <span data-testid="error-message">{error || "none"}</span>
            <button data-testid="start-btn" onClick={startListening}>
              Start
            </button>
          </div>
        );
      }

      render(<SpeechConsumer />);

      expect(screen.getByTestId("is-supported").textContent).toBe("false");

      act(() => {
        fireEvent.click(screen.getByTestId("start-btn"));
      });

      expect(onErrorMock).toHaveBeenCalledWith(
        "Speech recognition is not supported in this browser."
      );
      expect(screen.getByTestId("error-message").textContent).toContain("not supported");
    });

    it("Gecko/Firefox: VoiceDictationButton renders disabled state with accessible live region", () => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;

      render(<VoiceDictationButton />);

      const button = screen.getByRole("button", { name: /voice dictation unsupported/i });
      expect(button).toBeDefined();
      expect(button.hasAttribute("disabled")).toBe(true);
      expect(button.getAttribute("aria-disabled")).toBe("true");

      const status = screen.getByRole("status");
      expect(status.textContent).toContain("unsupported");
    });

    it("WebKit/Safari: detects prefixed webkitSpeechRecognition constructor", () => {
      delete (window as any).SpeechRecognition;

      class MockWebkitSpeechRecognition {
        continuous = false;
        interimResults = false;
        lang = "en-US";
        onstart: (() => void) | null = null;
        onresult: ((ev: any) => void) | null = null;
        onerror: ((ev: any) => void) | null = null;
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

      (window as any).webkitSpeechRecognition = MockWebkitSpeechRecognition;

      function SafariConsumer() {
        const { isSupported, isListening, startListening } = useSpeechRecognition();
        return (
          <div>
            <span data-testid="safari-supported">{String(isSupported)}</span>
            <span data-testid="safari-listening">{String(isListening)}</span>
            <button data-testid="safari-start" onClick={startListening}>
              Dictate
            </button>
          </div>
        );
      }

      render(<SafariConsumer />);

      expect(screen.getByTestId("safari-supported").textContent).toBe("true");

      act(() => {
        fireEvent.click(screen.getByTestId("safari-start"));
      });

      expect(screen.getByTestId("safari-listening").textContent).toBe("true");
    });
  });

  describe("4. Layout & Interaction Normalization across Engines (QA-05)", () => {
    it("renders AppShell navigation landmarks and mobile navigation consistently", () => {
      // Mock fetch for preferences
      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({}),
        })
      );

      render(
        <ThemeProvider>
          <AppShell>
            <div data-testid="page-content">Dashboard Content</div>
          </AppShell>
        </ThemeProvider>
      );

      // Semantic landmarks present
      expect(screen.getByRole("banner")).toBeDefined();
      expect(screen.getByRole("main")).toBeDefined();
      expect(screen.getByRole("navigation", { name: "Desktop Navigation" })).toBeDefined();
      expect(screen.getByRole("navigation", { name: "Mobile Bottom Navigation" })).toBeDefined();
      expect(screen.getByTestId("page-content")).toBeDefined();
    });
  });
});
