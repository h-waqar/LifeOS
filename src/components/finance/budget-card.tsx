import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryBadge } from "./category-badge";
import type { CategoryBudgetProgress } from "@/types";
import { Edit2, Trash2, AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";

interface BudgetCardProps {
  budget: CategoryBudgetProgress;
  onEdit: (budget: CategoryBudgetProgress) => void;
  onDelete: (budget: CategoryBudgetProgress) => void;
}

export function BudgetCard({ budget, onEdit, onDelete }: BudgetCardProps) {
  // Utilization thresholds: < 80% green, 80-100% amber, > 100% red
  const getStatusColor = () => {
    if (budget.isOverBudget) {
      return {
        barColor: "bg-rose-500",
        badgeColor: "border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10",
        label: "Over Budget",
        icon: AlertCircle,
      };
    }
    if (budget.utilizationPercentage >= 80) {
      return {
        barColor: "bg-amber-500",
        badgeColor: "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10",
        label: "Approaching Limit",
        icon: AlertTriangle,
      };
    }
    return {
      barColor: "bg-emerald-500",
      badgeColor: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
      label: "On Track",
      icon: CheckCircle2,
    };
  };

  const status = getStatusColor();
  const StatusIcon = status.icon;

  const boundedProgress = Math.min(100, Math.max(0, budget.utilizationPercentage));

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <CategoryBadge
              name={budget.categoryName}
              icon={budget.categoryIcon}
              color={budget.categoryColor}
              className="text-xs px-3 py-1 font-semibold"
            />
            {budget.notes && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                {budget.notes}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onEdit(budget)}
              title="Edit Target"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={() => onDelete(budget)}
              title="Delete Budget"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Utilization</span>
            <span className="font-semibold font-mono">
              {budget.utilizationPercentage.toFixed(1)}%
            </span>
          </div>
          <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${status.barColor}`}
              style={{ width: `${boundedProgress}%` }}
            />
          </div>
        </div>

        {/* Numbers & Status */}
        <div className="mt-4 pt-3 border-t flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Spent / Target</div>
            <div className="text-sm font-bold font-mono text-foreground mt-0.5">
              {budget.currency} {budget.spentAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                / {budget.targetAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <Badge
            variant="outline"
            className={`text-[10px] py-0.5 px-2 gap-1 font-medium ${status.badgeColor}`}
          >
            <StatusIcon className="h-3 w-3" />
            <span>{status.label}</span>
          </Badge>
        </div>

        {/* Remaining info */}
        <div className="mt-2 text-right">
          <span
            className={`text-xs font-medium ${
              budget.isOverBudget
                ? "text-rose-600 dark:text-rose-400"
                : "text-muted-foreground"
            }`}
          >
            {budget.isOverBudget
              ? `${budget.currency} ${Math.abs(budget.remainingAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} over target`
              : `${budget.currency} ${budget.remainingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} remaining`}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
