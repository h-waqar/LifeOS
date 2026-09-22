import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContentCard } from "@/components/content/content-card";
import type { ContentItemDTO } from "@/types";

const mockItem: ContentItemDTO = {
  id: "item-card-1",
  userId: "user-test-1",
  title: "Building Resilient Distributed Systems",
  contentType: "article",
  status: "draft",
  topic: "Systems Architecture",
  targetAudience: "Senior Engineers",
  primaryPlatform: "twitter",
  targetChannels: ["twitter", "linkedin", "blog"],
  tags: ["architecture", "scale"],
  summary: "A practical guide to building fault-tolerant microservices.",
  mediaUrls: [],
  scheduledAt: null,
  publishedAt: null,
  projectId: "proj-1",
  goalId: "goal-1",
  noteId: "note-1",
  projectName: "Platform Scalability",
  goalTitle: "Become Staff Engineer",
  noteTitle: "Consensus Algorithms",
  isArchived: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  variantsCount: 2,
  variants: [
    {
      id: "var-1",
      userId: "user-test-1",
      contentItemId: "item-card-1",
      platform: "twitter",
      title: null,
      body: "Thread on resilient systems...",
      threadItems: ["1/2 Thread...", "2/2 Continued..."],
      charCount: 150,
      status: "draft",
      customSettings: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "var-2",
      userId: "user-test-1",
      contentItemId: "item-card-1",
      platform: "linkedin",
      title: null,
      body: "In-depth discussion on distributed consistency.",
      threadItems: [],
      charCount: 500,
      status: "draft",
      customSettings: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
};

describe("Phase 5 Plan 05-01: ContentCard Component Unit Tests", () => {
  it("1. Renders title, topic, summary, and status badge", () => {
    render(
      <ContentCard
        item={mockItem}
        onOpenEditor={vi.fn()}
      />
    );

    expect(screen.getByText("Building Resilient Distributed Systems")).toBeDefined();
    expect(screen.getByText("Systems Architecture")).toBeDefined();
    expect(
      screen.getByText("A practical guide to building fault-tolerant microservices.")
    ).toBeDefined();
    expect(screen.getByText("Draft")).toBeDefined();
  });

  it("2. Renders target channel badges with variant drafted indicators", () => {
    render(
      <ContentCard
        item={mockItem}
        onOpenEditor={vi.fn()}
      />
    );

    expect(screen.getByText("X")).toBeDefined();
    expect(screen.getByText("LinkedIn")).toBeDefined();
    expect(screen.getByText("Blog")).toBeDefined();
    expect(screen.getByText(/2 variants/i)).toBeDefined();
  });

  it("3. Renders linked project and goal chips", () => {
    render(
      <ContentCard
        item={mockItem}
        onOpenEditor={vi.fn()}
      />
    );

    expect(screen.getByText("Platform Scalability")).toBeDefined();
    expect(screen.getByText("Become Staff Engineer")).toBeDefined();
  });

  it("4. Calls onOpenEditor when title or 'Open Editor' action is clicked", () => {
    const handleOpenEditor = vi.fn();
    render(
      <ContentCard
        item={mockItem}
        onOpenEditor={handleOpenEditor}
      />
    );

    const titleEl = screen.getByTestId(`content-title-${mockItem.id}`);
    fireEvent.click(titleEl);

    expect(handleOpenEditor).toHaveBeenCalledTimes(1);
    expect(handleOpenEditor).toHaveBeenCalledWith(mockItem);
  });

  it("5. Opens menu and invokes onStatusChange for mark as published", () => {
    const handleStatusChange = vi.fn();
    render(
      <ContentCard
        item={mockItem}
        onOpenEditor={vi.fn()}
        onStatusChange={handleStatusChange}
      />
    );

    const menuBtn = screen.getByTestId(`content-actions-${mockItem.id}`);
    fireEvent.click(menuBtn);

    const publishBtn = screen.getByTestId(`action-publish-${mockItem.id}`);
    fireEvent.click(publishBtn);

    expect(handleStatusChange).toHaveBeenCalledTimes(1);
    expect(handleStatusChange).toHaveBeenCalledWith(mockItem, "published");
  });

  it("6. Opens menu and triggers archive and delete", () => {
    const handleArchive = vi.fn();
    const handleDelete = vi.fn();
    render(
      <ContentCard
        item={mockItem}
        onOpenEditor={vi.fn()}
        onArchive={handleArchive}
        onDelete={handleDelete}
      />
    );

    const menuBtn = screen.getByTestId(`content-actions-${mockItem.id}`);
    fireEvent.click(menuBtn);

    const archiveBtn = screen.getByTestId(`action-archive-${mockItem.id}`);
    fireEvent.click(archiveBtn);

    expect(handleArchive).toHaveBeenCalledTimes(1);
    expect(handleArchive).toHaveBeenCalledWith(mockItem.id);

    // Open menu again for delete
    fireEvent.click(menuBtn);
    const deleteBtn = screen.getByTestId(`action-delete-${mockItem.id}`);
    fireEvent.click(deleteBtn);

    expect(handleDelete).toHaveBeenCalledTimes(1);
    expect(handleDelete).toHaveBeenCalledWith(mockItem.id);
  });
});
