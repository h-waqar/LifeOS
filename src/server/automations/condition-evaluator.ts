import type {
  ConditionClause,
  ConditionGroup,
  ConditionsConfig,
} from "./types";

/**
 * Safely extracts a nested property value using dot-notation.
 * Supports array indices (e.g. "tags.0") and handles nullish intermediates gracefully.
 * Falls back to context.payload if looking up a root property in an event wrapper.
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object" || !path) {
    return undefined;
  }

  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return undefined;

  const tryLookup = (root: any): unknown => {
    let current: any = root;
    for (let i = 0; i < parts.length; i++) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[parts[i]];
    }
    return current;
  };

  const direct = tryLookup(obj);
  if (direct !== undefined) {
    return direct;
  }

  // Fallback: If obj is an event context containing a "payload" property,
  // try looking inside obj.payload if the path didn't already start with "payload"
  if (
    parts[0] !== "payload" &&
    "payload" in (obj as Record<string, unknown>) &&
    typeof (obj as any).payload === "object" &&
    (obj as any).payload !== null
  ) {
    return tryLookup((obj as any).payload);
  }

  return undefined;
}

/**
 * Coerces unknown inputs into comparable numeric timestamps or numbers if possible.
 */
function toComparableNumber(val: unknown): number | null {
  if (typeof val === "number" && !isNaN(val)) {
    return val;
  }
  if (val instanceof Date) {
    return val.getTime();
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const num = Number(trimmed);
      if (!isNaN(num)) return num;
    }
    // Check if ISO Date string
    const parsedDate = Date.parse(trimmed);
    if (!isNaN(parsedDate) && trimmed.includes("-")) {
      return parsedDate;
    }
  }
  return null;
}

/**
 * Evaluates a single condition clause against an event context.
 */
export function evaluateClause(
  context: Record<string, unknown>,
  clause: ConditionClause
): boolean {
  const actual = getNestedValue(context, clause.field);
  const target = clause.value;

  switch (clause.operator) {
    case "equals": {
      if (actual === target) return true;
      if (actual === undefined || actual === null || target === undefined || target === null) {
        return actual === target;
      }
      // Safe coercion for numeric matches: "10" == 10
      const actualNum = toComparableNumber(actual);
      const targetNum = toComparableNumber(target);
      if (actualNum !== null && targetNum !== null) {
        return actualNum === targetNum;
      }
      // Safe string comparison (case-insensitive for strings)
      if (typeof actual === "string" && typeof target === "string") {
        return actual.trim().toLowerCase() === target.trim().toLowerCase();
      }
      // Boolean to string coercion
      if (typeof actual === "boolean" && typeof target === "string") {
        return String(actual) === target.trim().toLowerCase();
      }
      return false;
    }

    case "not_equals":
      return !evaluateClause(context, { ...clause, operator: "equals" });

    case "greater_than": {
      const actualNum = toComparableNumber(actual);
      const targetNum = toComparableNumber(target);
      if (actualNum !== null && targetNum !== null) {
        return actualNum > targetNum;
      }
      if (typeof actual === "string" && typeof target === "string") {
        return actual > target;
      }
      return false;
    }

    case "greater_than_or_equal": {
      const actualNum = toComparableNumber(actual);
      const targetNum = toComparableNumber(target);
      if (actualNum !== null && targetNum !== null) {
        return actualNum >= targetNum;
      }
      if (typeof actual === "string" && typeof target === "string") {
        return actual >= target;
      }
      return false;
    }

    case "less_than": {
      const actualNum = toComparableNumber(actual);
      const targetNum = toComparableNumber(target);
      if (actualNum !== null && targetNum !== null) {
        return actualNum < targetNum;
      }
      if (typeof actual === "string" && typeof target === "string") {
        return actual < target;
      }
      return false;
    }

    case "less_than_or_equal": {
      const actualNum = toComparableNumber(actual);
      const targetNum = toComparableNumber(target);
      if (actualNum !== null && targetNum !== null) {
        return actualNum <= targetNum;
      }
      if (typeof actual === "string" && typeof target === "string") {
        return actual <= target;
      }
      return false;
    }

    case "contains": {
      if (typeof actual === "string") {
        return actual.toLowerCase().includes(String(target ?? "").toLowerCase());
      }
      if (Array.isArray(actual)) {
        return actual.some((item) => {
          if (item === target) return true;
          if (typeof item === "string" && typeof target === "string") {
            return item.toLowerCase() === target.toLowerCase();
          }
          return false;
        });
      }
      return false;
    }

    case "not_contains":
      return !evaluateClause(context, { ...clause, operator: "contains" });

    case "in": {
      if (!Array.isArray(target)) return false;
      return target.some((item) => {
        if (item === actual) return true;
        if (typeof item === "string" && typeof actual === "string") {
          return item.toLowerCase() === actual.toLowerCase();
        }
        return false;
      });
    }

    case "not_in":
      return !evaluateClause(context, { ...clause, operator: "in" });

    case "is_empty": {
      if (actual === null || actual === undefined) return true;
      if (typeof actual === "string") return actual.trim().length === 0;
      if (Array.isArray(actual)) return actual.length === 0;
      if (typeof actual === "object") return Object.keys(actual).length === 0;
      return false;
    }

    case "is_not_empty":
      return !evaluateClause(context, { ...clause, operator: "is_empty" });

    case "starts_with": {
      if (typeof actual !== "string") return false;
      return actual.toLowerCase().startsWith(String(target ?? "").toLowerCase());
    }

    case "ends_with": {
      if (typeof actual !== "string") return false;
      return actual.toLowerCase().endsWith(String(target ?? "").toLowerCase());
    }

    default:
      return false;
  }
}

/**
 * Pure evaluation function for a ConditionGroup or ConditionClause[] against a context snapshot.
 * Supports recursive AND/OR grouping. Empty clause lists evaluate to true.
 */
export function evaluateConditionGroup(
  context: Record<string, unknown>,
  group: ConditionsConfig
): boolean {
  if (!group) return true;

  // Handle bare array of clauses (treated as combinator: "AND")
  if (Array.isArray(group)) {
    if (group.length === 0) return true;
    return group.every((clause) => evaluateClause(context, clause));
  }

  const { combinator = "AND", clauses = [] } = group;
  if (!clauses || clauses.length === 0) return true;

  if (combinator === "OR") {
    return clauses.some((clauseOrGroup) => {
      if ("combinator" in clauseOrGroup) {
        return evaluateConditionGroup(context, clauseOrGroup as ConditionGroup);
      }
      return evaluateClause(context, clauseOrGroup as ConditionClause);
    });
  }

  // Default: combinator === "AND"
  return clauses.every((clauseOrGroup) => {
    if ("combinator" in clauseOrGroup) {
      return evaluateConditionGroup(context, clauseOrGroup as ConditionGroup);
    }
    return evaluateClause(context, clauseOrGroup as ConditionClause);
  });
}

/**
 * Interpolates {{field.path}} placeholders inside a template string.
 * Missing or undefined properties resolve to empty strings.
 */
export function interpolateTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  if (typeof template !== "string") return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const val = getNestedValue(context, path);
    if (val === null || val === undefined) return "";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  });
}

/**
 * Deeply traverses an object or array and interpolates all string fields.
 */
export function interpolateObject<T>(
  data: T,
  context: Record<string, unknown>
): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    return interpolateTemplate(data, context) as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => interpolateObject(item, context)) as unknown as T;
  }

  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = interpolateObject(value, context);
    }
    return result as T;
  }

  return data;
}
