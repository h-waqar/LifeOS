import { describe, it, expect, vi } from "vitest";
import { parseLocally } from "@/server/ai/nlp/quick-capture-parser";

describe("Phase 6 Plan 06-06: Proactive Planning & NLP Engine (Unit)", () => {
  const refDate = new Date("2026-09-23T10:00:00.000Z");

  it("extracts intent, title, priority, duration, and tags from conversational natural language", () => {
    const input = "Urgent: Fix production authentication bug ASAP takes 45 mins +security +auth";
    const res = parseLocally(input, refDate);

    expect(res.intent).toBe("task");
    expect(res.priority).toBe("critical");
    expect(res.durationMinutes).toBe(45);
    expect(res.tags).toContain("security");
    expect(res.tags).toContain("auth");
    expect(res.title.toLowerCase()).toContain("fix production authentication bug");
  });

  it("identifies calendar meeting intent and resolves relative tomorrow time", () => {
    const input = "Sync meeting with Alex tomorrow at 3pm for 30 mins #marketing";
    const res = parseLocally(input, refDate);

    expect(res.intent).toBe("calendar");
    expect(res.durationMinutes).toBe(30);
    expect(res.scheduledDate).toBeDefined();

    const scheduled = new Date(res.scheduledDate!);
    // Tomorrow from 2026-09-23 is 2026-09-24
    expect(scheduled.getUTCDate()).toBe(24);
    expect(scheduled.getUTCHours()).toBe(15); // 3pm
  });

  it("identifies note or idea capture intent correctly", () => {
    const input = "idea: Multi-provider abstraction architecture for autonomous agent swarms";
    const res = parseLocally(input, refDate);

    expect(res.intent).toBe("note");
    expect(res.title).toContain("Multi-provider abstraction architecture");
  });

  it("resolves relative hourly offsets ('in 2 hours')", () => {
    const input = "Deploy hotfix release in 2 hours";
    const res = parseLocally(input, refDate);

    expect(res.scheduledDate).toBeDefined();
    const scheduled = new Date(res.scheduledDate!);
    // 10:00 + 2 hours = 12:00
    expect(scheduled.getUTCHours()).toBe(12);
  });
});
