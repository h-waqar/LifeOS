import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CommandPalette } from "@/components/command-palette";

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

// Mock theme provider
const mockToggleTheme = vi.fn();
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    resolvedTheme: "dark",
    toggleTheme: mockToggleTheme,
  }),
}));

// Mock auth client
vi.mock("@/lib/auth-client", () => ({
  signOut: vi.fn().mockResolvedValue({}),
}));

describe("Plan 01-09: Command Palette Accessibility & Keyboard Interaction Suite", () => {
  let triggerButton: HTMLButtonElement;

  beforeEach(() => {
    mockPush.mockClear();
    mockRefresh.mockClear();
    mockToggleTheme.mockClear();

    triggerButton = document.createElement("button");
    triggerButton.textContent = "Open Palette Trigger";
    triggerButton.setAttribute("data-testid", "external-trigger");
    document.body.appendChild(triggerButton);
    triggerButton.focus();
  });

  afterEach(() => {
    if (document.body.contains(triggerButton)) {
      document.body.removeChild(triggerButton);
    }
    vi.restoreAllMocks();
  });

  it("renders with valid WAI-ARIA dialog semantics", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Command Palette");

    const input = screen.getByTestId("command-palette-input");
    expect(input).toBeDefined();
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });

  it("immediately autofocuses the search input upon opening", async () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);

    const input = screen.getByTestId("command-palette-input");
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });

  it("traps focus and prevents Tab key from escaping to document body", async () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);

    const input = screen.getByTestId("command-palette-input");
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });

    // Press Tab
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(input);

    // Press Shift+Tab
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(input);
  });

  it("dismisses palette when Escape key is pressed", () => {
    const handleOpenChange = vi.fn();
    render(<CommandPalette open={true} onOpenChange={handleOpenChange} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it("restores focus to trigger element when closed", async () => {
    const TestHost = () => {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <div>
          <button
            data-testid="palette-trigger"
            onClick={() => setIsOpen(true)}
          >
            Open Palette
          </button>
          <CommandPalette open={isOpen} onOpenChange={setIsOpen} />
        </div>
      );
    };

    render(<TestHost />);
    const trigger = screen.getByTestId("palette-trigger");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open palette
    fireEvent.click(trigger);

    const input = screen.getByTestId("command-palette-input");
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });

    // Close palette via Escape
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("locks body overflow when open and unsets when closed", () => {
    const { rerender } = render(<CommandPalette open={true} onOpenChange={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<CommandPalette open={false} onOpenChange={vi.fn()} />);
    expect(document.body.style.overflow).toBe("unset");
  });

  it("navigates selection with ArrowDown and wraps with loop on ArrowUp", async () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);

    const input = screen.getByTestId("command-palette-input");
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });

    // Initial selected item should be the first item ("Go to Dashboard")
    const initialSelected = document.querySelector('[data-selected="true"]');
    expect(initialSelected).toBeDefined();
    expect(initialSelected?.getAttribute("data-testid")).toBe("cmd-dashboard");

    // Press ArrowDown: moves to second item ("Go to Goals")
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const secondSelected = document.querySelector('[data-selected="true"]');
    expect(secondSelected?.getAttribute("data-testid")).toBe("cmd-goals");

    // Press ArrowUp: wraps back to first item ("Go to Dashboard")
    fireEvent.keyDown(input, { key: "ArrowUp" });
    const wrappedSelected = document.querySelector('[data-selected="true"]');
    expect(wrappedSelected?.getAttribute("data-testid")).toBe("cmd-dashboard");

    // Press ArrowUp again: wraps around to the last item ("Sign Out")
    fireEvent.keyDown(input, { key: "ArrowUp" });
    const lastSelected = document.querySelector('[data-selected="true"]');
    expect(lastSelected?.getAttribute("data-testid")).toBe("cmd-sign-out");
  });

  it("executes the selected command on Enter key press", async () => {
    const handleOpenChange = vi.fn();
    render(<CommandPalette open={true} onOpenChange={handleOpenChange} />);

    const input = screen.getByTestId("command-palette-input");
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });

    // ArrowDown to "cmd-goals"
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const selected = document.querySelector('[data-selected="true"]');
    expect(selected?.getAttribute("data-testid")).toBe("cmd-goals");

    // Press Enter to execute command
    fireEvent.keyDown(input, { key: "Enter" });

    // Should close palette and navigate to /goals
    expect(handleOpenChange).toHaveBeenCalledWith(false);
    expect(mockPush).toHaveBeenCalledWith("/goals");
  });

  it("filters commands dynamically when typing in search input", async () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);

    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "habits" } });

    await waitFor(() => {
      const habitsItem = screen.getByTestId("cmd-habits");
      expect(habitsItem).toBeDefined();
      expect(screen.queryByTestId("cmd-dashboard")).toBeNull();
    });
  });

  it("reliably maintains focus management across repeated open/close cycles", async () => {
    const TestHost = () => {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <div>
          <button data-testid="cycle-trigger" onClick={() => setIsOpen(true)}>
            Toggle
          </button>
          <CommandPalette open={isOpen} onOpenChange={setIsOpen} />
        </div>
      );
    };

    render(<TestHost />);
    const trigger = screen.getByTestId("cycle-trigger");

    for (let cycle = 0; cycle < 3; cycle++) {
      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      // Open
      fireEvent.click(trigger);
      const input = screen.getByTestId("command-palette-input");
      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });

      // Close
      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(trigger);
      });
    }
  });
});
