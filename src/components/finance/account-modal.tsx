import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FinanceAccount } from "@/types";
import { toast } from "sonner";

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingAccount?: FinanceAccount | null;
}

export function AccountModal({
  isOpen,
  onClose,
  onSuccess,
  editingAccount,
}: AccountModalProps) {
  const [name, setName] = React.useState("");
  const [accountType, setAccountType] = React.useState<
    "checking" | "savings" | "investment" | "credit_card" | "cash"
  >("checking");
  const [currency, setCurrency] = React.useState("PKR");
  const [initialBalance, setInitialBalance] = React.useState("0");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (editingAccount) {
      setName(editingAccount.name);
      setAccountType(editingAccount.accountType as any);
      setCurrency(editingAccount.currency);
    } else {
      setName("");
      setAccountType("checking");
      setCurrency("PKR");
      setInitialBalance("0");
    }
  }, [editingAccount, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Account name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingAccount) {
        const res = await fetch(`/api/finance/accounts/${editingAccount.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            accountType,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to update account");
        }
        toast.success("Account updated successfully");
      } else {
        const balanceNum = parseFloat(initialBalance);
        if (isNaN(balanceNum) || balanceNum < 0) {
          toast.error("Initial balance must be zero or a positive number");
          setIsSubmitting(false);
          return;
        }

        const res = await fetch("/api/finance/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            accountType,
            currency,
            initialBalance: balanceNum,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create account");
        }
        toast.success("Account created successfully");
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
      title={editingAccount ? "Edit Account" : "Add Account"}
      description={
        editingAccount
          ? "Update account details and preferences."
          : "Add a new checking, savings, investment, credit card, or cash account."
      }
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Account Name *
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Meezan Current, HBL Savings"
            autoFocus
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Account Type *
          </label>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as any)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="checking">Checking (Daily Operations)</option>
            <option value="savings">Savings (Interest / Emergency Fund)</option>
            <option value="investment">Investment (Stocks / Mutual Funds)</option>
            <option value="credit_card">Credit Card (Liability / Debt)</option>
            <option value="cash">Cash (Physical Wallet)</option>
          </select>
        </div>

        {!editingAccount && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Currency
              </label>
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="PKR"
                maxLength={5}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Opening Balance
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
        )}

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
              : editingAccount
              ? "Save Changes"
              : "Create Account"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
