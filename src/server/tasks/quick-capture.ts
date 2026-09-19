import type { PrioritySeverity } from "./priority";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Quick capture parser cannot be executed in the browser."
  );
}

export interface ParsedQuickCapture {
  title: string;
  priority?: PrioritySeverity;
  dueDate?: string; // ISO 8601 string
  scheduledDate?: string; // ISO 8601 string
  energyLevel?: "low" | "medium" | "high";
  projectName?: string;
  estimatedDuration?: number; // minutes
  tags: string[];
}

/**
 * Parses raw single-string quick-capture input extracting inline tokens:
 * - Priority: !p0, !critical, !p1, !high, !p2, !medium, !p3, !low
 * - Due Date: ^today, ^tomorrow, ^YYYY-MM-DD, ^monday..^sunday
 * - Scheduled Date: *today, *tomorrow, *YYYY-MM-DD
 * - Energy: @high, @medium, @low (or @energy:high)
 * - Project: #project or #ProjectName
 * - Duration: ~15m, ~30m, ~1h, ~90m
 * - Tags: +tag1, +tag2
 */
export function parseQuickCaptureInput(
  rawInput: string,
  referenceDate: Date = new Date()
): ParsedQuickCapture {
  if (!rawInput || typeof rawInput !== "string") {
    return { title: "", tags: [] };
  }

  let text = rawInput.trim();
  const tags: string[] = [];
  let priority: PrioritySeverity | undefined;
  let dueDate: string | undefined;
  let scheduledDate: string | undefined;
  let energyLevel: "low" | "medium" | "high" | undefined;
  let projectName: string | undefined;
  let estimatedDuration: number | undefined;

  // Helper for date calculation
  function resolveDateKeyword(kw: string): Date | null {
    const lower = kw.toLowerCase();
    const d = new Date(referenceDate);

    if (lower === "today") {
      d.setHours(23, 59, 59, 999);
      return d;
    }
    if (lower === "tomorrow") {
      d.setDate(d.getDate() + 1);
      d.setHours(23, 59, 59, 999);
      return d;
    }

    const dayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    if (dayMap[lower] !== undefined) {
      const targetDay = dayMap[lower];
      const currentDay = d.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7; // next upcoming day of week
      d.setDate(d.getDate() + diff);
      d.setHours(23, 59, 59, 999);
      return d;
    }

    // Check ISO YYYY-MM-DD
    const isoMatch = kw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const parsed = new Date(`${kw}T23:59:59.999Z`);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return null;
  }

  // 1. Extract Tags: +tag
  text = text.replace(/(?:^|\s)\+([a-zA-Z0-9_-]+)/g, (_, tag) => {
    tags.push(tag.toLowerCase());
    return "";
  });

  // 2. Extract Priority: !p0..p3 or !critical, !high, !medium, !low
  text = text.replace(
    /(?:^|\s)!(p[0-3]|critical|high|medium|low)\b/gi,
    (_, token) => {
      const t = token.toLowerCase();
      if (t === "p0" || t === "critical") priority = "critical";
      else if (t === "p1" || t === "high") priority = "high";
      else if (t === "p2" || t === "medium") priority = "medium";
      else if (t === "p3" || t === "low") priority = "low";
      return "";
    }
  );

  // 3. Extract Due Date: ^(today|tomorrow|monday..sunday|YYYY-MM-DD)
  text = text.replace(
    /(?:^|\s)\^([a-zA-Z]+|\d{4}-\d{2}-\d{2})\b/g,
    (_, token) => {
      const resolved = resolveDateKeyword(token);
      if (resolved) {
        dueDate = resolved.toISOString();
      }
      return "";
    }
  );

  // 4. Extract Scheduled Date: *(today|tomorrow|YYYY-MM-DD)
  text = text.replace(
    /(?:^|\s)\*([a-zA-Z]+|\d{4}-\d{2}-\d{2})\b/g,
    (_, token) => {
      const resolved = resolveDateKeyword(token);
      if (resolved) {
        // Scheduled date starts at beginning of day or reference time
        resolved.setHours(9, 0, 0, 0);
        scheduledDate = resolved.toISOString();
      }
      return "";
    }
  );

  // 5. Extract Energy Level: @(energy:)?(low|medium|high)
  text = text.replace(
    /(?:^|\s)@(?:energy:)?(low|medium|high)\b/gi,
    (_, token) => {
      const t = token.toLowerCase();
      if (t === "low" || t === "medium" || t === "high") {
        energyLevel = t;
      }
      return "";
    }
  );

  // 6. Extract Project: #(project:)?([a-zA-Z0-9_-]+)
  text = text.replace(
    /(?:^|\s)#(?:project:)?([a-zA-Z0-9_-]+)\b/g,
    (_, token) => {
      projectName = token;
      return "";
    }
  );

  // 7. Extract Duration: ~(\d+)(m|h)
  text = text.replace(/(?:^|\s)~(\d+)(m|h)?\b/gi, (_, amount, unit) => {
    const num = parseInt(amount, 10);
    if (!isNaN(num)) {
      if ((unit || "").toLowerCase() === "h") {
        estimatedDuration = num * 60;
      } else {
        estimatedDuration = num;
      }
    }
    return "";
  });

  // Clean title: Collapse internal whitespace and trim
  const cleanTitle = text.replace(/\s+/g, " ").trim();

  return {
    title: cleanTitle,
    priority,
    dueDate,
    scheduledDate,
    energyLevel,
    projectName,
    estimatedDuration,
    tags,
  };
}
