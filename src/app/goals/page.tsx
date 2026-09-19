"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  PriorityBadge,
  AreaBadge,
  HorizonBadge,
} from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type {
  GoalDTO,
  GoalHorizon,
  LifeArea,
  GoalStatus,
  Priority,
  GoalMetricType,
} from "@/types";
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  AlertTriangle,
  Target,
  FolderKanban,
  CheckSquare,
  TrendingUp,
  Calendar,
  GitBranch,
} from "lucide-react";
import { toast } from "sonner";

function GoalsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionLoading } = useSession();

  const [goals, setGoals] = React.useState<GoalDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [horizonFilter, setHorizonFilter] = React.useState<string>("all");
  const [areaFilter, setAreaFilter] = React.useState<string>("all");

  // Create Goal Modal
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [horizon, setHorizon] = React.useState<GoalHorizon>("medium_term");
  const [area, setArea] = React.useState<LifeArea>("general");
  const [status, setStatus] = React.useState<GoalStatus>("in_progress");
  const [priority, setPriority] = React.useState<Priority>("medium");
  const [metricType, setMetricType] = React.useState<GoalMetricType>("none");
  const [targetValue, setTargetValue] = React.useState<string>("");
  const [currentValue, setCurrentValue] = React.useState<string>("0");
  const [unit, setUnit] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [targetDate, setTargetDate] = React.useState("");
  const [parentGoalId, setParentGoalId] = React.useState("");
  const [createLoading, setCreateLoading] = React.useState(false);

  // Edit Goal Modal
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editingGoal, setEditingGoal] = React.useState<GoalDTO | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [editHorizon, setEditHorizon] = React.useState<GoalHorizon>("medium_term");
  const [editArea, setEditArea] = React.useState<LifeArea>("general");
  const [editStatus, setEditStatus] = React.useState<GoalStatus>("in_progress");
  const [editPriority, setEditPriority] = React.useState<Priority>("medium");
  const [editMetricType, setEditMetricType] = React.useState<GoalMetricType>("none");
  const [editTargetValue, setEditTargetValue] = React.useState<string>("");
  const [editCurrentValue, setEditCurrentValue] = React.useState<string>("0");
  const [editUnit, setEditUnit] = React.useState("");
  const [editStartDate, setEditStartDate] = React.useState("");
  const [editTargetDate, setEditTargetDate] = React.useState("");
  const [editParentGoalId, setEditParentGoalId] = React.useState("");
  const [editLoading, setEditLoading] = React.useState(false);

  // Quick Update Metric Modal
  const [isQuickMetricOpen, setIsQuickMetricOpen] = React.useState(false);
  const [metricGoal, setMetricGoal] = React.useState<GoalDTO | null>(null);
  const [quickMetricValue, setQuickMetricValue] = React.useState<string>("");
  const [quickMetricLoading, setQuickMetricLoading] = React.useState(false);

  // Delete Goal Modal
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [deletingGoal, setDeletingGoal] = React.useState<GoalDTO | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const isCreatingRef = React.useRef(false);
  const isEditingRef = React.useRef(false);
  const isDeletingRef = React.useRef(false);

  const fetchGoals = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (horizonFilter !== "all") params.append("horizon", horizonFilter);
      if (areaFilter !== "all") params.append("area", areaFilter);

      const qs = params.toString();
      const url = qs ? `/api/goals?${qs}` : "/api/goals";

      const res = await fetch(url);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      if (!res.ok) throw new Error("Failed to load goals");
      const data = await res.json();
      setGoals(data.goals || []);
    } catch (err: any) {
      toast.error(err.message || "Could not load goals");
    } finally {
      setLoading(false);
    }
  }, [router, horizonFilter, areaFilter]);

  React.useEffect(() => {
    if (!sessionLoading) {
      if (!session?.user) {
        router.replace("/login");
      } else {
        fetchGoals();
      }
    }
  }, [session, sessionLoading, router, fetchGoals]);

  // Open create modal if ?action=new in URL
  React.useEffect(() => {
    if (searchParams.get("action") === "new") {
      setIsCreateOpen(true);
    }
  }, [searchParams]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingRef.current) return;

    if (!title.trim()) {
      toast.error("Goal title is required");
      return;
    }

    isCreatingRef.current = true;
    setCreateLoading(true);
    try {
      const payload: Record<string, any> = {
        title: title.trim(),
        description: description.trim() || undefined,
        horizon,
        area,
        status,
        priority,
        metricType,
        targetValue: targetValue ? parseFloat(targetValue) : undefined,
        currentValue: currentValue ? parseFloat(currentValue) : 0,
        unit: unit.trim() || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        targetDate: targetDate ? new Date(targetDate).toISOString() : undefined,
        parentGoalId: parentGoalId || undefined,
      };

      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create goal");
      }

      toast.success("Goal created successfully!");
      setIsCreateOpen(false);
      setTitle("");
      setDescription("");
      setHorizon("medium_term");
      setArea("general");
      setStatus("in_progress");
      setPriority("medium");
      setMetricType("none");
      setTargetValue("");
      setCurrentValue("0");
      setUnit("");
      setStartDate("");
      setTargetDate("");
      setParentGoalId("");
      fetchGoals();
    } catch (err: any) {
      toast.error(err.message || "Failed to create goal");
    } finally {
      isCreatingRef.current = false;
      setCreateLoading(false);
    }
  };

  const openEdit = (g: GoalDTO) => {
    setEditingGoal(g);
    setEditTitle(g.title);
    setEditDescription(g.description || "");
    setEditHorizon(g.horizon);
    setEditArea(g.area);
    setEditStatus(g.status);
    setEditPriority(g.priority);
    setEditMetricType(g.metricType);
    setEditTargetValue(g.targetValue !== null ? String(g.targetValue) : "");
    setEditCurrentValue(g.currentValue !== null ? String(g.currentValue) : "0");
    setEditUnit(g.unit || "");
    setEditStartDate(g.startDate ? g.startDate.slice(0, 10) : "");
    setEditTargetDate(g.targetDate ? g.targetDate.slice(0, 10) : "");
    setEditParentGoalId(g.parentGoalId || "");
    setIsEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditingRef.current || !editingGoal) return;

    if (!editTitle.trim()) {
      toast.error("Goal title is required");
      return;
    }

    isEditingRef.current = true;
    setEditLoading(true);
    try {
      const payload: Record<string, any> = {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        horizon: editHorizon,
        area: editArea,
        status: editStatus,
        priority: editPriority,
        metricType: editMetricType,
        targetValue: editTargetValue ? parseFloat(editTargetValue) : null,
        currentValue: editCurrentValue ? parseFloat(editCurrentValue) : 0,
        unit: editUnit.trim() || null,
        startDate: editStartDate ? new Date(editStartDate).toISOString() : null,
        targetDate: editTargetDate ? new Date(editTargetDate).toISOString() : null,
        parentGoalId: editParentGoalId || null,
      };

      const res = await fetch(`/api/goals/${editingGoal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update goal");
      }

      toast.success("Goal updated successfully!");
      setIsEditOpen(false);
      setEditingGoal(null);
      fetchGoals();
    } catch (err: any) {
      toast.error(err.message || "Failed to update goal");
    } finally {
      isEditingRef.current = false;
      setEditLoading(false);
    }
  };

  const openQuickMetric = (g: GoalDTO) => {
    setMetricGoal(g);
    setQuickMetricValue(String(g.currentValue ?? 0));
    setIsQuickMetricOpen(true);
  };

  const handleQuickMetric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metricGoal) return;

    setQuickMetricLoading(true);
    try {
      const parsedVal = parseFloat(quickMetricValue);
      if (isNaN(parsedVal)) {
        toast.error("Please enter a valid numeric value");
        return;
      }

      const res = await fetch(`/api/goals/${metricGoal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentValue: parsedVal }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update metric");
      }

      toast.success("Goal metric updated!");
      setIsQuickMetricOpen(false);
      setMetricGoal(null);
      fetchGoals();
    } catch (err: any) {
      toast.error(err.message || "Failed to update metric");
    } finally {
      setQuickMetricLoading(false);
    }
  };

  const openDelete = (g: GoalDTO) => {
    setDeletingGoal(g);
    setIsDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (isDeletingRef.current || !deletingGoal) return;

    isDeletingRef.current = true;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/goals/${deletingGoal.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete goal");
      }

      toast.success("Goal deleted.");
      setIsDeleteOpen(false);
      setDeletingGoal(null);
      fetchGoals();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete goal");
    } finally {
      isDeletingRef.current = false;
      setDeleteLoading(false);
    }
  };

  const horizonTabs = [
    { label: "All Horizons", value: "all" },
    { label: "Long-term (1-5y)", value: "long_term" },
    { label: "Medium-term (Annual/Qtr)", value: "medium_term" },
    { label: "Short-term (Monthly)", value: "short_term" },
  ];

  const areaOptions = [
    { label: "All Areas", value: "all" },
    { label: "Health", value: "health" },
    { label: "Career", value: "career" },
    { label: "Finance", value: "finance" },
    { label: "Personal Development", value: "personal_development" },
    { label: "Relationships", value: "relationships" },
    { label: "General", value: "general" },
  ];

  return (
    <AppShell>
      <div className="space-y-6" data-testid="goals-view">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5">
              <Target className="h-7 w-7 text-primary" />
              <span>Goals Hierarchy</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Multi-horizon goal planning, metric tracking, and automated progress rollups
            </p>
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="gap-2"
            data-testid="create-goal-btn"
          >
            <Plus className="h-4 w-4" />
            <span>New Goal</span>
          </Button>
        </div>

        {/* Filter Controls: Horizon Tabs and Life Area Dropdown */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
          <div className="flex flex-wrap gap-2">
            {horizonTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setHorizonFilter(tab.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  horizonFilter === tab.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
                data-testid={`horizon-tab-${tab.value}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Area:
            </span>
            <Select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="h-8 text-xs w-44"
              data-testid="area-filter-select"
            >
              {areaOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Goals Grid / Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : goals.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Target className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No goals found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
              {horizonFilter === "all" && areaFilter === "all"
                ? "You haven't defined any goals yet. Create multi-horizon goals to guide your personal and professional growth."
                : "No goals match the selected horizon and area filters."}
            </p>
            <Button
              onClick={() => setIsCreateOpen(true)}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              <span>Create Goal</span>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="goals-grid">
            {goals.map((goal) => {
              const progressPct = goal.progress ?? 0;
              const hasMetric = goal.metricType && goal.metricType !== "none";

              return (
                <Card
                  key={goal.id}
                  className="flex flex-col justify-between transition-all hover:border-primary/50 shadow-sm"
                  data-testid={`goal-card-${goal.id}`}
                >
                  <CardHeader className="pb-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-bold line-clamp-1">
                        {goal.title}
                      </CardTitle>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <StatusBadge status={goal.status} />
                        <PriorityBadge priority={goal.priority} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <HorizonBadge horizon={goal.horizon} />
                      <AreaBadge area={goal.area} />
                      {goal.targetDate && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(goal.targetDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {goal.description && (
                      <CardDescription className="line-clamp-2 text-xs">
                        {goal.description}
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="py-2 space-y-3">
                    {/* Automated Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium text-muted-foreground">
                        <span>Rollup Progress</span>
                        <span className="text-foreground font-semibold">{progressPct}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-2 rounded-full transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Metric Display if configured */}
                    {hasMetric && (
                      <div className="flex items-center justify-between p-2 rounded-md bg-muted/40 border text-xs">
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5 text-primary" />
                          <span className="text-muted-foreground capitalize">
                            {goal.metricType}:
                          </span>
                          <span className="font-semibold text-foreground">
                            {goal.metricType === "currency" ? "$" : ""}
                            {goal.currentValue ?? 0} /{" "}
                            {goal.targetValue !== null ? `${goal.metricType === "currency" ? "$" : ""}${goal.targetValue}` : "N/A"}
                            {goal.unit ? ` ${goal.unit}` : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openQuickMetric(goal)}
                          className="text-primary hover:underline text-[11px] font-medium"
                          data-testid={`quick-metric-btn-${goal.id}`}
                        >
                          Update
                        </button>
                      </div>
                    )}

                    {/* Deliverables summary counts */}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                      <span className="inline-flex items-center gap-1">
                        <FolderKanban className="h-3 w-3" />
                        {goal.linkedProjectsCount || 0} projects
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CheckSquare className="h-3 w-3" />
                        {goal.directTasksCount || 0} tasks
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {goal.childGoalsCount || 0} sub-goals
                      </span>
                    </div>
                  </CardContent>

                  <CardFooter className="flex items-center justify-between border-t pt-3 pb-3 text-xs text-muted-foreground">
                    <span>Updated {new Date(goal.updatedAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(goal)}
                        title="Edit goal"
                        data-testid={`edit-goal-${goal.id}`}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => openDelete(goal)}
                        title="Delete goal"
                        data-testid={`delete-goal-${goal.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create Goal Modal */}
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Create New Goal"
          description="Establish a multi-horizon goal with metrics and area alignment"
        >
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label
                htmlFor="create-goal-title"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Goal Title *
              </label>
              <Input
                id="create-goal-title"
                name="title"
                placeholder="e.g. Master Full-Stack AI Engineering"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
                disabled={createLoading}
                data-testid="new-goal-title"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="create-goal-desc"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Description
              </label>
              <Textarea
                id="create-goal-desc"
                name="description"
                placeholder="Purpose, outcome, and success criteria..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={createLoading}
                data-testid="new-goal-desc"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="create-goal-horizon"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Horizon
                </label>
                <Select
                  id="create-goal-horizon"
                  name="horizon"
                  value={horizon}
                  onChange={(e) => setHorizon(e.target.value as GoalHorizon)}
                  disabled={createLoading}
                  data-testid="new-goal-horizon"
                >
                  <option value="long_term">Long-term (1-5 years)</option>
                  <option value="medium_term">Medium-term (Annual/Quarterly)</option>
                  <option value="short_term">Short-term (Monthly)</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="create-goal-area"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Life Area
                </label>
                <Select
                  id="create-goal-area"
                  name="area"
                  value={area}
                  onChange={(e) => setArea(e.target.value as LifeArea)}
                  disabled={createLoading}
                  data-testid="new-goal-area"
                >
                  <option value="general">General</option>
                  <option value="health">Health</option>
                  <option value="career">Career</option>
                  <option value="finance">Finance</option>
                  <option value="personal_development">Personal Development</option>
                  <option value="relationships">Relationships</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="create-goal-status"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Status
                </label>
                <Select
                  id="create-goal-status"
                  name="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as GoalStatus)}
                  disabled={createLoading}
                  data-testid="new-goal-status"
                >
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="paused">Paused</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="create-goal-priority"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Priority
                </label>
                <Select
                  id="create-goal-priority"
                  name="priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  disabled={createLoading}
                  data-testid="new-goal-priority"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>
            </div>

            {/* Parent Goal Selector */}
            <div className="space-y-1.5">
              <label
                htmlFor="create-goal-parent"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Parent Goal (Optional Hierarchy)
              </label>
              <Select
                id="create-goal-parent"
                name="parentGoalId"
                value={parentGoalId}
                onChange={(e) => setParentGoalId(e.target.value)}
                disabled={createLoading}
                data-testid="new-goal-parent"
              >
                <option value="">None (Top-level Goal)</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    [{g.horizon.replace("_", " ")}] {g.title}
                  </option>
                ))}
              </Select>
            </div>

            {/* Metric Configuration */}
            <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                Key Metric Tracking
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="create-metric-type" className="text-[11px] text-muted-foreground">
                    Metric Type
                  </label>
                  <Select
                    id="create-metric-type"
                    value={metricType}
                    onChange={(e) => setMetricType(e.target.value as GoalMetricType)}
                    disabled={createLoading}
                    data-testid="new-goal-metric-type"
                  >
                    <option value="none">None (Deliverables Only)</option>
                    <option value="numeric">Numeric Target</option>
                    <option value="currency">Currency Target ($)</option>
                    <option value="percentage">Percentage Target (%)</option>
                    <option value="boolean">Boolean (Done/Not Done)</option>
                  </Select>
                </div>

                {metricType !== "none" && (
                  <div className="space-y-1">
                    <label htmlFor="create-target-val" className="text-[11px] text-muted-foreground">
                      Target Value
                    </label>
                    <Input
                      id="create-target-val"
                      type="number"
                      step="any"
                      placeholder="e.g. 100"
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      disabled={createLoading}
                      data-testid="new-goal-target-val"
                    />
                  </div>
                )}
              </div>

              {metricType !== "none" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="create-current-val" className="text-[11px] text-muted-foreground">
                      Initial Current Value
                    </label>
                    <Input
                      id="create-current-val"
                      type="number"
                      step="any"
                      placeholder="0"
                      value={currentValue}
                      onChange={(e) => setCurrentValue(e.target.value)}
                      disabled={createLoading}
                      data-testid="new-goal-current-val"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="create-unit" className="text-[11px] text-muted-foreground">
                      Unit (Optional)
                    </label>
                    <Input
                      id="create-unit"
                      placeholder="e.g. books, km, hours"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      disabled={createLoading}
                      data-testid="new-goal-unit"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Target Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="create-start-date" className="text-xs font-semibold uppercase text-muted-foreground">
                  Start Date
                </label>
                <Input
                  id="create-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={createLoading}
                  data-testid="new-goal-start-date"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="create-target-date" className="text-xs font-semibold uppercase text-muted-foreground">
                  Target Date
                </label>
                <Input
                  id="create-target-date"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  disabled={createLoading}
                  data-testid="new-goal-target-date"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
                disabled={createLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={createLoading}
                data-testid="submit-create-goal"
              >
                Create Goal
              </Button>
            </div>
          </form>
        </Modal>

        {/* Edit Goal Modal */}
        <Modal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          title="Edit Goal"
          description="Update goal settings, hierarchy, or metrics"
        >
          <form onSubmit={handleEdit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label
                htmlFor="edit-goal-title"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Goal Title *
              </label>
              <Input
                id="edit-goal-title"
                name="title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                disabled={editLoading}
                data-testid="edit-goal-title"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-goal-desc"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Description
              </label>
              <Textarea
                id="edit-goal-desc"
                name="description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={editLoading}
                data-testid="edit-goal-desc"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="edit-goal-horizon" className="text-xs font-semibold uppercase text-muted-foreground">
                  Horizon
                </label>
                <Select
                  id="edit-goal-horizon"
                  name="horizon"
                  value={editHorizon}
                  onChange={(e) => setEditHorizon(e.target.value as GoalHorizon)}
                  disabled={editLoading}
                  data-testid="edit-goal-horizon"
                >
                  <option value="long_term">Long-term (1-5 years)</option>
                  <option value="medium_term">Medium-term (Annual/Quarterly)</option>
                  <option value="short_term">Short-term (Monthly)</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-goal-area" className="text-xs font-semibold uppercase text-muted-foreground">
                  Life Area
                </label>
                <Select
                  id="edit-goal-area"
                  name="area"
                  value={editArea}
                  onChange={(e) => setEditArea(e.target.value as LifeArea)}
                  disabled={editLoading}
                  data-testid="edit-goal-area"
                >
                  <option value="general">General</option>
                  <option value="health">Health</option>
                  <option value="career">Career</option>
                  <option value="finance">Finance</option>
                  <option value="personal_development">Personal Development</option>
                  <option value="relationships">Relationships</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="edit-goal-status" className="text-xs font-semibold uppercase text-muted-foreground">
                  Status
                </label>
                <Select
                  id="edit-goal-status"
                  name="status"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as GoalStatus)}
                  disabled={editLoading}
                  data-testid="edit-goal-status"
                >
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="paused">Paused</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-goal-priority" className="text-xs font-semibold uppercase text-muted-foreground">
                  Priority
                </label>
                <Select
                  id="edit-goal-priority"
                  name="priority"
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as Priority)}
                  disabled={editLoading}
                  data-testid="edit-goal-priority"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>
            </div>

            {/* Parent Goal Selector (Excluding self) */}
            <div className="space-y-1.5">
              <label htmlFor="edit-goal-parent" className="text-xs font-semibold uppercase text-muted-foreground">
                Parent Goal
              </label>
              <Select
                id="edit-goal-parent"
                name="parentGoalId"
                value={editParentGoalId}
                onChange={(e) => setEditParentGoalId(e.target.value)}
                disabled={editLoading}
                data-testid="edit-goal-parent"
              >
                <option value="">None (Top-level Goal)</option>
                {goals
                  .filter((g) => g.id !== editingGoal?.id)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      [{g.horizon.replace("_", " ")}] {g.title}
                    </option>
                  ))}
              </Select>
            </div>

            {/* Metric Configuration */}
            <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                Key Metric Tracking
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="edit-metric-type" className="text-[11px] text-muted-foreground">
                    Metric Type
                  </label>
                  <Select
                    id="edit-metric-type"
                    value={editMetricType}
                    onChange={(e) => setEditMetricType(e.target.value as GoalMetricType)}
                    disabled={editLoading}
                    data-testid="edit-goal-metric-type"
                  >
                    <option value="none">None (Deliverables Only)</option>
                    <option value="numeric">Numeric Target</option>
                    <option value="currency">Currency Target ($)</option>
                    <option value="percentage">Percentage Target (%)</option>
                    <option value="boolean">Boolean (Done/Not Done)</option>
                  </Select>
                </div>

                {editMetricType !== "none" && (
                  <div className="space-y-1">
                    <label htmlFor="edit-target-val" className="text-[11px] text-muted-foreground">
                      Target Value
                    </label>
                    <Input
                      id="edit-target-val"
                      type="number"
                      step="any"
                      value={editTargetValue}
                      onChange={(e) => setEditTargetValue(e.target.value)}
                      disabled={editLoading}
                      data-testid="edit-goal-target-val"
                    />
                  </div>
                )}
              </div>

              {editMetricType !== "none" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="edit-current-val" className="text-[11px] text-muted-foreground">
                      Current Value
                    </label>
                    <Input
                      id="edit-current-val"
                      type="number"
                      step="any"
                      value={editCurrentValue}
                      onChange={(e) => setEditCurrentValue(e.target.value)}
                      disabled={editLoading}
                      data-testid="edit-goal-current-val"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="edit-unit" className="text-[11px] text-muted-foreground">
                      Unit
                    </label>
                    <Input
                      id="edit-unit"
                      value={editUnit}
                      onChange={(e) => setEditUnit(e.target.value)}
                      disabled={editLoading}
                      data-testid="edit-goal-unit"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="edit-start-date" className="text-xs font-semibold uppercase text-muted-foreground">
                  Start Date
                </label>
                <Input
                  id="edit-start-date"
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  disabled={editLoading}
                  data-testid="edit-goal-start-date"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="edit-target-date" className="text-xs font-semibold uppercase text-muted-foreground">
                  Target Date
                </label>
                <Input
                  id="edit-target-date"
                  type="date"
                  value={editTargetDate}
                  onChange={(e) => setEditTargetDate(e.target.value)}
                  disabled={editLoading}
                  data-testid="edit-goal-target-date"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditOpen(false)}
                disabled={editLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={editLoading}
                data-testid="submit-edit-goal"
              >
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>

        {/* Quick Metric Update Modal */}
        <Modal
          isOpen={isQuickMetricOpen}
          onClose={() => setIsQuickMetricOpen(false)}
          title={`Update Metric: ${metricGoal?.title || ""}`}
          description={`Target: ${metricGoal?.targetValue ?? "N/A"} ${metricGoal?.unit || ""}`}
        >
          <form onSubmit={handleQuickMetric} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label htmlFor="quick-metric-input" className="text-xs font-semibold uppercase text-muted-foreground">
                Current Value ({metricGoal?.unit || "value"})
              </label>
              <Input
                id="quick-metric-input"
                type="number"
                step="any"
                value={quickMetricValue}
                onChange={(e) => setQuickMetricValue(e.target.value)}
                autoFocus
                required
                disabled={quickMetricLoading}
                data-testid="quick-metric-input"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsQuickMetricOpen(false)}
                disabled={quickMetricLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={quickMetricLoading}
                data-testid="submit-quick-metric"
              >
                Update Metric
              </Button>
            </div>
          </form>
        </Modal>

        {/* Delete Goal Confirmation Dialog */}
        <Modal
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          title="Delete Goal"
        >
          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Confirm Deletion</p>
                <p className="text-xs mt-1 text-destructive/90">
                  Are you sure you want to delete &quot;{deletingGoal?.title}&quot;?
                  Any sub-goals will become top-level goals, and linked projects or tasks will remain intact with their goal assignment cleared.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDeleteOpen(false)}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                loading={deleteLoading}
                data-testid="confirm-delete-goal"
              >
                Delete Goal
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}

export default function GoalsPage() {
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
      <GoalsContent />
    </React.Suspense>
  );
}
