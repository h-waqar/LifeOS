import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import PeoplePage from "@/app/people/page";
import type { PersonDTO, PersonDetailDTO, FollowUpRemindersDTO } from "@/types";

const MOCK_SESSION = {
  data: { user: { id: "user_test_people_ui", name: "People UI Tester", email: "tester@example.com" } },
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
  }),
  usePathname: () => "/people",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const mockPerson: PersonDTO = {
  id: "person-test-123",
  userId: "user_test_people_ui",
  name: "Ada Lovelace",
  relationshipType: "colleague",
  company: "Analytical Engine Labs",
  role: "Lead Mathematician",
  email: "ada@example.com",
  phone: "+1-555-0100",
  contactInfo: {},
  tags: ["computing", "pioneer"],
  notes: "First programmer in history",
  isArchived: false,
  lastInteractionDate: "2026-09-15T12:00:00.000Z",
  nextFollowUpDate: "2026-09-25T12:00:00.000Z",
  followUpStatus: "upcoming",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-15T12:00:00.000Z",
};

const mockPersonDetail: PersonDetailDTO = {
  ...mockPerson,
  interactions: [
    {
      id: "interaction-test-1",
      userId: "user_test_people_ui",
      personId: "person-test-123",
      date: "2026-09-15T12:00:00.000Z",
      channel: "meeting",
      summary: "Discussed Bernoulli numbers algorithm",
      nextFollowUpDate: "2026-09-25T12:00:00.000Z",
      createdAt: "2026-09-15T12:00:00.000Z",
      updatedAt: "2026-09-15T12:00:00.000Z",
    },
  ],
  linkedTasks: [],
  linkedProjects: [],
  linkedNotes: [],
};

const mockReminders: FollowUpRemindersDTO = {
  overdue: [],
  today: [],
  upcoming: [],
  totalReminders: 0,
};

describe("Plan 03-02: People UI Permanent Deletion Behavior", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("sends DELETE request with ?hard=true when user confirms deletion", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const mockFetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (url.includes("/api/people/reminders")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockReminders,
        });
      }
      if (url === `/api/people/${mockPerson.id}?hard=true` && opts?.method === "DELETE") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: "Contact permanently deleted" }),
        });
      }
      if (url === `/api/people/${mockPerson.id}`) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: mockPersonDetail, person: mockPersonDetail }),
        });
      }
      if (url.startsWith("/api/people")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [mockPerson], people: [mockPerson] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    });
    global.fetch = mockFetch;

    render(<PeoplePage />);

    // Wait for initial contacts to load
    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeDefined();
    });

    // Open detail modal by clicking View Details button
    const viewDetailBtn = screen.getByTestId(`view-detail-btn-${mockPerson.id}`);
    fireEvent.click(viewDetailBtn);

    // Verify detail modal opened and delete button is visible
    await waitFor(() => {
      expect(screen.getByTestId("modal-delete-person-btn")).toBeDefined();
    });

    // Click Delete Contact
    const deleteBtn = screen.getByTestId("modal-delete-person-btn");
    fireEvent.click(deleteBtn);

    // Verify window.confirm was called with proper warning message
    expect(confirmSpy).toHaveBeenCalledWith(
      "Are you sure you want to delete Ada Lovelace? This will remove all logged interactions."
    );

    // Verify fetch was called with ?hard=true
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/people/${mockPerson.id}?hard=true`,
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });
  });

  it("does NOT send DELETE request when user cancels confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/people/reminders")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockReminders,
        });
      }
      if (url === `/api/people/${mockPerson.id}`) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: mockPersonDetail, person: mockPersonDetail }),
        });
      }
      if (url.startsWith("/api/people")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [mockPerson], people: [mockPerson] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    });
    global.fetch = mockFetch;

    render(<PeoplePage />);

    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeDefined();
    });

    const viewDetailBtn = screen.getByTestId(`view-detail-btn-${mockPerson.id}`);
    fireEvent.click(viewDetailBtn);

    await waitFor(() => {
      expect(screen.getByTestId("modal-delete-person-btn")).toBeDefined();
    });

    const deleteBtn = screen.getByTestId("modal-delete-person-btn");
    fireEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalled();

    // Verify DELETE fetch was NOT called
    const deleteCalls = mockFetch.mock.calls.filter(
      (call: any[]) => call[1]?.method === "DELETE"
    );
    expect(deleteCalls).toHaveLength(0);
  });
});
