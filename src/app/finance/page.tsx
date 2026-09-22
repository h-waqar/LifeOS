"use client";

import * as React from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AccountCard } from "@/components/finance/account-card";
import { AccountModal } from "@/components/finance/account-modal";
import { TransactionModal } from "@/components/finance/transaction-modal";
import { TransactionTable } from "@/components/finance/transaction-table";
import { BudgetCard } from "@/components/finance/budget-card";
import { BudgetModal } from "@/components/finance/budget-modal";
import { OverviewReportsView } from "@/components/finance/overview-reports-view";
import { FinancialGoalsView } from "@/components/finance/financial-goals-view";
import type {
  FinanceAccount,
  FinanceCategory,
  EnrichedTransaction,
  CategoryBudgetProgress,
  FinanceSummaryReport,
  FinancialGoalSummary,
} from "@/types";
import {
  Wallet,
  Plus,
  Receipt,
  PieChart,
  Target,
  RefreshCw,
  Copy,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

export default function FinancePage() {
  const [activeTab, setActiveTab] = React.useState<
    "overview" | "accounts" | "transactions" | "budgets" | "goals"
  >("overview");

  // Current month state in YYYY-MM format
  const [selectedMonth, setSelectedMonth] = React.useState(
    () => new Date().toISOString().slice(0, 7)
  );

  // Data states
  const [accounts, setAccounts] = React.useState<FinanceAccount[]>([]);
  const [categories, setCategories] = React.useState<FinanceCategory[]>([]);
  const [transactions, setTransactions] = React.useState<EnrichedTransaction[]>([]);
  const [totalTransactions, setTotalTransactions] = React.useState(0);
  const [budgets, setBudgets] = React.useState<CategoryBudgetProgress[]>([]);
  const [summaryReport, setSummaryReport] = React.useState<FinanceSummaryReport | null>(null);
  const [financialGoals, setFinancialGoals] = React.useState<FinancialGoalSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingBudgets, setLoadingBudgets] = React.useState(false);
  const [loadingReport, setLoadingReport] = React.useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterType, setFilterType] = React.useState("all");
  const [filterAccount, setFilterAccount] = React.useState("all");
  const [filterCategory, setFilterCategory] = React.useState("all");
  const [includeArchivedAccounts, setIncludeArchivedAccounts] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const pageSize = 25;

  // Modals
  const [accountModalOpen, setAccountModalOpen] = React.useState(false);
  const [editingAccount, setEditingAccount] = React.useState<FinanceAccount | null>(null);
  const [transactionModalOpen, setTransactionModalOpen] = React.useState(false);
  const [editingTransaction, setEditingTransaction] = React.useState<EnrichedTransaction | null>(null);
  const [budgetModalOpen, setBudgetModalOpen] = React.useState(false);
  const [editingBudget, setEditingBudget] = React.useState<CategoryBudgetProgress | null>(null);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split("-");
    let y = parseInt(yearStr, 10);
    let m = parseInt(monthStr, 10) - 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, "0")}`);
  };

  const handleNextMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split("-");
    let y = parseInt(yearStr, 10);
    let m = parseInt(monthStr, 10) + 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, "0")}`);
  };

  const formattedMonthLabel = React.useMemo(() => {
    const [y, m] = selectedMonth.split("-");
    const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [selectedMonth]);

  // Fetch accounts
  const fetchAccounts = React.useCallback(async () => {
    try {
      const res = await fetch(
        `/api/finance/accounts?includeArchived=${includeArchivedAccounts}`
      );
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
      }
    } catch {
      toast.error("Failed to load accounts");
    }
  }, [includeArchivedAccounts]);

  // Fetch categories
  const fetchCategories = React.useCallback(async () => {
    try {
      const res = await fetch("/api/finance/categories?includeArchived=false");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch {
      toast.error("Failed to load categories");
    }
  }, []);

  // Fetch financial goals
  const fetchFinancialGoals = React.useCallback(async () => {
    try {
      const res = await fetch("/api/finance/goals");
      if (res.ok) {
        const data = await res.json();
        setFinancialGoals(data.goals || []);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  // Fetch transactions
  const fetchTransactions = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (filterType !== "all") params.set("transactionType", filterType);
      if (filterAccount !== "all") params.set("accountId", filterAccount);
      if (filterCategory !== "all") params.set("categoryId", filterCategory);
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));

      const res = await fetch(`/api/finance/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setTotalTransactions(data.total || 0);
      }
    } catch {
      toast.error("Failed to load transactions");
    }
  }, [searchQuery, filterType, filterAccount, filterCategory, page]);

  // Fetch budgets for selectedMonth
  const fetchBudgets = React.useCallback(async () => {
    setLoadingBudgets(true);
    try {
      const res = await fetch(`/api/finance/budgets?month=${selectedMonth}`);
      if (res.ok) {
        const data = await res.json();
        setBudgets(data.budgets || []);
      }
    } catch {
      toast.error("Failed to load budgets");
    } finally {
      setLoadingBudgets(false);
    }
  }, [selectedMonth]);

  // Fetch summary report for selectedMonth
  const fetchSummaryReport = React.useCallback(async () => {
    setLoadingReport(true);
    try {
      const res = await fetch(`/api/finance/reports/summary?month=${selectedMonth}`);
      if (res.ok) {
        const data = await res.json();
        setSummaryReport(data.summary || null);
      }
    } catch {
      toast.error("Failed to load summary report");
    } finally {
      setLoadingReport(false);
    }
  }, [selectedMonth]);

  // Initial load
  React.useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([
        fetchAccounts(),
        fetchCategories(),
        fetchTransactions(),
        fetchFinancialGoals(),
        fetchBudgets(),
        fetchSummaryReport(),
      ]);
      setLoading(false);
    }
    init();
  }, [
    fetchAccounts,
    fetchCategories,
    fetchTransactions,
    fetchFinancialGoals,
    fetchBudgets,
    fetchSummaryReport,
  ]);

  // Refresh all
  const refreshAll = async () => {
    await Promise.all([
      fetchAccounts(),
      fetchTransactions(),
      fetchCategories(),
      fetchFinancialGoals(),
      fetchBudgets(),
      fetchSummaryReport(),
    ]);
  };

  // Archive / Unarchive account
  const handleArchiveAccount = async (account: FinanceAccount) => {
    try {
      const res = await fetch(`/api/finance/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: !account.isArchived }),
      });
      if (res.ok) {
        toast.success(
          account.isArchived
            ? "Account unarchived"
            : "Account archived successfully"
        );
        fetchAccounts();
        fetchSummaryReport();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update account");
      }
    } catch {
      toast.error("Failed to update account");
    }
  };

  // Delete account
  const handleDeleteAccount = async (account: FinanceAccount) => {
    if (!confirm(`Are you sure you want to delete "${account.name}"?`)) return;

    try {
      const res = await fetch(`/api/finance/accounts/${account.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Account deleted");
        fetchAccounts();
        fetchSummaryReport();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete account");
      }
    } catch {
      toast.error("Failed to delete account");
    }
  };

  // Delete transaction
  const handleDeleteTransaction = async (tx: EnrichedTransaction) => {
    if (
      !confirm(
        "Are you sure you want to delete this transaction? Account balance will be reversed."
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/finance/transactions/${tx.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Transaction deleted and balance reversed");
        refreshAll();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete transaction");
      }
    } catch {
      toast.error("Failed to delete transaction");
    }
  };

  // Delete budget
  const handleDeleteBudget = async (b: CategoryBudgetProgress) => {
    if (!confirm(`Delete budget target for ${b.categoryName}?`)) return;

    try {
      const res = await fetch(`/api/finance/budgets/${b.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Budget target deleted");
        fetchBudgets();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete budget");
      }
    } catch {
      toast.error("Failed to delete budget");
    }
  };

  // Copy previous month budgets
  const handleCopyPreviousBudgets = async () => {
    try {
      const res = await fetch("/api/finance/budgets/copy-previous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMonth: selectedMonth }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.copiedCount > 0) {
          toast.success(`Copied ${data.copiedCount} budget targets from previous month`);
          fetchBudgets();
        } else {
          toast.info("No previous month budgets available to copy");
        }
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to copy budgets");
      }
    } catch {
      toast.error("Failed to copy budgets");
    }
  };

  // Goal shortcut: open transaction modal pre-linked to goal
  const handleContributeToGoal = (goal: FinancialGoalSummary) => {
    setEditingTransaction({
      id: "",
      userId: "",
      accountId: accounts.find((a) => !a.isArchived)?.id || "",
      toAccountId: null,
      accountName: "",
      transactionType: "income",
      amount: "0.00",
      currency: "PKR",
      date: new Date(),
      categoryId: null,
      payee: `Savings contribution: ${goal.title}`,
      description: `Contribution towards ${goal.title}`,
      goalId: goal.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    setTransactionModalOpen(true);
  };

  const goalOptions = React.useMemo(() => {
    return financialGoals.map((g) => ({ id: g.id, title: g.title }));
  }, [financialGoals]);

  return (
    <AppShell>
      <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Wallet className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                Personal Finance
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Private financial ledger, monthly budgets, goal progress, and net worth reports in PKR.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingAccount(null);
                setAccountModalOpen(true);
              }}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Add Account</span>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingTransaction(null);
                setTransactionModalOpen(true);
              }}
              className="gap-1.5"
            >
              <Receipt className="h-4 w-4" />
              <span>Record Transaction</span>
            </Button>
          </div>
        </div>

        {/* Global Month Navigator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 p-3 rounded-lg border">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handlePrevMonth}
              title="Previous Month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold text-sm px-2 min-w-36 text-center">
              {formattedMonthLabel}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleNextMonth}
              title="Next Month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === "budgets" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPreviousBudgets}
                  className="gap-1.5 h-8 text-xs"
                  title="Copy targets from previous month"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Last Month</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingBudget(null);
                    setBudgetModalOpen(true);
                  }}
                  className="gap-1.5 h-8 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Set Budget Target</span>
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshAll}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title="Refresh Finance Data"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 border-b overflow-x-auto">
          <button
            onClick={() => setActiveTab("overview")}
            className={`pb-3 px-3 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "overview"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <PieChart className="h-4 w-4" />
            <span>Overview & Reports</span>
          </button>
          <button
            onClick={() => setActiveTab("accounts")}
            className={`pb-3 px-3 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "accounts"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Wallet className="h-4 w-4" />
            <span>Accounts ({accounts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("transactions")}
            className={`pb-3 px-3 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "transactions"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Receipt className="h-4 w-4" />
            <span>Ledger</span>
          </button>
          <button
            onClick={() => setActiveTab("budgets")}
            className={`pb-3 px-3 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "budgets"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            <span>Budgets ({budgets.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("goals")}
            className={`pb-3 px-3 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "goals"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Target className="h-4 w-4" />
            <span>Financial Goals ({financialGoals.length})</span>
          </button>
        </div>

        {/* Tab 1: Overview & Reports */}
        {activeTab === "overview" && (
          <OverviewReportsView summary={summaryReport} loading={loadingReport} />
        )}

        {/* Tab 2: Accounts */}
        {activeTab === "accounts" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Your Financial Accounts</h2>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeArchivedAccounts}
                  onChange={(e) => setIncludeArchivedAccounts(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary"
                />
                <span>Show archived accounts</span>
              </label>
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Loading accounts...
              </div>
            ) : accounts.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold text-base">No Accounts Configured</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Create your first account (Checking, Savings, Investment, Credit Card, or Cash) to begin tracking your net worth.
                  </p>
                  <Button
                    onClick={() => {
                      setEditingAccount(null);
                      setAccountModalOpen(true);
                    }}
                    className="gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add First Account</span>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {accounts.map((acc) => (
                  <AccountCard
                    key={acc.id}
                    account={acc}
                    onEdit={(a) => {
                      setEditingAccount(a);
                      setAccountModalOpen(true);
                    }}
                    onArchive={handleArchiveAccount}
                    onDelete={handleDeleteAccount}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Transactions */}
        {activeTab === "transactions" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Transaction Ledger</h2>
                <p className="text-xs text-muted-foreground">
                  Record and filter income, expenses, and atomic inter-account transfers.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={refreshAll}
                className="gap-1.5 h-8 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Refresh</span>
              </Button>
            </div>

            <TransactionTable
              transactions={transactions}
              total={totalTransactions}
              accounts={accounts}
              categories={categories}
              onEdit={(tx) => {
                setEditingTransaction(tx);
                setTransactionModalOpen(true);
              }}
              onDelete={handleDeleteTransaction}
              filterType={filterType}
              onFilterTypeChange={setFilterType}
              filterAccount={filterAccount}
              onFilterAccountChange={setFilterAccount}
              filterCategory={filterCategory}
              onFilterCategoryChange={setFilterCategory}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          </div>
        )}

        {/* Tab 4: Budgets */}
        {activeTab === "budgets" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">
                  Category Budgets for {formattedMonthLabel}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Real-time spending vs monthly targets. Transfers are strictly excluded from spending.
                </p>
              </div>
            </div>

            {loadingBudgets ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Loading monthly budgets...
              </div>
            ) : budgets.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold text-base">
                    No Budgets Set for {formattedMonthLabel}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Set monthly targets by category to track spending thresholds, or copy targets from the previous month.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={handleCopyPreviousBudgets}
                      className="gap-1.5"
                    >
                      <Copy className="h-4 w-4" />
                      <span>Copy Last Month</span>
                    </Button>
                    <Button
                      onClick={() => {
                        setEditingBudget(null);
                        setBudgetModalOpen(true);
                      }}
                      className="gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Set First Budget Target</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {budgets.map((b) => (
                  <BudgetCard
                    key={b.id}
                    budget={b}
                    onEdit={(item) => {
                      setEditingBudget(item);
                      setBudgetModalOpen(true);
                    }}
                    onDelete={handleDeleteBudget}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Financial Goals */}
        {activeTab === "goals" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">Financial Goals</h2>
              <p className="text-xs text-muted-foreground">
                Phase 2 Goals in the "Finance" area. Progress automatically synchronizes when transactions are recorded.
              </p>
            </div>

            <FinancialGoalsView
              goals={financialGoals}
              loading={loading}
              onLinkTransaction={handleContributeToGoal}
            />
          </div>
        )}

        {/* Modals */}
        <AccountModal
          isOpen={accountModalOpen}
          onClose={() => setAccountModalOpen(false)}
          onSuccess={refreshAll}
          editingAccount={editingAccount}
        />

        <TransactionModal
          isOpen={transactionModalOpen}
          onClose={() => {
            setTransactionModalOpen(false);
            setEditingTransaction(null);
          }}
          onSuccess={refreshAll}
          accounts={accounts}
          categories={categories}
          goals={goalOptions}
          editingTransaction={editingTransaction}
        />

        <BudgetModal
          isOpen={budgetModalOpen}
          onClose={() => {
            setBudgetModalOpen(false);
            setEditingBudget(null);
          }}
          onSuccess={fetchBudgets}
          month={selectedMonth}
          categories={categories}
          existingBudgets={budgets}
          editingBudget={editingBudget}
        />
      </div>
    </AppShell>
  );
}
