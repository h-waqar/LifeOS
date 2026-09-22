import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CategoryBadge } from "./category-badge";
import type { EnrichedTransaction, FinanceAccount, FinanceCategory } from "@/types";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Search,
  Filter,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Target,
} from "lucide-react";

interface TransactionTableProps {
  transactions: EnrichedTransaction[];
  total: number;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  onEdit: (tx: EnrichedTransaction) => void;
  onDelete: (tx: EnrichedTransaction) => void;
  filterType?: string;
  onFilterTypeChange: (type: string) => void;
  filterAccount?: string;
  onFilterAccountChange: (accountId: string) => void;
  filterCategory?: string;
  onFilterCategoryChange: (categoryId: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  page: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
}

export function TransactionTable({
  transactions,
  total,
  accounts,
  categories,
  onEdit,
  onDelete,
  filterType = "all",
  onFilterTypeChange,
  filterAccount = "all",
  onFilterAccountChange,
  filterCategory = "all",
  onFilterCategoryChange,
  searchQuery,
  onSearchQueryChange,
  page,
  pageSize,
  onPageChange,
}: TransactionTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search payee or memo..."
            value={searchQuery}
            onChange={(e) => {
              onSearchQueryChange(e.target.value);
              onPageChange(1);
            }}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => {
              onFilterTypeChange(e.target.value);
              onPageChange(1);
            }}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">All Types</option>
            <option value="expense">Expenses Only</option>
            <option value="income">Income Only</option>
            <option value="transfer">Transfers Only</option>
          </select>

          {/* Account Filter */}
          <select
            value={filterAccount}
            onChange={(e) => {
              onFilterAccountChange(e.target.value);
              onPageChange(1);
            }}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => {
              onFilterCategoryChange(e.target.value);
              onPageChange(1);
            }}
            className="h-9 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.categoryType})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Payee / Description</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Account</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {transactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No transactions found. Record your first transaction to populate the ledger.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const txDate = new Date(tx.date).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  });
                  const numericAmount = parseFloat(tx.amount);
                  const formattedAmount = numericAmount.toLocaleString(
                    undefined,
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  );

                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-xs text-muted-foreground font-mono">
                        {txDate}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {tx.transactionType === "income" && (
                          <Badge
                            variant="outline"
                            className="text-[11px] py-0 px-2 gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-medium"
                          >
                            <ArrowUpRight className="h-3 w-3" />
                            Income
                          </Badge>
                        )}
                        {tx.transactionType === "expense" && (
                          <Badge
                            variant="outline"
                            className="text-[11px] py-0 px-2 gap-1 border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10 font-medium"
                          >
                            <ArrowDownLeft className="h-3 w-3" />
                            Expense
                          </Badge>
                        )}
                        {tx.transactionType === "transfer" && (
                          <Badge
                            variant="outline"
                            className="text-[11px] py-0 px-2 gap-1 border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10 font-medium"
                          >
                            <ArrowLeftRight className="h-3 w-3" />
                            Transfer
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">
                          {tx.payee || (tx.transactionType === "transfer" ? "Internal Transfer" : "—")}
                        </div>
                        {tx.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-xs">
                            {tx.description}
                          </div>
                        )}
                        {tx.goalTitle && (
                          <div className="flex items-center gap-1 text-[11px] text-primary mt-0.5">
                            <Target className="h-3 w-3" />
                            <span>Linked to goal: {tx.goalTitle}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {tx.categoryName ? (
                          <CategoryBadge
                            name={tx.categoryName}
                            icon={tx.categoryIcon}
                            color={tx.categoryColor}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-xs">
                        {tx.transactionType === "transfer" ? (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{tx.accountName}</span>
                            <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{tx.toAccountName}</span>
                          </div>
                        ) : (
                          <span className="font-medium">{tx.accountName}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-semibold text-sm">
                        {tx.transactionType === "income" && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{tx.currency} {formattedAmount}
                          </span>
                        )}
                        {tx.transactionType === "expense" && (
                          <span className="text-rose-600 dark:text-rose-400">
                            -{tx.currency} {formattedAmount}
                          </span>
                        )}
                        {tx.transactionType === "transfer" && (
                          <span className="text-blue-600 dark:text-blue-400">
                            {tx.currency} {formattedAmount}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => onEdit(tx)}
                            title="Edit"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => onDelete(tx)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
          <div>
            Showing{" "}
            <span className="font-semibold text-foreground">
              {transactions.length > 0 ? (page - 1) * pageSize + 1 : 0}
            </span>{" "}
            to{" "}
            <span className="font-semibold text-foreground">
              {Math.min(page * pageSize, total)}
            </span>{" "}
            of <span className="font-semibold text-foreground">{total}</span>{" "}
            transactions
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
