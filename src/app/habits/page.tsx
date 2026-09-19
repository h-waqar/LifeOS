"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { HabitCard } from "@/components/habits/habit-card";
import { HabitStatsOverview } from "@/components/habits/habit-stats-overview";
import { HabitFormModal } from "@/components/habits/habit-form-modal";
import { HabitDetailModal } from "@/components/habits/habit-detail-modal";
import { HabitDeleteModal } from "@/components/habits/habit-delete-modal";
import type { HabitDTO, GoalDTO, TimeOfDayCue, HabitStatus } from "@/types";
import { Plus, Flame, Search, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function HabitsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionLoading } = useSession();

  const [habits, setHabits] = React.useState<HabitDTO[]>([]);
  const [goals, setGoals] = React.useState<GoalDTO[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Filters
  const [timeOfDayFilter, setTimeOfDayFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("active");
  const [searchQuery, setSearchQuery] = React.useState("");

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = React.useState(false);
  const [editingHabit, setEditingHabit] = React.useState<HabitDTO | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = React.useState(false);
  const [detailHabitId, setDetailHabitId] = React.useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [deletingHabit, setDeletingHabit] = React.useState<HabitDTO | null>(null);

  // Loading flags
  const [isFormSubmitting, setIsFormSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [togglingHabitIds, setTogglingHabitIds] = React.useState<Set<string>>(new Set());

  // Concurrency guards
  const isSubmittingRef = React.useRef(false);

  // Data fetching
  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [habitsRes, goalsRes] = await Promise.all([
        fetch("/api/habits"),
        fetch("/api/goals"),
      ]);

      if (habitsRes.status === 401 || goalsRes.status === 401) {
        router.replace("/login");
        return;
      }

      if (habitsRes.ok) {
        const habitsData = await habitsRes.json();
        setHabits(habitsData.habits || []);
      }

      if (goalsRes.ok) {
        const goalsData = await goalsRes.json();
        setGoals(goalsData.goals || []);
      }
    } catch (err: any) {
      toast.error("Failed to load habits data");
    } finally {
      setLoading(false);
    }
  }, [router]);

  React.useEffect(() => {
    if (!sessionLoading) {
      if (!session?.user) {
        router.replace("/login");
      } else {
        fetchData();
      }
    }
  }, [session?.user?.id, sessionLoading, router, fetchData]);

  // Open create modal if ?action=new in URL query
  React.useEffect(() => {
    if (searchParams.get("action") === "new") {
      setEditingHabit(null);
      setIsFormModalOpen(true);
    }
  }, [searchParams]);

  // Goal map for fast title lookup
  const goalMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const g of goals) {
      map.set(g.id, g.title);
    }
    return map;
  }, [goals]);

  // Single-click check-in toggle with optimistic UI updates (HABT-02)
  const handleToggleCheckin = async (habit: HabitDTO) => {
    if (togglingHabitIds.has(habit.id) || habit.status === "archived") return;

    // Snapshot previous state for rollback
    const prevIsCompleted = !!habit.isCompletedToday;
    const prevCurrentStreak = habit.currentStreak || 0;
    const nextIsCompleted = !prevIsCompleted;
    const nextCurrentStreak = nextIsCompleted
      ? prevCurrentStreak + 1
      : Math.max(0, prevCurrentStreak - 1);

    setTogglingHabitIds((prev) => new Set(prev).add(habit.id));

    // Optimistic UI state update
    setHabits((prev) =>
      prev.map((h) =>
        h.id === habit.id
          ? {
              ...h,
              isCompletedToday: nextIsCompleted,
              currentStreak: nextCurrentStreak,
            }
          : h
      )
    );

    try {
      const res = await fetch(`/api/habits/${habit.id}/toggle`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to toggle check-in");
      }

      const result = await res.json();
      const stats = result.stats;

      // Reconcile with server-derived stats
      setHabits((prev) =>
        prev.map((h) =>
          h.id === habit.id
            ? {
                ...h,
                currentStreak: stats?.currentStreak ?? (nextIsCompleted ? nextCurrentStreak : prevCurrentStreak),
                longestStreak: stats?.longestStreak ?? h.longestStreak,
                completionRate30d: stats?.completionRate30d ?? h.completionRate30d,
                completionRateAllTime: stats?.completionRateAllTime ?? h.completionRateAllTime,
                isCompletedToday: stats?.isCompletedToday ?? nextIsCompleted,
              }
            : h
        )
      );

      toast.success(
        nextIsCompleted
          ? `Checked in: ${habit.title}!`
          : `Unchecked: ${habit.title}`
      );
    } catch (err: any) {
      // Rollback optimistic state
      setHabits((prev) =>
        prev.map((h) =>
          h.id === habit.id
            ? {
                ...h,
                isCompletedToday: prevIsCompleted,
                currentStreak: prevCurrentStreak,
              }
            : h
        )
      );
      toast.error(err.message || "Failed to toggle habit check-in");
    } finally {
      setTogglingHabitIds((prev) => {
        const next = new Set(prev);
        next.delete(habit.id);
        return next;
      });
    }
  };

  // Form submit (create or edit)
  const handleFormSubmit = async (payload: Record<string, any>) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsFormSubmitting(true);

    try {
      if (editingHabit) {
        const res = await fetch(`/api/habits/${editingHabit.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to update habit");
        }

        const data = await res.json();
        setHabits((prev) =>
          prev.map((h) => (h.id === editingHabit.id ? data.habit : h))
        );
        toast.success("Habit updated successfully!");
      } else {
        const res = await fetch("/api/habits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create habit");
        }

        const data = await res.json();
        setHabits((prev) => [data.habit, ...prev]);
        toast.success("Habit created successfully!");
      }
      setIsFormModalOpen(false);
      setEditingHabit(null);
    } finally {
      isSubmittingRef.current = false;
      setIsFormSubmitting(false);
    }
  };

  // Archive / Unarchive toggle
  const handleArchiveToggle = async (habit: HabitDTO) => {
    const nextStatus: HabitStatus =
      habit.status === "archived" ? "active" : "archived";
    try {
      const res = await fetch(`/api/habits/${habit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update habit status");
      }

      const data = await res.json();
      setHabits((prev) =>
        prev.map((h) => (h.id === habit.id ? data.habit : h))
      );
      toast.success(
        nextStatus === "archived" ? "Habit archived" : "Habit restored to active"
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to change habit status");
    }
  };

  // Delete habit
  const handleDeleteConfirm = async () => {
    if (!deletingHabit) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/habits/${deletingHabit.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete habit");
      }

      setHabits((prev) => prev.filter((h) => h.id !== deletingHabit.id));
      toast.success("Habit deleted");
      setIsDeleteModalOpen(false);
      setDeletingHabit(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete habit");
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered habits list
  const filteredHabits = React.useMemo(() => {
    return habits.filter((h) => {
      // Status filter
      if (statusFilter !== "all" && h.status !== statusFilter) {
        return false;
      }
      // Time of day filter
      if (timeOfDayFilter !== "all" && h.timeOfDay !== timeOfDayFilter) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = h.title.toLowerCase().includes(q);
        const matchDesc = h.description?.toLowerCase().includes(q);
        const matchIdentity = h.identityStatement?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchIdentity) return false;
      }
      return true;
    });
  }, [habits, statusFilter, timeOfDayFilter, searchQuery]);

  const timeOfDayTabs: { label: string; value: string }[] = [
    { label: "All Cues", value: "all" },
    { label: "🌅 Morning", value: "morning" },
    { label: "☀️ Afternoon", value: "afternoon" },
    { label: "🌙 Evening", value: "evening" },
    { label: "⏰ Anytime", value: "anytime" },
  ];

  if (sessionLoading || (!session?.user && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8" data-testid="habits-dashboard-view">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                <Flame className="h-5 w-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Habits & Streaks
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Build meaningful daily consistency, track scheduled streaks, and link routines to identity.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              title="Refresh habits"
              aria-label="Refresh habits"
              disabled={loading}
              data-testid="refresh-habits-btn"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setEditingHabit(null);
                setIsFormModalOpen(true);
              }}
              className="gap-1.5"
              data-testid="new-habit-btn"
            >
              <Plus className="h-4 w-4" />
              <span>New Habit</span>
            </Button>
          </div>
        </div>

        {/* Top Consistency Metric Cards */}
        <HabitStatsOverview habits={habits} />

        {/* Filters and Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border bg-card/60 backdrop-blur">
          {/* Time of Day Filter Tabs */}
          <div
            className="flex flex-wrap items-center gap-1 overflow-x-auto pb-1 md:pb-0"
            role="tablist"
            data-testid="habit-timeofday-tabs"
          >
            {timeOfDayTabs.map((tab) => {
              const isActive = timeOfDayFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTimeOfDayFilter(tab.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                  data-testid={`tab-${tab.value}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Status & Search Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Status Dropdown */}
            <div className="w-32">
              <Select
                id="habit-filter-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                data-testid="habit-filter-status-select"
              >
                <option value="active">Active</option>
                <option value="all">All Statuses</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </Select>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-48">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search habits..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-9"
                data-testid="habit-search-input"
              />
            </div>
          </div>
        </div>

        {/* Habits List Section */}
        {loading ? (
          <div className="flex items-center justify-center py-20" data-testid="habits-loading">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredHabits.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-xl border border-dashed bg-card/40 space-y-3"
            data-testid="habits-empty-state"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Flame className="h-6 w-6 opacity-60" />
            </div>

            {habits.length === 0 ? (
              <>
                <h3 className="text-base font-semibold">No habits created yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Start forming consistent daily behaviors. Create your first habit with frequency rules, cues, and identity linkage.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingHabit(null);
                    setIsFormModalOpen(true);
                  }}
                  className="gap-1.5 mt-2"
                  data-testid="empty-create-habit-btn"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Your First Habit</span>
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold">No habits match your filters</h3>
                <p className="text-xs text-muted-foreground">
                  Try clearing your search query or selecting a different status/cue filter.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTimeOfDayFilter("all");
                    setStatusFilter("all");
                    setSearchQuery("");
                  }}
                  className="mt-2 text-xs"
                  data-testid="reset-filters-btn"
                >
                  Reset Filters
                </Button>
              </>
            )}
          </div>
        ) : (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            data-testid="habits-grid"
          >
            {filteredHabits.map((habit) => (
              <HabitCard
                key={habit.id}
                habit={habit}
                goalTitle={habit.goalId ? goalMap.get(habit.goalId) : undefined}
                onToggle={handleToggleCheckin}
                isToggling={togglingHabitIds.has(habit.id)}
                onViewDetails={(h) => {
                  setDetailHabitId(h.id);
                  setIsDetailModalOpen(true);
                }}
                onEdit={(h) => {
                  setEditingHabit(h);
                  setIsFormModalOpen(true);
                }}
                onArchiveToggle={handleArchiveToggle}
                onDelete={(h) => {
                  setDeletingHabit(h);
                  setIsDeleteModalOpen(true);
                }}
              />
            ))}
          </div>
        )}

        {/* Create / Edit Habit Modal */}
        <HabitFormModal
          isOpen={isFormModalOpen}
          onClose={() => {
            setIsFormModalOpen(false);
            setEditingHabit(null);
          }}
          initialHabit={editingHabit}
          goals={goals}
          onSubmit={handleFormSubmit}
          isSubmitting={isFormSubmitting}
        />

        {/* Habit Detail Modal */}
        <HabitDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setDetailHabitId(null);
          }}
          habitId={detailHabitId}
          goalTitle={
            detailHabitId
              ? goalMap.get(habits.find((h) => h.id === detailHabitId)?.goalId || "")
              : undefined
          }
          onEdit={(h) => {
            setIsDetailModalOpen(false);
            setEditingHabit(h);
            setIsFormModalOpen(true);
          }}
          onHabitUpdated={fetchData}
        />

        {/* Habit Delete Modal */}
        <HabitDeleteModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setDeletingHabit(null);
          }}
          habit={deletingHabit}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeleting}
        />
      </div>
    </AppShell>
  );
}

export default function HabitsPage() {
  return (
    <React.Suspense
      fallback={
        <AppShell>
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </AppShell>
      }
    >
      <HabitsContent />
    </React.Suspense>
  );
}
