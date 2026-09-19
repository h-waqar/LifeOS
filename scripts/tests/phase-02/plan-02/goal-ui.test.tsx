import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AreaBadge, HorizonBadge } from "@/components/ui/badge";
import GoalsPage from "@/app/goals/page";

// Mock auth-client session
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: { user: { id: "user_123", name: "Test User", email: "test@example.com" } },
    isPending: false,
  }),
  signOut: vi.fn(),
}));

// Mock theme-provider
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    theme: "dark",
    resolvedTheme: "dark",
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
  }),
}));

// Mock Next.js navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: vi.fn(),
  }),
  usePathname: () => "/goals",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Plan 02-02: Goal UI Components & Page Interactions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("AreaBadge Component", () => {
    it("returns null when area is null or undefined", () => {
      const { container: c1 } = render(<AreaBadge area={undefined} />);
      expect(c1.firstChild).toBeNull();

      const { container: c2 } = render(<AreaBadge area={null} />);
      expect(c2.firstChild).toBeNull();
    });

    it("renders each of the life areas with appropriate variant label", () => {
      const { rerender } = render(<AreaBadge area="health" />);
      expect(screen.getByText("Health")).toBeDefined();

      rerender(<AreaBadge area="career" />);
      expect(screen.getByText("Career")).toBeDefined();

      rerender(<AreaBadge area="finance" />);
      expect(screen.getByText("Finance")).toBeDefined();

      rerender(<AreaBadge area="personal_development" />);
      expect(screen.getByText("Personal Dev")).toBeDefined();

      rerender(<AreaBadge area="relationships" />);
      expect(screen.getByText("Relationships")).toBeDefined();

      rerender(<AreaBadge area="general" />);
      expect(screen.getByText("General")).toBeDefined();
    });
  });

  describe("HorizonBadge Component", () => {
    it("returns null when horizon is null or undefined", () => {
      const { container: c1 } = render(<HorizonBadge horizon={undefined} />);
      expect(c1.firstChild).toBeNull();

      const { container: c2 } = render(<HorizonBadge horizon={null} />);
      expect(c2.firstChild).toBeNull();
    });

    it("renders Long-term, Medium-term, and Short-term horizons", () => {
      const { rerender } = render(<HorizonBadge horizon="long_term" />);
      expect(screen.getByText("Long-term (1-5y)")).toBeDefined();

      rerender(<HorizonBadge horizon="medium_term" />);
      expect(screen.getByText("Medium-term (Annual/Qtr)")).toBeDefined();

      rerender(<HorizonBadge horizon="short_term" />);
      expect(screen.getByText("Short-term (Monthly)")).toBeDefined();
    });
  });

  describe("Goals Page Dashboard & Interactions", () => {
    const fakeGoals = [
      {
        id: "goal-1",
        userId: "user_123",
        title: "Become Staff Engineer",
        description: "Scale impact across organization",
        horizon: "long_term",
        area: "career",
        status: "in_progress",
        priority: "high",
        metricType: "numeric",
        targetValue: 10,
        currentValue: 4,
        unit: "design docs",
        progress: 40,
        childGoalsCount: 2,
        linkedProjectsCount: 1,
        directTasksCount: 3,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-10T00:00:00.000Z",
      },
    ];

    it("renders goals dashboard with horizon tabs and goal card", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/goals")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ goals: fakeGoals }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      global.fetch = mockFetch;

      render(<GoalsPage />);

      // Verify header & tabs
      expect(screen.getByText("Goals Hierarchy")).toBeDefined();
      expect(screen.getByTestId("horizon-tab-all")).toBeDefined();
      expect(screen.getByTestId("horizon-tab-long_term")).toBeDefined();
      expect(screen.getByTestId("horizon-tab-medium_term")).toBeDefined();
      expect(screen.getByTestId("horizon-tab-short_term")).toBeDefined();

      // Wait for goal card to render
      await waitFor(() => {
        expect(screen.getByText("Become Staff Engineer")).toBeDefined();
        expect(screen.getByText("Scale impact across organization")).toBeDefined();
        expect(screen.getByText("40%")).toBeDefined(); // Rollup progress
        expect(screen.getByText(/4 \/ 10 design docs/i)).toBeDefined();
        expect(screen.getByText(/1 projects/i)).toBeDefined();
        expect(screen.getByText(/3 tasks/i)).toBeDefined();
        expect(screen.getByText(/2 sub-goals/i)).toBeDefined();
      });
    });

    it("filters goals when clicking a horizon tab", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ goals: [] }),
        });
      });
      global.fetch = mockFetch;

      render(<GoalsPage />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/goals");
      });

      const longTermTab = screen.getByTestId("horizon-tab-long_term");
      fireEvent.click(longTermTab);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/goals?horizon=long_term");
      });
    });

    it("opens create goal modal when New Goal button is clicked", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ goals: [] }),
      });
      global.fetch = mockFetch;

      render(<GoalsPage />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const newGoalBtn = screen.getByTestId("create-goal-btn");
      fireEvent.click(newGoalBtn);

      expect(screen.getByTestId("new-goal-title")).toBeDefined();
      expect(screen.getByTestId("new-goal-horizon")).toBeDefined();
      expect(screen.getByTestId("new-goal-area")).toBeDefined();
      expect(screen.getByTestId("new-goal-metric-type")).toBeDefined();
    });

    it("opens quick metric modal and updates metric value", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (opts?.method === "PATCH") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ goal: { ...fakeGoals[0], currentValue: 7 } }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ goals: fakeGoals }),
        });
      });
      global.fetch = mockFetch;

      render(<GoalsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("quick-metric-btn-goal-1")).toBeDefined();
      });

      // Click update metric button
      fireEvent.click(screen.getByTestId("quick-metric-btn-goal-1"));

      // Quick metric input should be open
      const metricInput = screen.getByTestId("quick-metric-input");
      expect(metricInput).toBeDefined();

      fireEvent.change(metricInput, { target: { value: "7" } });
      const submitBtn = screen.getByTestId("submit-quick-metric");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/goals/goal-1",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ currentValue: 7 }),
          })
        );
      });
    });
  });
});
