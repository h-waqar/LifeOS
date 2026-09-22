import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MultiPlatformEditor } from "@/components/content/multi-platform-editor";
import type { ContentItemDTO } from "@/types";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockItem: ContentItemDTO = {
  id: "item-editor-1",
  userId: "user-test-1",
  title: "Building Micro-frontends in 2026",
  contentType: "article",
  status: "idea",
  topic: "Web Development",
  targetAudience: "Frontend Architects",
  primaryPlatform: "twitter",
  targetChannels: ["twitter", "linkedin", "blog"],
  tags: ["microfrontends", "react"],
  summary: "Comprehensive guide to Module Federation and independent deployments.",
  mediaUrls: [],
  scheduledAt: null,
  publishedAt: null,
  projectId: null,
  goalId: null,
  noteId: null,
  isArchived: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  variants: [
    {
      id: "var-tw",
      userId: "user-test-1",
      contentItemId: "item-editor-1",
      platform: "twitter",
      title: null,
      body: "Initial tweet draft about microfrontends.",
      threadItems: [],
      charCount: 40,
      status: "draft",
      customSettings: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
};

describe("Phase 5 Plan 05-01: MultiPlatformEditor Component Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Renders title, current status, and platform tabs", () => {
    render(
      <MultiPlatformEditor
        item={mockItem}
        onUpdate={vi.fn()}
      />
    );

    expect(screen.getByText("Building Micro-frontends in 2026")).toBeDefined();
    expect(screen.getByTestId("tab-twitter")).toBeDefined();
    expect(screen.getByTestId("tab-linkedin")).toBeDefined();
    expect(screen.getByTestId("tab-blog")).toBeDefined();
  });

  it("2. Switches between platform tabs", () => {
    render(
      <MultiPlatformEditor
        item={mockItem}
        onUpdate={vi.fn()}
      />
    );

    // Starts on Twitter
    expect(screen.getByTestId("twitter-editor")).toBeDefined();

    // Switch to LinkedIn
    fireEvent.click(screen.getByTestId("tab-linkedin"));
    expect(screen.getByTestId("linkedin-editor")).toBeDefined();

    // Switch to Blog
    fireEvent.click(screen.getByTestId("tab-blog"));
    expect(screen.getByTestId("blog-editor")).toBeDefined();
  });

  it("3. Displays Twitter character count and handles tweet input", () => {
    render(
      <MultiPlatformEditor
        item={mockItem}
        onUpdate={vi.fn()}
      />
    );

    const tweetInput = screen.getByTestId("tweet-body-input");
    fireEvent.change(tweetInput, { target: { value: "Hello Twitter world!" } });

    const charCount = screen.getByTestId("tweet-char-count");
    expect(charCount.textContent).toContain("20 / 280");
  });

  it("4. Switches to Twitter thread mode and adds tweet cards", () => {
    render(
      <MultiPlatformEditor
        item={mockItem}
        onUpdate={vi.fn()}
      />
    );

    const threadModeBtn = screen.getByRole("button", { name: /thread mode/i });
    fireEvent.click(threadModeBtn);

    expect(screen.getByTestId("thread-items-container")).toBeDefined();

    const addTweetBtn = screen.getByTestId("add-tweet-button");
    fireEvent.click(addTweetBtn);

    expect(screen.getByTestId("thread-card-0")).toBeDefined();
  });

  it("5. Updates LinkedIn text and displays 3,000 character limit", () => {
    render(
      <MultiPlatformEditor
        item={mockItem}
        onUpdate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("tab-linkedin"));

    const linkedinInput = screen.getByTestId("linkedin-body-input");
    fireEvent.change(linkedinInput, {
      target: { value: "Excited to share insights on distributed UI." },
    });

    const charCount = screen.getByTestId("linkedin-char-count");
    expect(charCount.textContent).toContain("3,000");
  });

  it("6. Displays Blog slug preview, reading time, and Markdown editor", () => {
    render(
      <MultiPlatformEditor
        item={mockItem}
        onUpdate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("tab-blog"));

    const slugInput = screen.getByTestId("blog-slug-input");
    fireEvent.change(slugInput, { target: { value: "micro-frontends-2026" } });
    expect(slugInput).toHaveProperty("value", "micro-frontends-2026");

    const markdownInput = screen.getByTestId("blog-markdown-input");
    fireEvent.change(markdownInput, {
      target: { value: "# Architecture\n\nIndependent deployment pipelines." },
    });

    expect(screen.getByTestId("blog-markdown-preview")).toBeDefined();
  });

  it("7. Saves platform variant to API on Save Variant click", async () => {
    const handleUpdate = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "var-saved", platform: "twitter" } }),
    });
    global.fetch = mockFetch;

    render(
      <MultiPlatformEditor
        item={mockItem}
        onUpdate={handleUpdate}
      />
    );

    const saveBtn = screen.getByTestId("save-variant-button");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(handleUpdate).toHaveBeenCalledTimes(1);
    });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`/api/content/${mockItem.id}/variants`);
    const parsedBody = JSON.parse(options.body);
    expect(parsedBody.platform).toBe("twitter");
  });

  it("8. Transitions status to 'draft' from 'idea'", async () => {
    const handleUpdate = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ...mockItem, status: "draft" } }),
    });
    global.fetch = mockFetch;

    render(
      <MultiPlatformEditor
        item={mockItem}
        onUpdate={handleUpdate}
      />
    );

    const transitionBtn = screen.getByTestId("transition-draft-button");
    fireEvent.click(transitionBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(handleUpdate).toHaveBeenCalledTimes(1);
    });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(`/api/content/${mockItem.id}/status`);
    const parsedBody = JSON.parse(options.body);
    expect(parsedBody.targetStatus).toBe("draft");
  });
});
