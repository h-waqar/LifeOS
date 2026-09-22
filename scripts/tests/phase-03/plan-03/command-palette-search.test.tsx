import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CommandPalette } from "@/components/command-palette";
import type { SearchResponseDTO } from "@/types";

// Mock router
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock theme provider
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    resolvedTheme: "dark",
    toggleTheme: vi.fn(),
  }),
}));

// Mock auth-client
vi.mock("@/lib/auth-client", () => ({
  signOut: vi.fn(),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Phase 3 Plan 03-03: Command Palette Unified Search Integration (UI)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("1. Renders static navigation commands and quick actions when open and query is empty", () => {
    render(<CommandPalette open={true} />);

    expect(screen.getByTestId("command-palette-dialog")).toBeDefined();
    expect(screen.getByTestId("command-palette-input")).toBeDefined();
    expect(screen.getByText("Go to Dashboard")).toBeDefined();
    expect(screen.getByText("Go to Notes")).toBeDefined();
    expect(screen.getByText("Go to People")).toBeDefined();
    expect(screen.getByText("Go to Tasks")).toBeDefined();
    expect(screen.getByText("Start Morning Routine")).toBeDefined();
  });

  it("2. Triggers debounced fetch to /api/search and renders categorized cross-domain results", async () => {
    const mockSearchResults: SearchResponseDTO = {
      query: "quantum",
      total: 3,
      byType: {
        note: 1,
        task: 1,
        project: 1,
        goal: 0,
        person: 0,
        learning: 0,
      },
      results: [
        {
          id: "note-1",
          type: "note",
          title: "Quantum Architecture Note",
          subtitle: "Career • Research",
          href: "/notes?id=note-1",
          score: 15.5,
          updatedAt: new Date().toISOString(),
        },
        {
          id: "task-1",
          type: "task",
          title: "Quantum Compiler Task",
          subtitle: "In Progress • High",
          href: "/tasks?id=task-1",
          score: 12.0,
          updatedAt: new Date().toISOString(),
        },
        {
          id: "proj-1",
          type: "project",
          title: "Quantum OS Project",
          subtitle: "Active • Career",
          href: "/projects?id=proj-1",
          score: 10.0,
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockSearchResults }),
    });
    global.fetch = mockFetch as any;

    render(<CommandPalette open={true} />);

    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "quantum" } });

    await waitFor(
      () => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/search?q=quantum")
        );
      },
      { timeout: 1000 }
    );

    await waitFor(() => {
      expect(screen.getByText("Quantum Architecture Note")).toBeDefined();
      expect(screen.getByText("Quantum Compiler Task")).toBeDefined();
      expect(screen.getByText("Quantum OS Project")).toBeDefined();
    });

    expect(screen.getByTestId("search-result-note-note-1")).toBeDefined();
    expect(screen.getByTestId("search-result-task-task-1")).toBeDefined();
    expect(screen.getByTestId("search-result-project-proj-1")).toBeDefined();
  });

  it("3. Navigates to entity target href and closes palette when result item is selected", async () => {
    const mockSearchResults: SearchResponseDTO = {
      query: "alice",
      total: 1,
      byType: { note: 0, task: 0, project: 0, goal: 0, person: 1, learning: 0 },
      results: [
        {
          id: "person-42",
          type: "person",
          title: "Dr. Alice Quantum",
          subtitle: "Scientist at Labs (Colleague)",
          href: "/people?id=person-42",
          score: 18.0,
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockSearchResults }),
    }) as any;

    const onOpenChange = vi.fn();
    render(<CommandPalette open={true} onOpenChange={onOpenChange} />);

    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "alice" } });

    await waitFor(() => {
      expect(screen.getByText("Dr. Alice Quantum")).toBeDefined();
    });

    const item = screen.getByTestId("search-result-person-person-42");
    fireEvent.click(item);

    expect(mockPush).toHaveBeenCalledWith("/people?id=person-42");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("4. Displays empty state message when search yields no matches", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          query: "unknownterm",
          total: 0,
          byType: { note: 0, task: 0, project: 0, goal: 0, person: 0 },
          results: [],
        },
      }),
    }) as any;

    render(<CommandPalette open={true} />);

    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "unknownterm" } });

    await waitFor(() => {
      expect(screen.getByText('No results found for "unknownterm".')).toBeDefined();
    });
  });

  it("5. Handles fetch failure gracefully by displaying error message", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as any;

    render(<CommandPalette open={true} />);

    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "failingquery" } });

    await waitFor(() => {
      expect(screen.getByTestId("command-palette-error")).toBeDefined();
      expect(screen.getByText("Failed to fetch search results")).toBeDefined();
    });
  });

  it("6. Preserves existing static command execution (e.g. Go to Tasks)", () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette open={true} onOpenChange={onOpenChange} />);

    const tasksCmd = screen.getByTestId("cmd-tasks");
    fireEvent.click(tasksCmd);

    expect(mockPush).toHaveBeenCalledWith("/tasks");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
