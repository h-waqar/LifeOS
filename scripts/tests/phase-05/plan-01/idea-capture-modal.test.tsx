import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IdeaCaptureModal } from "@/components/content/idea-capture-modal";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Phase 5 Plan 05-01: IdeaCaptureModal Component Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Does not render content when isOpen is false", () => {
    render(
      <IdeaCaptureModal
        isOpen={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.queryByTestId("idea-capture-form")).toBeNull();
  });

  it("2. Renders all form fields when isOpen is true", () => {
    render(
      <IdeaCaptureModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        goals={[{ id: "g-1", title: "Scale LifeOS" }]}
        projects={[{ id: "p-1", title: "V1 Launch" }]}
        notes={[{ id: "n-1", title: "Idea Sparks" }]}
      />
    );

    expect(screen.getByTestId("idea-title-input")).toBeDefined();
    expect(screen.getByTestId("idea-content-type-select")).toBeDefined();
    expect(screen.getByTestId("idea-topic-input")).toBeDefined();
    expect(screen.getByTestId("idea-audience-input")).toBeDefined();
    expect(screen.getByTestId("idea-summary-input")).toBeDefined();
    expect(screen.getByTestId("channel-toggle-twitter")).toBeDefined();
    expect(screen.getByTestId("channel-toggle-linkedin")).toBeDefined();
    expect(screen.getByTestId("channel-toggle-blog")).toBeDefined();
    expect(screen.getByText("Scale LifeOS")).toBeDefined();
    expect(screen.getByText("V1 Launch")).toBeDefined();
    expect(screen.getByText("Idea Sparks")).toBeDefined();
  });

  it("3. Toggles target distribution channels", () => {
    render(
      <IdeaCaptureModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const linkedinToggle = screen.getByTestId("channel-toggle-linkedin");
    // Twitter is active by default; clicking LinkedIn adds it
    fireEvent.click(linkedinToggle);
    expect(linkedinToggle.className).toContain("bg-primary");

    // Clicking again deselects it
    fireEvent.click(linkedinToggle);
    expect(linkedinToggle.className).not.toContain("bg-primary");
  });

  it("4. Adds and removes tags", () => {
    render(
      <IdeaCaptureModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const tagInput = screen.getByTestId("idea-tag-input");
    fireEvent.change(tagInput, { target: { value: "architecture" } });
    fireEvent.keyDown(tagInput, { key: "Enter", code: "Enter" });

    expect(screen.getByText("#architecture")).toBeDefined();

    const removeBtn = screen.getByText("×");
    fireEvent.click(removeBtn);

    expect(screen.queryByText("#architecture")).toBeNull();
  });

  it("5. Submits form successfully and calls onSuccess and onClose", async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { id: "item-created", title: "Microservices Guide" },
      }),
    });
    global.fetch = mockFetch;

    render(
      <IdeaCaptureModal
        isOpen={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    const titleInput = screen.getByTestId("idea-title-input");
    fireEvent.change(titleInput, { target: { value: "Microservices Guide" } });

    const submitBtn = screen.getByTestId("submit-idea-button");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(handleSuccess).toHaveBeenCalledTimes(1);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    const calledBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(calledBody.title).toBe("Microservices Guide");
    expect(calledBody.status).toBe("idea");
  });
});
