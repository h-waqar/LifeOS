/**
 * Deterministic Output Formatters & Stream Discipline
 *
 * Implements machine-readable JSON serialization with recursively sorted keys
 * and clean tabular formatting with column alignment and empty-state handling.
 */

import { scrubSecrets } from "./errors";
import type { TableColumn, TableOutput } from "./types";

/**
 * Recursively sorts the keys of any object to guarantee deterministic JSON output.
 */
export function sortKeysDeterministically(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortKeysDeterministically);
  }

  // Handle Date instances
  if (value instanceof Date) {
    return value.toISOString();
  }

  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(record).sort();

  for (const key of keys) {
    sorted[key] = sortKeysDeterministically(record[key]);
  }

  return sorted;
}

/**
 * Formats data as deterministic, scrubbed, 2-space indented JSON.
 */
export function formatJson(data: unknown): string {
  const sorted = sortKeysDeterministically(data);
  const jsonString = JSON.stringify(sorted, null, 2);
  return scrubSecrets(jsonString);
}

/**
 * Formats rows and columns as a stable text table.
 */
export function formatTable(
  columns: TableColumn[],
  rows: Record<string, unknown>[],
  options?: { emptyMessage?: string; title?: string }
): string {
  const lines: string[] = [];

  if (options?.title) {
    lines.push(`=== ${options.title} ===`);
    lines.push("");
  }

  if (!rows || rows.length === 0) {
    const emptyMsg = options?.emptyMessage ?? "(no records found)";
    lines.push(emptyMsg);
    return lines.join("\n");
  }

  // Calculate maximum width for each column
  const columnWidths = columns.map((col) => {
    let max = col.label.length;
    for (const row of rows) {
      const val = row[col.key];
      const valStr = formatCellValue(val);
      if (valStr.length > max) {
        max = valStr.length;
      }
    }
    // Respect explicit width or cap at 60 for table readability
    if (col.width) {
      return Math.max(col.width, col.label.length);
    }
    return Math.min(Math.max(max, col.label.length), 60);
  });

  // Build Header
  const headerRow = columns
    .map((col, i) => col.label.padEnd(columnWidths[i]))
    .join("  ");
  lines.push(headerRow);

  // Build Separator
  const separator = columnWidths.map((w) => "-".repeat(w)).join("  ");
  lines.push(separator);

  // Build Data Rows
  for (const row of rows) {
    const rowStr = columns
      .map((col, i) => {
        const val = row[col.key];
        const valStr = formatCellValue(val);
        // Truncate if exceeds column width
        const truncated =
          valStr.length > columnWidths[i]
            ? valStr.slice(0, columnWidths[i] - 3) + "..."
            : valStr;
        return truncated.padEnd(columnWidths[i]);
      })
      .join("  ");
    lines.push(rowStr);
  }

  return scrubSecrets(lines.join("\n"));
}

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) {
    return "-";
  }
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === "boolean") {
    return val ? "yes" : "no";
  }
  if (typeof val === "object") {
    return JSON.stringify(val);
  }
  return String(val);
}
