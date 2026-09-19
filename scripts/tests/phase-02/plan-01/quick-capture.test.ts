import { describe, it, expect } from "vitest";
import { parseQuickCaptureInput } from "@/server/tasks/quick-capture";

describe("Plan 02-01: Quick Capture Inline Syntax Parser (Unit)", () => {
  const refDate = new Date("2026-09-14T10:00:00.000Z"); // Monday

  it("extracts plain task title with zero tokens", () => {
    const parsed = parseQuickCaptureInput("Buy groceries for the week", refDate);
    expect(parsed.title).toBe("Buy groceries for the week");
    expect(parsed.priority).toBeUndefined();
    expect(parsed.dueDate).toBeUndefined();
    expect(parsed.tags).toEqual([]);
  });

  it("extracts priority tokens correctly", () => {
    expect(parseQuickCaptureInput("Fix outage !critical", refDate).priority).toBe("critical");
    expect(parseQuickCaptureInput("Fix outage !p0", refDate).priority).toBe("critical");
    expect(parseQuickCaptureInput("Write docs !high", refDate).priority).toBe("high");
    expect(parseQuickCaptureInput("Write docs !p1", refDate).priority).toBe("high");
    expect(parseQuickCaptureInput("Refactor code !medium", refDate).priority).toBe("medium");
    expect(parseQuickCaptureInput("Refactor code !p2", refDate).priority).toBe("medium");
    expect(parseQuickCaptureInput("Clean desk !low", refDate).priority).toBe("low");
    expect(parseQuickCaptureInput("Clean desk !p3", refDate).priority).toBe("low");
  });

  it("extracts due date keywords correctly", () => {
    // ^today
    const todayParsed = parseQuickCaptureInput("Submit report ^today", refDate);
    expect(todayParsed.dueDate).toBeDefined();
    const todayDate = new Date(todayParsed.dueDate!);
    expect(todayDate.getDate()).toBe(14);

    // ^tomorrow
    const tomorrowParsed = parseQuickCaptureInput("Review PR ^tomorrow", refDate);
    expect(tomorrowParsed.dueDate).toBeDefined();
    const tomorrowDate = new Date(tomorrowParsed.dueDate!);
    expect(tomorrowDate.getDate()).toBe(15);

    // ^friday (reference is Monday 14th -> Friday is 18th)
    const fridayParsed = parseQuickCaptureInput("Ship release ^friday", refDate);
    expect(fridayParsed.dueDate).toBeDefined();
    const fridayDate = new Date(fridayParsed.dueDate!);
    expect(fridayDate.getDate()).toBe(18);

    // ^YYYY-MM-DD
    const isoParsed = parseQuickCaptureInput("Tax deadline ^2026-10-31", refDate);
    expect(isoParsed.dueDate).toBeDefined();
    expect(isoParsed.dueDate).toContain("2026-10-31");
  });

  it("extracts scheduled date keywords correctly", () => {
    const schedToday = parseQuickCaptureInput("Focus session *today", refDate);
    expect(schedToday.scheduledDate).toBeDefined();
    expect(new Date(schedToday.scheduledDate!).getDate()).toBe(14);

    const schedTomorrow = parseQuickCaptureInput("Sprint planning *tomorrow", refDate);
    expect(schedTomorrow.scheduledDate).toBeDefined();
    expect(new Date(schedTomorrow.scheduledDate!).getDate()).toBe(15);
  });

  it("extracts energy level tokens", () => {
    expect(parseQuickCaptureInput("Deep work @high", refDate).energyLevel).toBe("high");
    expect(parseQuickCaptureInput("Draft email @medium", refDate).energyLevel).toBe("medium");
    expect(parseQuickCaptureInput("Water plants @low", refDate).energyLevel).toBe("low");
    expect(parseQuickCaptureInput("Deep work @energy:high", refDate).energyLevel).toBe("high");
  });

  it("extracts project tokens", () => {
    expect(parseQuickCaptureInput("Setup DB #LifeOS", refDate).projectName).toBe("LifeOS");
    expect(parseQuickCaptureInput("Fix bug #project:backend", refDate).projectName).toBe("backend");
  });

  it("extracts estimated duration in minutes and hours", () => {
    expect(parseQuickCaptureInput("Quick call ~15m", refDate).estimatedDuration).toBe(15);
    expect(parseQuickCaptureInput("Design sprint ~2h", refDate).estimatedDuration).toBe(120);
    expect(parseQuickCaptureInput("Feature coding ~90m", refDate).estimatedDuration).toBe(90);
  });

  it("extracts multiple tags into a clean list", () => {
    const parsed = parseQuickCaptureInput("File taxes +finance +urgent +taxes", refDate);
    expect(parsed.tags).toEqual(["finance", "urgent", "taxes"]);
    expect(parsed.title).toBe("File taxes");
  });

  it("parses an all-inclusive single string cleanly removing all tokens from title", () => {
    const input =
      "Finalize Q3 investor presentation !high ^tomorrow #Finance @medium ~45m +pitch +q3";
    const parsed = parseQuickCaptureInput(input, refDate);

    expect(parsed.title).toBe("Finalize Q3 investor presentation");
    expect(parsed.priority).toBe("high");
    expect(parsed.dueDate).toBeDefined();
    expect(new Date(parsed.dueDate!).getDate()).toBe(15);
    expect(parsed.projectName).toBe("Finance");
    expect(parsed.energyLevel).toBe("medium");
    expect(parsed.estimatedDuration).toBe(45);
    expect(parsed.tags).toEqual(["pitch", "q3"]);
  });

  it("handles edge cases: empty strings, whitespace, and non-token punctuation", () => {
    expect(parseQuickCaptureInput("", refDate)).toEqual({ title: "", tags: [] });
    expect(parseQuickCaptureInput("   ", refDate)).toEqual({ title: "", tags: [] });
    expect(parseQuickCaptureInput("Hello World!", refDate).title).toBe("Hello World!");
  });
});
