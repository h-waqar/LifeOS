import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ScoreBadge, EnergyBadge } from "@/components/ui/badge";
import { QuickCaptureModal } from "@/components/quick-capture-modal";

describe("Plan 02-01: Task UI Interaction & Badges Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("ScoreBadge Component", () => {
    it("returns null when score is undefined or null", () => {
      const { container: c1 } = render(<ScoreBadge score={undefined} />);
      expect(c1.firstChild).toBeNull();

      const { container: c2 } = render(<ScoreBadge score={null} />);
      expect(c2.firstChild).toBeNull();
    });

    it("renders critical tier (destructive) for score >= 150", () => {
      render(<ScoreBadge score={180} />);
      const badge = screen.getByTitle("Priority Score (Critical)");
      expect(badge).toBeDefined();
      expect(badge.textContent).toBe("180");
    });

    it("renders high tier (warning) for score between 100 and 149", () => {
      render(<ScoreBadge score={125} />);
      const badge = screen.getByTitle("Priority Score (High)");
      expect(badge).toBeDefined();
      expect(badge.textContent).toBe("125");
    });

    it("renders medium tier (info) for score between 50 and 99", () => {
      render(<ScoreBadge score={75} />);
      const badge = screen.getByTitle("Priority Score (Medium)");
      expect(badge).toBeDefined();
      expect(badge.textContent).toBe("75");
    });

    it("renders low tier (secondary) for score < 50", () => {
      render(<ScoreBadge score={20} />);
      const badge = screen.getByTitle("Priority Score (Low)");
      expect(badge).toBeDefined();
      expect(badge.textContent).toBe("20");
    });
  });

  describe("EnergyBadge Component", () => {
    it("returns null when energy is undefined or null", () => {
      const { container: c1 } = render(<EnergyBadge energy={undefined} />);
      expect(c1.firstChild).toBeNull();

      const { container: c2 } = render(<EnergyBadge energy={null} />);
      expect(c2.firstChild).toBeNull();
    });

    it("renders High Energy variant", () => {
      render(<EnergyBadge energy="high" />);
      expect(screen.getByText("⚡ High Energy")).toBeDefined();
    });

    it("renders Medium Energy variant", () => {
      render(<EnergyBadge energy="medium" />);
      expect(screen.getByText("⚡ Medium Energy")).toBeDefined();
    });

    it("renders Low Energy variant", () => {
      render(<EnergyBadge energy="low" />);
      expect(screen.getByText("☕ Low Energy")).toBeDefined();
    });
  });

  describe("QuickCaptureModal Component", () => {
    it("renders nothing when isOpen is false", () => {
      const { container } = render(
        <QuickCaptureModal isOpen={false} onClose={vi.fn()} />
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders modal dialog with accessible attributes when isOpen is true", () => {
      render(<QuickCaptureModal isOpen={true} onClose={vi.fn()} />);
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.getAttribute("aria-labelledby")).toBe("quick-capture-title");
      expect(screen.getByText("Universal Quick Capture")).toBeDefined();
    });

    it("parses syntax tokens dynamically and renders attribute pills", () => {
      render(<QuickCaptureModal isOpen={true} onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText(/e\.g\. Write architecture brief/i);

      fireEvent.change(input, {
        target: {
          value: "Refactor auth engine !critical ^2026-10-01 @high #Platform ~45m +security +auth",
        },
      });

      // Check parsed attribute pills
      expect(screen.getByText("Refactor auth engine")).toBeDefined();
      expect(screen.getByText("Critical")).toBeDefined();
      expect(screen.getByText("⚡ High Energy")).toBeDefined();
      expect(screen.getByText("Due: 2026-10-01")).toBeDefined();
      expect(screen.getByText("Platform")).toBeDefined();
      expect(screen.getByText("45m")).toBeDefined();
      expect(screen.getByText("security")).toBeDefined();
      expect(screen.getByText("auth")).toBeDefined();
    });

    it("dismisses on Escape key press", () => {
      const handleClose = vi.fn();
      render(<QuickCaptureModal isOpen={true} onClose={handleClose} />);

      fireEvent.keyDown(window, { key: "Escape" });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("dismisses on Cancel button click", () => {
      const handleClose = vi.fn();
      render(<QuickCaptureModal isOpen={true} onClose={handleClose} />);

      const cancelBtn = screen.getByRole("button", { name: /cancel/i });
      fireEvent.click(cancelBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("submits quick-capture input to /api/tasks/quick-capture and notifies callback", async () => {
      const handleClose = vi.fn();
      const handleTaskCreated = vi.fn();

      const fakeTask = {
        id: "task-123",
        title: "Deploy pipeline",
        priority: "high",
        status: "todo",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ task: fakeTask }),
      });
      global.fetch = mockFetch;

      render(
        <QuickCaptureModal
          isOpen={true}
          onClose={handleClose}
          onTaskCreated={handleTaskCreated}
        />
      );

      const input = screen.getByPlaceholderText(/e\.g\. Write architecture brief/i);
      fireEvent.change(input, { target: { value: "Deploy pipeline !high" } });

      const submitBtn = screen.getByRole("button", { name: /capture task/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/tasks/quick-capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw: "Deploy pipeline !high" }),
        });
        expect(handleTaskCreated).toHaveBeenCalledWith(fakeTask);
        expect(handleClose).toHaveBeenCalledTimes(1);
      });
    });

    it("displays error banner when capture API returns error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Rate limit exceeded" }),
      });
      global.fetch = mockFetch;

      render(<QuickCaptureModal isOpen={true} onClose={vi.fn()} />);

      const input = screen.getByPlaceholderText(/e\.g\. Write architecture brief/i);
      fireEvent.change(input, { target: { value: "Fail capture" } });

      const submitBtn = screen.getByRole("button", { name: /capture task/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("Rate limit exceeded")).toBeDefined();
      });
    });
  });
});
