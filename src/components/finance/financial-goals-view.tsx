import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FinancialGoalSummary } from "@/types";
import { Target, Plus, CheckCircle2, TrendingUp, Calendar, Receipt } from "lucide-react";

interface FinancialGoalsViewProps {
  goals: FinancialGoalSummary[];
  loading: boolean;
  onLinkTransaction: (goal: FinancialGoalSummary) => void;
}

export function FinancialGoalsView({
  goals,
  loading,
  onLinkTransaction,
}: FinancialGoalsViewProps) {
  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Loading financial goals...
      </div>
    );
  }

  if (goals.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Target className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-base">No Financial Goals Created</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Create goals in the Goals module under the "Finance" area (e.g., Emergency Fund, Car Down Payment, Hajj Savings) to link transactions and track savings targets.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {goals.map((goal) => {
          const target = goal.targetValue ?? 0;
          const current = goal.currentValue;
          const progress = goal.progress;
          const isCompleted = goal.status === "completed" || progress >= 100;

          return (
            <Card key={goal.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                        <Target className="h-4 w-4" />
                      </div>
                      <h3 className="font-semibold text-sm">{goal.title}</h3>
                    </div>
                    {goal.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {goal.description}
                      </p>
                    )}
                  </div>

                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0.5 px-2 font-medium capitalize ${
                      isCompleted
                        ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                        : "border-primary/30 text-primary bg-primary/10"
                    }`}
                  >
                    {isCompleted ? "Completed" : goal.status.replace("_", " ")}
                  </Badge>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Goal Progress</span>
                    <span className="font-semibold font-mono">{progress}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isCompleted ? "bg-emerald-500" : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                  </div>
                </div>

                {/* Savings Values */}
                <div className="pt-2 border-t flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground">Saved so far</span>
                    <div className="text-base font-bold font-mono text-foreground mt-0.5">
                      PKR {current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {target > 0 && (
                        <span className="text-xs font-normal text-muted-foreground">
                          {" "}/ PKR {target.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => onLinkTransaction(goal)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Contribute</span>
                  </Button>
                </div>

                {/* Recent Linked Transactions */}
                {goal.recentTransactions.length > 0 && (
                  <div className="pt-2 border-t">
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Recent Linked Contributions
                    </div>
                    <div className="space-y-1">
                      {goal.recentTransactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/30"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Receipt className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="truncate">
                              {tx.description || tx.payee || "Contribution"}
                            </span>
                          </div>
                          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                            +{tx.currency} {parseFloat(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
