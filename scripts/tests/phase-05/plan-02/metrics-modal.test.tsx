import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MetricsModal } from "@/components/content/metrics-modal";
import type { ContentPublicationDTO } from "@/types";

const mockPublication: ContentPublicationDTO = {
  id: "pub-456",
  userId: "user-1",
  contentItemId: "item-1",
  variantId: null,
  platform: "linkedin",
  status: "published",
  scheduledFor: "2026-10-10T10:00:00.000Z",
  publishedAt: "2026-10-10T10:05:00.000Z",
  postUrl: "https://linkedin.com/feed/update/urn:li:activity:123456789",
  externalPostId: "123456789",
  notes: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  contentTitle: "Architecture Scaling Secrets",
  contentType: "post",
};

describe("Phase 5 Plan 05-02: MetricsModal Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Does not render when publication is null or isOpen is false", () => {
    const { container: c1 } = render(
      <MetricsModal
        publication={null}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(c1.firstChild).toBeNull();

    const { queryByTestId } = render(
      <MetricsModal
        publication={mockPublication}
        isOpen={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(queryByTestId("metrics-modal-form")).toBeNull();
  });

  it("2. Loads existing history and calculates live engagement rate preview", async () => {
    const mockHistory = [
      {
        id: "m-1",
        userId: "user-1",
        publicationId: "pub-456",
        contentItemId: "item-1",
        views: 2000,
        likes: 100,
        comments: 20,
        shares: 10,
        saves: 10,
        clicks: 60, // Total = 200 engagements => 10.00%
        engagementRate: 10.0,
        notes: "Day 1",
        recordedAt: "2026-10-11T10:00:00.000Z",
        createdAt: "2026-10-11T10:00:00.000Z",
        updatedAt: "2026-10-11T10:00:00.000Z",
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockHistory }),
    });
    global.fetch = mockFetch;

    render(
      <MetricsModal
        publication={mockPublication}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText("Log Performance Metrics")).toBeDefined();
    expect(screen.getByText(/LINKEDIN/i)).toBeDefined();

    // Verify history was fetched
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/content/pub-456/metrics");
    });

    // Verify engagement rate preview is computed
    await waitFor(() => {
      const preview = screen.getByTestId("preview-engagement-rate");
      expect(preview.textContent).toBe("10.00%");
    });
  });

  it("3. Dynamically updates engagement rate when user changes view and like inputs", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    render(
      <MetricsModal
        publication={mockPublication}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const viewsInput = screen.getByTestId("input-metrics-views");
    const likesInput = screen.getByTestId("input-metrics-likes");

    // Set 1000 views and 50 likes -> 5.00%
    fireEvent.change(viewsInput, { target: { value: "1000" } });
    fireEvent.change(likesInput, { target: { value: "50" } });

    const preview = screen.getByTestId("preview-engagement-rate");
    expect(preview.textContent).toBe("5.00%");
  });

  it("4. Submits payload to /api/content/[id]/metrics and triggers callbacks on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "m-new" } }),
    });
    global.fetch = mockFetch;

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <MetricsModal
        publication={mockPublication}
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const viewsInput = screen.getByTestId("input-metrics-views");
    const likesInput = screen.getByTestId("input-metrics-likes");
    fireEvent.change(viewsInput, { target: { value: "500" } });
    fireEvent.change(likesInput, { target: { value: "25" } });

    const form = screen.getByTestId("metrics-modal-form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/content/pub-456/metrics",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining('"views":500'),
        })
      );
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
