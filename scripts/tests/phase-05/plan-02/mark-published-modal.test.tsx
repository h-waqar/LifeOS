import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MarkPublishedModal } from "@/components/content/mark-published-modal";
import type { ContentPublicationDTO } from "@/types";

const mockPublication: ContentPublicationDTO = {
  id: "pub-123",
  userId: "user-1",
  contentItemId: "item-1",
  variantId: null,
  platform: "twitter",
  status: "scheduled",
  scheduledFor: "2026-10-15T10:00:00.000Z",
  publishedAt: null,
  postUrl: null,
  externalPostId: null,
  notes: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  contentTitle: "How to Build LifeOS",
  contentType: "thread",
};

describe("Phase 5 Plan 05-02: MarkPublishedModal Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Does not render when publication is null or isOpen is false", () => {
    const { container: c1 } = render(
      <MarkPublishedModal
        publication={null}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(c1.firstChild).toBeNull();

    const { queryByTestId } = render(
      <MarkPublishedModal
        publication={mockPublication}
        isOpen={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(queryByTestId("mark-published-form")).toBeNull();
  });

  it("2. Renders form fields with platform details when open", () => {
    render(
      <MarkPublishedModal
        publication={mockPublication}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText("Mark Content as Published")).toBeDefined();
    expect(screen.getByText(/TWITTER/i)).toBeDefined();
    expect(screen.getByTestId("live-post-url-input")).toBeDefined();
    expect(screen.getByTestId("external-post-id-input")).toBeDefined();
    expect(screen.getByTestId("published-at-input")).toBeDefined();
  });

  it("3. Submits valid live post URL and triggers callbacks on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ...mockPublication, status: "published" } }),
    });
    global.fetch = mockFetch;

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <MarkPublishedModal
        publication={mockPublication}
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const urlInput = screen.getByTestId("live-post-url-input");
    fireEvent.change(urlInput, {
      target: { value: "https://x.com/hamza/status/9876543210" },
    });

    const externalIdInput = screen.getByTestId("external-post-id-input");
    fireEvent.change(externalIdInput, {
      target: { value: "9876543210" },
    });

    const form = screen.getByTestId("mark-published-form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/content/publications/pub-123/publish",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("4. Displays error toast when publish API fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Failed to mark as published" }),
    });
    global.fetch = mockFetch;

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <MarkPublishedModal
        publication={mockPublication}
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const form = screen.getByTestId("mark-published-form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
