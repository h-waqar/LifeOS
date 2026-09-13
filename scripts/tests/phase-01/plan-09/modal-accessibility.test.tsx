import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Modal } from "@/components/ui/modal";

describe("Plan 01-09: Modal Accessibility & Focus Containment Regression Suite", () => {
  let triggerButton: HTMLButtonElement;

  beforeEach(() => {
    triggerButton = document.createElement("button");
    triggerButton.textContent = "Open Modal Trigger";
    document.body.appendChild(triggerButton);
    triggerButton.focus();
  });

  afterEach(() => {
    if (document.body.contains(triggerButton)) {
      document.body.removeChild(triggerButton);
    }
    vi.restoreAllMocks();
  });

  it("renders with appropriate WAI-ARIA dialog semantics", () => {
    render(
      <Modal
        isOpen={true}
        onClose={vi.fn()}
        title="Test Modal Title"
        description="Test Modal Description"
      >
        <p>Modal content</p>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    const title = screen.getByText("Test Modal Title");
    const desc = screen.getByText("Test Modal Description");

    expect(dialog.getAttribute("aria-labelledby")).toBe(title.id);
    expect(dialog.getAttribute("aria-describedby")).toBe(desc.id);
  });

  it("dismisses modal when Escape key is pressed", () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Escape Test">
        <input data-testid="inside-input" />
      </Modal>
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("traps focus and wraps Tab from last element to first element", async () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Focus Trap Test">
        <input data-testid="input-1" placeholder="First input" />
        <input data-testid="input-2" placeholder="Second input" />
        <button data-testid="btn-submit">Submit</button>
      </Modal>
    );

    const closeBtn = screen.getByLabelText("Close dialog");
    const submitBtn = screen.getByTestId("btn-submit");

    // Focus last element
    submitBtn.focus();
    expect(document.activeElement).toBe(submitBtn);

    // Press Tab from last element: should wrap to first element (close button)
    fireEvent.keyDown(window, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(closeBtn);
  });

  it("traps focus and wraps Shift+Tab from first element to last element", async () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Shift Tab Focus Wrap Test">
        <input data-testid="input-1" placeholder="First input" />
        <button data-testid="btn-submit">Submit</button>
      </Modal>
    );

    const closeBtn = screen.getByLabelText("Close dialog");
    const submitBtn = screen.getByTestId("btn-submit");

    // Focus first element (close button)
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);

    // Press Shift+Tab: should wrap to last element (submit button)
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(submitBtn);
  });

  it("restores focus to trigger element when closed", async () => {
    const TestHost = () => {
      const [isOpen, setIsOpen] = React.useState(true);
      return (
        <div>
          <button
            data-testid="trigger-btn"
            onClick={() => setIsOpen(true)}
          >
            Trigger
          </button>
          <Modal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            title="Restoration Test"
          >
            <button
              data-testid="modal-close-action"
              onClick={() => setIsOpen(false)}
            >
              Close
            </button>
          </Modal>
        </div>
      );
    };

    render(<TestHost />);
    const trigger = screen.getByTestId("trigger-btn");
    trigger.focus();

    const closeAction = screen.getByTestId("modal-close-action");
    fireEvent.click(closeAction);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("locks body overflow when open and unsets when closed", () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={vi.fn()} title="Overflow Test">
        <div>Content</div>
      </Modal>
    );

    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Modal isOpen={false} onClose={vi.fn()} title="Overflow Test">
        <div>Content</div>
      </Modal>
    );

    expect(document.body.style.overflow).toBe("unset");
  });

  it("supports programmatic label association via htmlFor and id", () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Form Label Test">
        <form>
          <label htmlFor="test-field-id">Field Label</label>
          <input id="test-field-id" name="testField" />
        </form>
      </Modal>
    );

    const input = screen.getByLabelText("Field Label");
    expect(input).toBeDefined();
    expect(input.id).toBe("test-field-id");
  });
});
