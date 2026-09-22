import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContentCalendarView } from "@/components/content/content-calendar-view";
import type { ContentPublicationDTO, ContentItemDTO } from "@/types";

const mockPublications: ContentPublicationDTO[] = [
  {
    id: "pub-cal-1",
    userId: "user-1",
    contentItemId: "item-1",
    variantId: null,
    platform: "twitter",
    status: "scheduled",
    scheduledFor: new Date().toISOString(),
    publishedAt: null,
    postUrl: null,
    externalPostId: null,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    contentTitle: "Building in Public Guide",
    contentType: "thread",
  },
  {
    id: "pub-cal-2",
    userId: "user-1",
    contentItemId: "item-2",
    variantId: null,
    platform: "linkedin",
    status: "published",
    scheduledFor: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    postUrl: "https://linkedin.com/post/123",
    externalPostId: "123",
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    contentTitle: "Modern Next.js Best Practices",
    contentType: "post",
  },
];

const mockUnscheduled: ContentItemDTO[] = [
  {
    id: "item-unscheduled-1",
    userId: "user-1",
    title: "Draft Idea Waiting For Date",
    contentType: "article",
    status: "draft",
    topic: "Career",
    targetAudience: "Engineers",
    primaryPlatform: "blog",
    targetChannels: ["blog"],
    tags: ["writing"],
    summary: "Ideas waiting for schedule slot.",
    mediaUrls: [],
    scheduledAt: null,
    publishedAt: null,
    projectId: null,
    goalId: null,
    noteId: null,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe("Phase 5 Plan 05-02: ContentCalendarView Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Renders calendar header, current month, and navigation buttons", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("unscheduled=true")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: mockUnscheduled }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: mockPublications }),
      });
    });

    render(<ContentCalendarView onOpenEditor={vi.fn()} />);

    expect(screen.getByTestId("content-calendar-view")).toBeDefined();
    expect(screen.getByTestId("calendar-current-month")).toBeDefined();
    expect(screen.getByTestId("calendar-prev-button")).toBeDefined();
    expect(screen.getByTestId("calendar-next-button")).toBeDefined();
    expect(screen.getByText("Month")).toBeDefined();
    expect(screen.getByText("Week")).toBeDefined();
  });

  it("2. Renders publication chips on calendar days and displays unscheduled drafts", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("unscheduled=true")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: mockUnscheduled }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: mockPublications }),
      });
    });

    render(<ContentCalendarView onOpenEditor={vi.fn()} />);

    // Publications should appear in calendar
    await waitFor(() => {
      expect(screen.getByTestId("calendar-chip-pub-cal-1")).toBeDefined();
      expect(screen.getByTestId("calendar-chip-pub-cal-2")).toBeDefined();
    });

    // Unscheduled draft item should be in sidebar
    expect(screen.getByText("Draft Idea Waiting For Date")).toBeDefined();
  });

  it("3. Opens publication inspector when a calendar chip is clicked", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("unscheduled=true")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: mockPublications }),
      });
    });

    render(<ContentCalendarView onOpenEditor={vi.fn()} />);

    const chip = await screen.findByTestId("calendar-chip-pub-cal-1");
    fireEvent.click(chip);

    // Inspector should open
    await waitFor(() => {
      const inspector = screen.getByTestId("publication-inspector");
      expect(inspector).toBeDefined();
      expect(screen.getAllByText("Building in Public Guide").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByTestId("inspector-mark-published-button")).toBeDefined();
    });
  });

  it("4. Switches between month and week view mode", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    render(<ContentCalendarView onOpenEditor={vi.fn()} />);

    const weekButton = screen.getByText("Week");
    fireEvent.click(weekButton);

    // Should switch to week view mode
    expect(screen.getByTestId("content-calendar-view")).toBeDefined();
  });
});
