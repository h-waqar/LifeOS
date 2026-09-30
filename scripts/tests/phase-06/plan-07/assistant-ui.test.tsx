import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ToolCallPill } from "@/components/assistant/tool-call-pill";
import { ActionConfirmationCard } from "@/components/assistant/action-confirmation-card";
import { ModelSelector } from "@/components/assistant/model-selector";
import { AssistantDrawer } from "@/components/assistant/assistant-drawer";
import type { ActionPreview } from "@/server/ai/tools/types";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock AssistantChat inside AssistantDrawer to keep unit test focused on Drawer shell
vi.mock("@/components/assistant/assistant-chat", () => ({
  AssistantChat: () => <div data-testid="mock-assistant-chat">Mock Assistant Chat</div>,
}));

describe("Phase 6 Plan 06-07: Conversational Assistant UI Components (Unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("1. ToolCallPill", () => {
    it("renders tool call in progress with animated calling state", () => {
      render(<ToolCallPill toolName="tasks_search" status="calling" />);
      expect(screen.getByText("tasks search")).toBeDefined();
    });

    it("renders completed tool execution state", () => {
      render(<ToolCallPill toolName="calendar_get_schedule" status="completed" />);
      expect(screen.getByText("calendar get schedule")).toBeDefined();
    });

    it("renders pending confirmation state with approval required badge", () => {
      render(
        <ToolCallPill
          toolName="tasks_create"
          status="pending_confirmation"
        />
      );
      expect(screen.getByText("tasks create")).toBeDefined();
      expect(screen.getByText("Approval Required")).toBeDefined();
    });
  });

  describe("2. ActionConfirmationCard", () => {
    const mockPreview: ActionPreview = {
      summary: "Create high priority task 'Finalize Taxes'",
      warning: "Ensure deadline is valid",
      diff: {
        title: { after: "Finalize Taxes" },
        priority: { after: "p1_urgent" },
        dueDate: { after: "2026-09-24" },
      },
    };

    it("renders confirmation title, summary, warning, and parameter diff", () => {
      render(
        <ActionConfirmationCard
          actionId="act-123"
          toolName="tasks_create"
          preview={mockPreview}
        />
      );

      expect(screen.getByText("Confirmation Required")).toBeDefined();
      expect(screen.getByText(mockPreview.summary)).toBeDefined();
      expect(screen.getByText("⚠️ Ensure deadline is valid")).toBeDefined();
      expect(screen.getByText("title:")).toBeDefined();
      expect(screen.getByText("Finalize Taxes")).toBeDefined();
      expect(screen.getByText("Approve & Execute")).toBeDefined();
      expect(screen.getByText("Reject")).toBeDefined();
    });

    it("successfully confirms action on approve click", async () => {
      const onConfirmed = vi.fn();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { executionResult: { taskId: "task-1" } },
        }),
      });
      globalThis.fetch = mockFetch as any;

      render(
        <ActionConfirmationCard
          actionId="act-123"
          toolName="tasks_create"
          preview={mockPreview}
          onConfirmed={onConfirmed}
        />
      );

      const approveBtn = screen.getByRole("button", { name: /Approve & Execute/i });
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/ai/actions/act-123/confirm",
          expect.objectContaining({ method: "POST" })
        );
        expect(onConfirmed).toHaveBeenCalledWith({ taskId: "task-1" });
        expect(screen.getByText("Executed")).toBeDefined();
      });
    });

    it("successfully rejects action on reject click", async () => {
      const onRejected = vi.fn();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
        }),
      });
      globalThis.fetch = mockFetch as any;

      render(
        <ActionConfirmationCard
          actionId="act-123"
          toolName="tasks_create"
          preview={mockPreview}
          onRejected={onRejected}
        />
      );

      const rejectBtn = screen.getByRole("button", { name: /Reject/i });
      fireEvent.click(rejectBtn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/ai/actions/act-123/reject",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining("User cancelled from card"),
          })
        );
        expect(onRejected).toHaveBeenCalled();
        expect(screen.getByText("Cancelled")).toBeDefined();
      });
    });
  });

  describe("3. ModelSelector", () => {
    it("renders available models and switches model on change", () => {
      const onSelect = vi.fn();

      render(
        <ModelSelector
          selectedProvider="google"
          selectedModel="gemini-2.5-flash"
          onSelect={onSelect}
        />
      );

      const select = screen.getByRole("combobox");
      expect(select).toBeDefined();

      fireEvent.change(select, { target: { value: "anthropic:claude-3-7-sonnet" } });

      expect(onSelect).toHaveBeenCalledWith("anthropic", "claude-3-7-sonnet");
    });
  });

  describe("4. AssistantDrawer", () => {
    it("does not render when open is false", () => {
      const onClose = vi.fn();
      render(<AssistantDrawer open={false} onClose={onClose} />);
      expect(screen.queryByTestId("mock-assistant-chat")).toBeNull();
    });

    it("renders content and closes on Escape keydown", () => {
      const onClose = vi.fn();
      render(<AssistantDrawer open={true} onClose={onClose} />);

      expect(screen.getByTestId("mock-assistant-chat")).toBeDefined();
      expect(screen.getByText("Assistant Drawer")).toBeDefined();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalled();
    });

    it("closes when close button is clicked", () => {
      const onClose = vi.fn();
      render(<AssistantDrawer open={true} onClose={onClose} />);

      const closeBtn = screen.getByRole("button");
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
