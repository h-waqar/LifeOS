import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FinanceAccount, FinanceCategory, EnrichedTransaction } from "@/types";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";

interface GoalOption {
  id: string;
  title: string;
}

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  goals?: GoalOption[];
  editingTransaction?: EnrichedTransaction | null;
}

export function TransactionModal({
  isOpen,
  onClose,
  onSuccess,
  accounts,
  categories,
  goals = [],
  editingTransaction,
}: TransactionModalProps) {
  const [type, setType] = React.useState<"expense" | "income" | "transfer">("expense");
  const [accountId, setAccountId] = React.useState("");
  const [toAccountId, setToAccountId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(
    new Date().toISOString().split("T")[0]
  );
  const [categoryId, setCategoryId] = React.useState("");
  const [payee, setPayee] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [goalId, setGoalId] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Active accounts only
  const activeAccounts = React.useMemo(
    () => accounts.filter((a) => !a.isArchived || a.id === accountId || a.id === toAccountId),
    [accounts, accountId, toAccountId]
  );

  // Filter categories by transaction type
  const availableCategories = React.useMemo(
    () => categories.filter((c) => c.categoryType === type),
    [categories, type]
  );

  React.useEffect(() => {
    if (editingTransaction) {
      setType(editingTransaction.transactionType as any);
      setAccountId(editingTransaction.accountId);
      setToAccountId(editingTransaction.toAccountId || "");
      setAmount(editingTransaction.amount);
      const txDate = new Date(editingTransaction.date);
      setDate(txDate.toISOString().split("T")[0]);
      setCategoryId(editingTransaction.categoryId || "");
      setPayee(editingTransaction.payee || "");
      setDescription(editingTransaction.description || "");
      setGoalId(editingTransaction.goalId || "");
    } else {
      setType("expense");
      setAccountId(activeAccounts[0]?.id || "");
      setToAccountId("");
      setAmount("");
      setDate(new Date().toISOString().split("T")[0]);
      setCategoryId("");
      setPayee("");
      setDescription("");
      setGoalId("");
    }
  }, [editingTransaction, isOpen, activeAccounts]);

  // If active accounts load and none selected
  React.useEffect(() => {
    if (!accountId && activeAccounts.length > 0) {
      setAccountId(activeAccounts[0].id);
    }
  }, [activeAccounts, accountId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast.error("Please enter a valid amount greater than zero");
      return;
    }

    if (!accountId) {
      toast.error("Please select an account");
      return;
    }

    if (type === "transfer") {
      if (!toAccountId) {
        toast.error("Please select a destination account for the transfer");
        return;
      }
      if (toAccountId === accountId) {
        toast.error("Destination account must be different from source account");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        accountId,
        toAccountId: type === "transfer" ? toAccountId : null,
        transactionType: type,
        amount: numericAmount,
        date: new Date(date).toISOString(),
        categoryId: type !== "transfer" && categoryId ? categoryId : null,
        payee: payee.trim() || null,
        description: description.trim() || null,
        goalId: goalId ? goalId : null,
      };

      if (editingTransaction) {
        const res = await fetch(`/api/finance/transactions/${editingTransaction.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to update transaction");
        }
        toast.success("Transaction updated successfully");
      } else {
        const res = await fetch("/api/finance/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to record transaction");
        }
        toast.success("Transaction recorded successfully");
      }

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
      title={editingTransaction ? "Edit Transaction" : "Record Transaction"}
      description="Record income, expense, or multi-account transfer with atomic balance updates."
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {/* Type Selector Tabs */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-muted rounded-lg">
          <button
            type="button"
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-all ${
              type === "expense"
                ? "bg-rose-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setType("expense");
              setCategoryId("");
            }}
          >
            <ArrowDownLeft className="h-3.5 w-3.5" />
            <span>Expense</span>
          </button>
          <button
            type="button"
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-all ${
              type === "income"
                ? "bg-emerald-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setType("income");
              setCategoryId("");
            }}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>Income</span>
          </button>
          <button
            type="button"
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-all ${
              type === "transfer"
                ? "bg-blue-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setType("transfer");
              setCategoryId("");
            }}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            <span>Transfer</span>
          </button>
        </div>

        {/* Amount & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Amount (PKR) *
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Date *
            </label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Account Selection */}
        {type === "transfer" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                From Account *
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              >
                <option value="" disabled>Select Source</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency} {parseFloat(a.balance || "0").toFixed(2)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                To Account *
              </label>
              <select
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              >
                <option value="" disabled>Select Destination</option>
                {activeAccounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency} {parseFloat(a.balance || "0").toFixed(2)})
                    </option>
                  ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Account *
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              >
                <option value="" disabled>Select Account</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency} {parseFloat(a.balance || "0").toFixed(2)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Uncategorized</option>
                {availableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Payee & Goal Linkage */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Payee / Beneficiary
            </label>
            <Input
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="e.g. Grocery Store, Client XYZ"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Link to Financial Goal
            </label>
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">None</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Description / Notes
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add any extra notes or memo..."
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
            {isSubmitting
              ? "Saving..."
              : editingTransaction
              ? "Save Changes"
              : "Record Transaction"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
