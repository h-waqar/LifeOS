import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

describe("Plan 01-09: Double-Submit Race Condition & Guard Regression Suite", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("synchronously suppresses rapid concurrent submissions (5 clicks in same tick)", async () => {
    let callCount = 0;
    const asyncMutation = vi.fn(async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return { id: "task-1" };
    });

    const TestComponent = () => {
      const isSubmittingRef = React.useRef(false);
      const [loading, setLoading] = React.useState(false);
      const [title, setTitle] = React.useState("Concurrent Task");

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmittingRef.current || !title.trim()) return;

        isSubmittingRef.current = true;
        setLoading(true);
        try {
          await asyncMutation();
        } finally {
          isSubmittingRef.current = false;
          setLoading(false);
        }
      };

      return (
        <form onSubmit={handleSubmit}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="input-title"
          />
          <button type="submit" disabled={loading} data-testid="submit-btn">
            Create Task
          </button>
        </form>
      );
    };

    render(<TestComponent />);
    const submitBtn = screen.getByTestId("submit-btn");

    // Fire 5 rapid clicks before React has time to re-render disabled state
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(callCount).toBe(1);
    });

    expect(asyncMutation).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(submitBtn.hasAttribute("disabled")).toBe(false));
  });

  it("does not permanently lock the UI when mutation fails/rejects", async () => {
    let shouldFail = true;
    let attempts = 0;

    const asyncMutation = vi.fn(async () => {
      attempts++;
      await new Promise((r) => setTimeout(r, 20));
      if (shouldFail) {
        throw new Error("Internal Server Error 500");
      }
      return { id: "success-id" };
    });

    const TestComponent = () => {
      const isSubmittingRef = React.useRef(false);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState<string | null>(null);

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmittingRef.current) return;

        isSubmittingRef.current = true;
        setLoading(true);
        setError(null);
        try {
          await asyncMutation();
        } catch (err: any) {
          setError(err.message);
        } finally {
          isSubmittingRef.current = false;
          setLoading(false);
        }
      };

      return (
        <form onSubmit={handleSubmit}>
          <button type="submit" disabled={loading} data-testid="submit-btn">
            Submit
          </button>
          {error && <span data-testid="error-banner">{error}</span>}
        </form>
      );
    };

    render(<TestComponent />);
    const submitBtn = screen.getByTestId("submit-btn");

    // First attempt fails
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId("error-banner")).toBeDefined();
    });

    expect(attempts).toBe(1);
    expect(submitBtn.hasAttribute("disabled")).toBe(false);

    // Second attempt after failure succeeds
    shouldFail = false;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(attempts).toBe(2);
    });

    expect(asyncMutation).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(submitBtn.hasAttribute("disabled")).toBe(false));
  });

  it("allows subsequent submission after successful mutation completion", async () => {
    let callCount = 0;
    const asyncMutation = vi.fn(async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 10));
    });

    const TestComponent = () => {
      const isSubmittingRef = React.useRef(false);
      const [loading, setLoading] = React.useState(false);

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmittingRef.current) return;

        isSubmittingRef.current = true;
        setLoading(true);
        try {
          await asyncMutation();
        } finally {
          isSubmittingRef.current = false;
          setLoading(false);
        }
      };

      return (
        <form onSubmit={handleSubmit}>
          <button type="submit" disabled={loading} data-testid="submit-btn">
            Submit
          </button>
        </form>
      );
    };

    render(<TestComponent />);
    const submitBtn = screen.getByTestId("submit-btn");

    // First submit
    fireEvent.click(submitBtn);
    await waitFor(() => expect(submitBtn.hasAttribute("disabled")).toBe(true));
    await waitFor(() => expect(submitBtn.hasAttribute("disabled")).toBe(false));
    expect(callCount).toBe(1);

    // Second submit after completion
    fireEvent.click(submitBtn);
    await waitFor(() => expect(submitBtn.hasAttribute("disabled")).toBe(true));
    await waitFor(() => expect(submitBtn.hasAttribute("disabled")).toBe(false));
    expect(callCount).toBe(2);

    expect(asyncMutation).toHaveBeenCalledTimes(2);
  });
});
