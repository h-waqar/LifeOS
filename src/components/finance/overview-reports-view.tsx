import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge } from "./category-badge";
import type { FinanceSummaryReport } from "@/types";
import {
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  PiggyBank,
  Wallet,
  CreditCard,
  PieChart,
} from "lucide-react";

interface OverviewReportsViewProps {
  summary: FinanceSummaryReport | null;
  loading: boolean;
}

export function OverviewReportsView({
  summary,
  loading,
}: OverviewReportsViewProps) {
  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Loading financial analytics & reports...
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No financial data available for this month.
      </div>
    );
  }

  const isSurplus = summary.cashFlow >= 0;

  return (
    <div className="space-y-6">
      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Net Worth Card */}
        <Card className="border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Net Worth
            </CardTitle>
            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                summary.netWorth >= 0 ? "text-primary" : "text-rose-500"
              }`}
            >
              PKR {summary.netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-2 pt-2 border-t">
              <span>Assets: PKR {summary.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span>Debt: PKR {summary.totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Cash Flow Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Monthly Cash Flow
            </CardTitle>
            <div
              className={`p-1.5 rounded-md ${
                isSurplus
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-rose-500/10 text-rose-600"
              }`}
            >
              {isSurplus ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownLeft className="h-4 w-4" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                isSurplus ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {isSurplus ? "+" : ""}PKR{" "}
              {summary.cashFlow.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-2 pt-2 border-t">
              <span className="text-emerald-600 dark:text-emerald-400">
                +{summary.totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-rose-600 dark:text-rose-400">
                -{summary.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Savings Rate Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Savings Rate
            </CardTitle>
            <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-600">
              <PiggyBank className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                summary.savingsRate > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : summary.savingsRate < 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-foreground"
              }`}
            >
              {summary.savingsRate.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
              {summary.totalIncome > 0
                ? `${((summary.cashFlow / summary.totalIncome) * 100).toFixed(1)}% of total monthly income preserved`
                : "No recorded income this month"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Category Spending Breakdown */}
      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">
                Category Spending Breakdown
              </CardTitle>
            </div>
            <span className="text-xs text-muted-foreground">
              Total Expenses: PKR{" "}
              {summary.totalExpenses.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {summary.categorySpendingBreakdown.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No category expenses recorded for this month.
            </div>
          ) : (
            <div className="space-y-4">
              {summary.categorySpendingBreakdown.map((item) => (
                <div key={item.categoryId} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CategoryBadge
                        name={item.categoryName}
                        icon={item.categoryIcon}
                        color={item.categoryColor}
                      />
                      <span className="text-muted-foreground font-mono">
                        {item.percentageOfTotal.toFixed(1)}%
                      </span>
                    </div>
                    <span className="font-semibold font-mono">
                      PKR{" "}
                      {item.spent.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(0, item.percentageOfTotal))}%`,
                        backgroundColor: item.categoryColor || "#3b82f6",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
