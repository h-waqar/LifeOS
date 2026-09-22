import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FinanceAccount } from "@/types";
import {
  CreditCard,
  Landmark,
  PiggyBank,
  TrendingUp,
  Banknote,
  Archive,
  Edit2,
  Trash2,
} from "lucide-react";

interface AccountCardProps {
  account: FinanceAccount;
  onEdit: (account: FinanceAccount) => void;
  onArchive: (account: FinanceAccount) => void;
  onDelete: (account: FinanceAccount) => void;
}

const ACCOUNT_TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; colorClass: string }
> = {
  checking: { label: "Checking", icon: Landmark, colorClass: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  savings: { label: "Savings", icon: PiggyBank, colorClass: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  investment: { label: "Investment", icon: TrendingUp, colorClass: "text-purple-500 bg-purple-500/10 border-purple-500/20" },
  credit_card: { label: "Credit Card", icon: CreditCard, colorClass: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
  cash: { label: "Cash", icon: Banknote, colorClass: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
};

export function AccountCard({
  account,
  onEdit,
  onArchive,
  onDelete,
}: AccountCardProps) {
  const config = ACCOUNT_TYPE_CONFIG[account.accountType] ?? {
    label: account.accountType,
    icon: Landmark,
    colorClass: "text-slate-500 bg-slate-500/10 border-slate-500/20",
  };
  const Icon = config.icon;

  const numericBalance = parseFloat(account.balance || "0");
  const formattedBalance = Math.abs(numericBalance).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const isLiability = account.accountType === "credit_card";

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-200 hover:shadow-md ${
        account.isArchived ? "opacity-60 bg-muted/40" : ""
      }`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-2 rounded-lg border ${config.colorClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{account.name}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-muted-foreground">{config.label}</span>
                {account.isArchived && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1">
                    Archived
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onEdit(account)}
              title="Edit Account"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onArchive(account)}
              title={account.isArchived ? "Unarchive" : "Archive Account"}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={() => onDelete(account)}
              title="Delete Account"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t">
          <span className="text-xs text-muted-foreground uppercase font-medium">
            {isLiability ? "Current Debt / Owed" : "Available Balance"}
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xs font-semibold text-muted-foreground">
              {account.currency}
            </span>
            <span
              className={`text-xl font-bold tracking-tight ${
                isLiability
                  ? numericBalance > 0
                    ? "text-rose-500"
                    : "text-foreground"
                  : numericBalance < 0
                  ? "text-rose-500"
                  : "text-foreground"
              }`}
            >
              {isLiability && numericBalance > 0 ? `-${formattedBalance}` : formattedBalance}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
