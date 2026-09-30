import { generateObject } from "ai";
import { parseQuickCaptureInput } from "@/server/tasks/quick-capture";
import { resolveLanguageModel } from "../providers/registry";
import { getAISettings, getDecryptedAIKeys } from "../settings-service";
import { parsedCaptureSchema, type ParsedCapture } from "./types";

export interface ParseOptions {
  referenceDate?: Date;
  timezone?: string;
  forceLocal?: boolean;
}

/**
 * Natural Language Quick Capture Parser.
 * Uses LLM structured output when an AI model is configured, with seamless
 * rule-based fallback to token parsing + regex temporal extraction.
 */
export async function parseQuickCapture(
  userId: string,
  input: string,
  options?: ParseOptions
): Promise<ParsedCapture> {
  const referenceDate = options?.referenceDate ?? new Date();
  const timezone = options?.timezone ?? "UTC";

  if (!options?.forceLocal) {
    try {
      const userSettings = await getAISettings(userId);
      const userKeys = await getDecryptedAIKeys(userId);
      const model = resolveLanguageModel(
        {
          provider: userSettings.defaultProvider,
          model: userSettings.defaultModel,
        },
        userKeys
      );
      const systemPrompt = `You are an expert natural language task and schedule parser for LifeOS.
Analyze the user's input and extract structured properties into JSON.
Current Reference Time: ${referenceDate.toISOString()}
User Timezone: ${timezone}

Rules:
1. Intent: 'calendar' if the input specifies a definite scheduled time or event (e.g. 'Meeting with Bob tomorrow at 3pm'). 'note' if it looks like a journal entry or draft thought. Otherwise 'task'.
2. Resolve relative time expressions like 'tomorrow', 'next Tuesday at 2pm', 'in 3 hours' into precise ISO 8601 strings relative to the reference time.
3. Extract priority ('low', 'medium', 'high', 'critical') if mentioned ('urgent', 'asap' -> 'critical').
4. Extract estimated duration in minutes if specified ('30m', '1 hour' -> 60).
5. Extract tags (+tag or #tag or contextual keywords).`;

      const { object } = await generateObject({
        model,
        schema: parsedCaptureSchema,
        system: systemPrompt,
        prompt: input,
      });

      return object;
    } catch {
      // Fall through to deterministic rule-based / regex parser
    }
  }

  // Deterministic local extraction
  return parseLocally(input, referenceDate);
}

/**
 * Deterministic offline / fallback parser combining token-based extraction
 * with natural language relative date matching.
 */
export function parseLocally(
  rawInput: string,
  referenceDate: Date = new Date()
): ParsedCapture {
  const tokenParsed = parseQuickCaptureInput(rawInput, referenceDate);

  let text = tokenParsed.title || rawInput.trim();
  let intent: "task" | "calendar" | "note" = "task";
  let priority: ParsedCapture["priority"] = tokenParsed.priority as any;
  let scheduledDate = tokenParsed.scheduledDate;
  let dueDate = tokenParsed.dueDate;
  let durationMinutes = tokenParsed.estimatedDuration;
  const tags = [...tokenParsed.tags];

  const lower = rawInput.toLowerCase();

  // Intent classification
  if (lower.startsWith("note:") || lower.startsWith("idea:")) {
    intent = "note";
    text = text.replace(/^(note|idea):\s*/i, "");
  } else if (
    lower.includes("meeting") ||
    lower.includes("sync with") ||
    lower.includes("call with") ||
    lower.includes("at ") ||
    lower.includes("calendar")
  ) {
    if (lower.includes("at ") || lower.includes("meeting") || lower.includes("call")) {
      intent = "calendar";
    }
  }

  // Natural language priority extraction if not already found via tokens
  if (!priority) {
    if (lower.includes("urgent") || lower.includes("asap") || lower.includes("critical")) {
      priority = "critical";
    } else if (lower.includes("high priority") || lower.includes("important")) {
      priority = "high";
    } else if (lower.includes("low priority")) {
      priority = "low";
    }
  }

  // Natural language duration extraction (e.g., "for 45 mins", "takes 2 hours")
  if (!durationMinutes) {
    const durationMatch = lower.match(/(?:takes|for|duration:?)\s*(\d+)\s*(mins?|minutes?|hours?|hrs?)/i);
    if (durationMatch) {
      const val = parseInt(durationMatch[1], 10);
      const unit = durationMatch[2];
      durationMinutes = unit.startsWith("h") ? val * 60 : val;
    }
  }

  // Natural language relative dates (e.g. "tomorrow at 3pm", "in 2 hours", "next monday")
  if (!scheduledDate && !dueDate) {
    const tomorrowMatch = lower.match(/tomorrow(?: at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i);
    if (tomorrowMatch) {
      const d = new Date(referenceDate);
      d.setUTCDate(d.getUTCDate() + 1);
      if (tomorrowMatch[1]) {
        let hours = parseInt(tomorrowMatch[1], 10);
        const mins = tomorrowMatch[2] ? parseInt(tomorrowMatch[2], 10) : 0;
        const meridian = tomorrowMatch[3]?.toLowerCase();
        if (meridian === "pm" && hours < 12) hours += 12;
        if (meridian === "am" && hours === 12) hours = 0;
        d.setUTCHours(hours, mins, 0, 0);
        scheduledDate = d.toISOString();
      } else {
        d.setUTCHours(9, 0, 0, 0);
        dueDate = d.toISOString();
      }
    }

    const inHoursMatch = lower.match(/in (\d+)\s*hours?/i);
    if (inHoursMatch) {
      const hoursToAdd = parseInt(inHoursMatch[1], 10);
      const d = new Date(referenceDate.getTime() + hoursToAdd * 60 * 60 * 1000);
      scheduledDate = d.toISOString();
    }
  }

  return {
    intent,
    title: text || rawInput.trim(),
    priority,
    energyLevel: tokenParsed.energyLevel,
    scheduledDate,
    dueDate,
    durationMinutes,
    projectName: tokenParsed.projectName,
    tags,
    confidence: 0.85,
  };
}
