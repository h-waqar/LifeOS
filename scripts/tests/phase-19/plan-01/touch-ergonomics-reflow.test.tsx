import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import * as fs from "node:fs";
import * as path from "node:path";
import { viewport } from "@/app/layout";
import { Button } from "@/components/ui/button";
import { VoiceDictationButton } from "@/components/voice/voice-dictation-button";
import { QuickCaptureModal } from "@/components/quick-capture-modal";
import { AppShell } from "@/components/app-shell";

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "usr_mock_mobile_123",
        name: "Mobile Tester",
        email: "mobile@lifeos.dev",
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

describe("Plan 19-01: Physical Handheld & Tablet Touch Ergonomics, Tap Target Bounds & Safe-Area Reflow", () => {
  describe("1. Viewport & Safe-Area Configuration (QA-01, QA-03)", () => {
    it("exports Next.js 15 viewport configuration with viewport-fit cover for edge-to-edge display", () => {
      expect(viewport).toBeDefined();
      expect(viewport.viewportFit).toBe("cover");
      expect(viewport.width).toBe("device-width");
      expect(viewport.initialScale).toBe(1);
      expect(viewport.maximumScale).toBe(5);
      expect(viewport.themeColor).toBe("#09090b");
    });

    it("includes safe-area insets and momentum scrolling utilities in globals.css", () => {
      const cssPath = path.resolve(process.cwd(), "src/app/globals.css");
      const cssContent = fs.readFileSync(cssPath, "utf-8");

      expect(cssContent).toContain("safe-bottom");
      expect(cssContent).toContain("env(safe-area-inset-bottom");
      expect(cssContent).toContain("safe-top");
      expect(cssContent).toContain("env(safe-area-inset-top");
      expect(cssContent).toContain("-webkit-overflow-scrolling: touch");
      expect(cssContent).toContain("touch-target");
      expect(cssContent).toContain("overscroll-behavior-y: contain");
    });
  });

  describe("2. Tap Target Bounds (>=44px) Verification (QA-03)", () => {
    it("renders Button with touch variants guaranteeing >=44px bounding boxes", () => {
      render(
        <div>
          <Button size="touch" data-testid="touch-btn">
            Touch Action
          </Button>
          <Button size="touch-icon" data-testid="touch-icon-btn">
            +
          </Button>
        </div>
      );

      const touchBtn = screen.getByTestId("touch-btn");
      const touchIconBtn = screen.getByTestId("touch-icon-btn");

      expect(touchBtn.className).toContain("min-h-[44px]");
      expect(touchBtn.className).toContain("min-w-[44px]");
      expect(touchIconBtn.className).toContain("min-h-[44px]");
      expect(touchIconBtn.className).toContain("min-w-[44px]");
    });

    it("ensures VoiceDictationButton meets >=44px minimum tap target guidelines", () => {
      render(<VoiceDictationButton data-testid="voice-btn" />);
      const btn = screen.getByRole("button");
      expect(btn.className).toContain("min-h-[44px]");
      expect(btn.className).toContain("min-w-[44px]");
    });

    it("ensures QuickCaptureModal controls have >=44px touch target bounds", () => {
      render(<QuickCaptureModal isOpen={true} onClose={vi.fn()} />);

      const closeBtn = screen.getByRole("button", { name: /close/i });
      expect(closeBtn.className).toContain("min-h-[44px]");
      expect(closeBtn.className).toContain("min-w-[44px]");

      const aiToggleBtn = screen.getByRole("button", { name: /ai mode/i });
      expect(aiToggleBtn.className).toContain("min-h-[44px]");

      const cancelBtn = screen.getByRole("button", { name: /cancel/i });
      expect(cancelBtn.className).toContain("min-h-[44px]");
      expect(cancelBtn.className).toContain("min-w-[44px]");

      const captureBtn = screen.getByRole("button", { name: /capture task/i });
      expect(captureBtn.className).toContain("min-h-[44px]");
      expect(captureBtn.className).toContain("min-w-[44px]");
    });
  });

  describe("3. Mobile Bottom Navigation & Thumb Zone Ergonomics (QA-01, QA-03)", () => {
    it("renders mobile bottom navigation bar with natural thumb zone destinations", () => {
      render(
        <AppShell>
          <div data-testid="content">Dashboard Content</div>
        </AppShell>
      );

      const bottomNav = screen.getByTestId("mobile-bottom-nav");
      expect(bottomNav).toBeDefined();
      expect(bottomNav.getAttribute("aria-label")).toBe("Mobile Bottom Navigation");
      expect(bottomNav.className).toContain("md:hidden");
      expect(bottomNav.className).toContain("fixed");
      expect(bottomNav.className).toContain("bottom-0");

      // Verify thumb-reachable targets
      const dashboardLink = screen.getByTestId("bottom-nav-dashboard");
      expect(dashboardLink.getAttribute("href")).toBe("/dashboard");
      expect(dashboardLink.className).toContain("min-h-[44px]");
      expect(dashboardLink.className).toContain("min-w-[44px]");

      const tasksLink = screen.getByTestId("bottom-nav-tasks");
      expect(tasksLink.getAttribute("href")).toBe("/tasks");
      expect(tasksLink.className).toContain("min-h-[44px]");
      expect(tasksLink.className).toContain("min-w-[44px]");

      const quickCaptureBtn = screen.getByTestId("bottom-nav-quick-capture");
      expect(quickCaptureBtn).toBeDefined();
      expect(quickCaptureBtn.className).toContain("min-h-[48px]");
      expect(quickCaptureBtn.className).toContain("min-w-[48px]");

      const assistantBtn = screen.getByTestId("bottom-nav-assistant");
      expect(assistantBtn).toBeDefined();
      expect(assistantBtn.className).toContain("min-h-[44px]");
      expect(assistantBtn.className).toContain("min-w-[44px]");

      const menuBtn = screen.getByTestId("bottom-nav-menu");
      expect(menuBtn).toBeDefined();
      expect(menuBtn.className).toContain("min-h-[44px]");
      expect(menuBtn.className).toContain("min-w-[44px]");
    });

    it("reserves bottom padding on main body so content is not obscured by bottom bar", () => {
      render(
        <AppShell>
          <div data-testid="content">Dashboard Content</div>
        </AppShell>
      );

      const mainEl = screen.getByRole("main");
      expect(mainEl.className).toContain("pb-24");
      expect(mainEl.className).toContain("md:pb-8");
      expect(mainEl.className).toContain("touch-momentum");
    });
  });

  describe("4. Tablet Multitasking & Split-View Reflow (QA-02)", () => {
    it("renders desktop sidebar with collapsible transition classes for tablet viewports", () => {
      render(
        <AppShell>
          <div>Tablet Test</div>
        </AppShell>
      );

      const sidebar = screen.getByTestId("sidebar");
      expect(sidebar.className).toContain("hidden");
      expect(sidebar.className).toContain("md:flex");
      expect(sidebar.className).toContain("transition-all");
    });

    it("handles modal container overflow gracefully for on-screen virtual keyboard", () => {
      render(<QuickCaptureModal isOpen={true} onClose={vi.fn()} />);

      const dialog = screen.getByRole("dialog");
      expect(dialog.className).toContain("safe-bottom");
      expect(dialog.className).toContain("safe-top");

      // Verify modal card has viewport-bounded max height and scroll
      const card = dialog.firstElementChild as HTMLElement;
      expect(card.className).toContain("max-h-[calc(100dvh-3rem)]");
      expect(card.className).toContain("overflow-y-auto");
    });
  });
});
