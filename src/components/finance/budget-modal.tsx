import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FinanceCategory, CategoryBudgetProgress } from "@/types";
import { toast } from "sonner";

interface BudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  month: string;
  categories: FinanceCategory[];
  existingBudgets: CategoryBudgetProgress[];
  editingBudget?: CategoryBudgetProgress | null;
}

export function BudgetModal({
  isOpen,
  onClose,
  onSuccess,
  month,
  categories,
  existingBudgets,
  editingBudget,
}: BudgetModalProps) {
  const [categoryId, setCategoryId] = React.useState("");
  const [targetAmount, setTargetAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Available categories: expense categories
  const expenseCategories = React.useMemo(() => {
    return categories.filter((c) => c.categoryType === "expense");
  }, [categories]);

  React.useEffect(() => {
    if (editingBudget) {
      setCategoryId(editingBudget.categoryId);
      setTargetAmount(String(editingBudget.targetAmount));
      setNotes(editingBudget.notes || "");
    } else {
      // Pick first category that doesn't have a budget yet
      const budgetedIds = new Set(existingBudgets.map((b) => b.categoryId));
      const firstAvailable = expenseCategories.find((c) => !budgetedIds.has(c.id));
      setCategoryId(firstAvailable?.id || expenseCategories[0]?.id || "");
      setTargetAmount("");
      setNotes("");
    }
  }, [editingBudget, isOpen, expenseCategories, existingBudgets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const numericAmount = parseFloat(targetAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast.error("Target amount must be strictly positive");
      return;
    }

    if (!categoryId) {
      toast.error("Please select an expense category");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/finance/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          month,
          targetAmount: numericAmount,
          notes: notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save budget target");
      }

      toast.success("Budget target saved");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingBudget ? "Edit Category Budget" : "Set Category Budget"}
      description={`Set monthly spending target for ${month}.`}
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Expense Category *
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={!!editingBudget}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            required
          >
            <option value="" disabled>Select Category</option>
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Monthly Target Amount (PKR) *
          </label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            placeholder="e.g. 25000"
            autoFocus
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Notes / Intent
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Max allowance for dining out and weekend coffee"
            rows={2}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Budget Target"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
