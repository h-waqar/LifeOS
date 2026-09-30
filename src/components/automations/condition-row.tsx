"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import type { ConditionClause, ConditionOperator } from "@/types";

interface ConditionRowProps {
  condition: ConditionClause;
  onChange: (updated: ConditionClause) => void;
  onRemove: () => void;
}

const OPERATORS: Array<{ value: ConditionOperator; label: string }> = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "greater_than", label: ">" },
  { value: "greater_than_or_equal", label: ">=" },
  { value: "less_than", label: "<" },
  { value: "less_than_or_equal", label: "<=" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "in", label: "in" },
  { value: "not_in", label: "not in" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
];

const NO_VALUE_OPERATORS: ConditionOperator[] = ["is_empty", "is_not_empty"];

export function ConditionRow({ condition, onChange, onRemove }: ConditionRowProps) {
  const showValue = !NO_VALUE_OPERATORS.includes(condition.operator);

  return (
    <div className="flex items-center gap-2" data-testid="condition-row">
      <Input
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value })}
        placeholder="field (e.g. task.priority)"
        className="flex-1 h-8 text-xs"
        data-testid="condition-field"
      />
      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as ConditionOperator })}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm min-w-[100px]"
        data-testid="condition-operator"
      >
        {OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>
      {showValue && (
        <Input
          value={typeof condition.value === "string" ? condition.value : String(condition.value ?? "")}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder="value"
          className="flex-1 h-8 text-xs"
          data-testid="condition-value"
        />
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
        aria-label="Remove condition"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
