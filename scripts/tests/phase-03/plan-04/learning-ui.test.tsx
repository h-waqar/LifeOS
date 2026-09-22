import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import LearningPage from "@/app/learning/page";
import type { LearningItemDTO, LearningItemDetailDTO, LearningStatsDTO } from "@/types";

const MOCK_SESSION = {
  data: {
    user: {
      id: "user_test_learning_ui",
      name: "Learning UI Tester",
      email: "tester@example.com",
    },
  },
  isPending: false,
};

vi.mock("@/lib/auth-client", () => ({
  useSession: () => MOCK_SESSION,
  signOut: vi.fn(),
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    theme: "dark",
    resolvedTheme: "dark",
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
  }),
}));

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRefresh = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
  }),
  usePathname: () => "/learning",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const mockItem: LearningItemDTO = {
  id: "item-test-1",
  userId: "user_test_learning_ui",
  title: "Designing Data-Intensive Applications",
  type: "book",
  status: "in_progress",
  author: "Martin Kleppmann",
  url: "https://dataintensive.net",
  rating: 5,
  progress: 60,
  currentUnits: 360,
  totalUnits: 600,
  unitType: "pages",
  summary: "Comprehensive guide on distributed systems architectures.",
  keyTakeaways: ["Replication and partitioning are trade-offs."],
  tags: ["databases", "distributed-systems"],
  goalId: null,
  projectId: null,
  isArchived: false,
  completedAt: null,
  linkedNotesCount: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockItemDetail: LearningItemDetailDTO = {
  ...mockItem,
  linkedNotes: [
    {
      id: "note-1",
      userId: "user_test_learning_ui",
      title: "Chapter 5 Replication Notes",
      slug: "chapter-5-replication-notes",
      content: "Leader-follower replication details.",
      noteType: "learning",
      area: "career",
      tags: ["distributed-systems"],
      isPinned: false,
      isArchived: false,
      projectId: null,
      goalId: null,
      taskId: null,
      personId: null,
      learningId: "item-test-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
};

const mockStats: LearningStatsDTO = {
  totalItems: 3,
  activeCount: 1,
  completedCount: 2,
  averageProgress: 60,
  byType: {
    book: 1,
    course: 1,
    article: 1,
    podcast: 0,
    skill: 0,
    documentation: 0,
    other: 0,
  },
};

describe("Phase 3 Plan 03-04: Learning UI Component Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = url.toString();
      if (u.includes("/api/learning/stats")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: mockStats }),
        });
      }
      if (u.includes(`/api/learning/${mockItem.id}/notes`)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: mockItemDetail.linkedNotes }),
        });
      }
      if (u.includes(`/api/learning/${mockItem.id}`)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: mockItemDetail }),
        });
      }
      if (u.includes("/api/learning")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            learningItems: [mockItem],
            data: [mockItem],
            total: 1,
          }),
        });
      }
      if (u.includes("/api/goals")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ goals: [] }),
        });
      }
      if (u.includes("/api/projects")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ projects: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    }) as any;
  });

  afterEach(() => {
    cleanup();
  });

  it("1. Renders metrics summary cards and learning items list", async () => {
    render(<LearningPage />);

    // Check dashboard heading
    expect(screen.getByText("Learning System")).toBeDefined();

    // Wait for items to load
    await waitFor(() => {
      expect(
        screen.getByText("Designing Data-Intensive Applications")
      ).toBeDefined();
    });

    // Check author and units
    expect(screen.getByText("by Martin Kleppmann")).toBeDefined();
    expect(screen.getByText(/360 \/ 600 pages/)).toBeDefined();
  });

  it("2. Opens Inspector drawer when clicking an item card", async () => {
    render(<LearningPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Designing Data-Intensive Applications")
      ).toBeDefined();
    });

    const itemCard = screen.getByTestId(`learning-card-${mockItem.id}`);
    fireEvent.click(itemCard);

    // Inspector should open with details
    await waitFor(() => {
      expect(screen.getByText("Item Details")).toBeDefined();
      expect(screen.getByText(/Linked Notes \(1\)/)).toBeDefined();
      expect(screen.getByText("Chapter 5 Replication Notes")).toBeDefined();
    });
  });

  it("3. Opens Create Modal when clicking 'Add Learning Item'", async () => {
    render(<LearningPage />);

    const newBtn = screen.getByTestId("create-learning-item-btn");
    fireEvent.click(newBtn);

    await waitFor(() => {
      expect(screen.getByText("New Learning Item")).toBeDefined();
      expect(screen.getByTestId("modal-title-input")).toBeDefined();
    });
  });
});
