"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  StatusBadge,
  PriorityBadge,
  ScoreBadge,
  EnergyBadge,
  Badge,
} from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { QuickCaptureModal } from "@/components/quick-capture-modal";
import type { TaskDTO, ProjectDTO, TaskStatus, Priority, EnergyLevel } from "@/types";
import {
  CheckSquare,
  Plus,
  Edit2,
  Trash2,
  CornerDownRight,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Loader2,
  Calendar,
  FolderKanban,
  Sparkles,
  Link2,
  Zap,
  ArrowUpDown,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface TaskTreeNode extends TaskDTO {
  children: TaskTreeNode[];
}

function TasksContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionLoading } = useSession();

  const [tasks, setTasks] = React.useState<TaskDTO[]>([]);
  const [projects, setProjects] = React.useState<ProjectDTO[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Filters & Sorting
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [projectFilter, setProjectFilter] = React.useState<string>("all");
  const [energyFilter, setEnergyFilter] = React.useState<string>("all");
  const [sortBy, setSortBy] = React.useState<string>("priority_score");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  // Quick Capture Modal
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = React.useState(false);

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [createParentId, setCreateParentId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [projectId, setProjectId] = React.useState<string>("");
  const [status, setStatus] = React.useState<TaskStatus>("todo");
  const [priority, setPriority] = React.useState<Priority>("medium");
  const [energyLevel, setEnergyLevel] = React.useState<EnergyLevel | "">("");
  const [dueDate, setDueDate] = React.useState("");
  const [scheduledDate, setScheduledDate] = React.useState("");
  const [createLoading, setCreateLoading] = React.useState(false);

  // Edit Modal
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<TaskDTO | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [editProjectId, setEditProjectId] = React.useState<string>("");
  const [editStatus, setEditStatus] = React.useState<TaskStatus>("todo");
  const [editPriority, setEditPriority] = React.useState<Priority>("medium");
  const [editEnergyLevel, setEditEnergyLevel] = React.useState<EnergyLevel | "">("");
  const [editDueDate, setEditDueDate] = React.useState("");
  const [editScheduledDate, setEditScheduledDate] = React.useState("");
  const [editLoading, setEditLoading] = React.useState(false);

  // Delete Modal
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [deletingTask, setDeletingTask] = React.useState<TaskDTO | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  // Task Dependencies Modal
  const [isDepsOpen, setIsDepsOpen] = React.useState(false);
  const [selectedDepsTask, setSelectedDepsTask] = React.useState<TaskDTO | null>(null);
  const [depsLoading, setDepsLoading] = React.useState(false);
  const [depsData, setDepsData] = React.useState<{
    blockedBy: TaskDTO[];
    blocks: TaskDTO[];
  }>({ blockedBy: [], blocks: [] });
  const [newPrereqId, setNewPrereqId] = React.useState<string>("");
  const [depsActionLoading, setDepsActionLoading] = React.useState(false);

  const isCreatingRef = React.useRef(false);
  const isEditingRef = React.useRef(false);
  const isDeletingRef = React.useRef(false);
  const togglingTasksRef = React.useRef<Set<string>>(new Set());

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (projectFilter !== "all") params.set("projectId", projectFilter);
      if (energyFilter !== "all") params.set("energyLevel", energyFilter);
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);

      const queryString = params.toString() ? `?${params.toString()}` : "";

      const [taskRes, projRes] = await Promise.all([
        fetch(`/api/tasks${queryString}`),
        fetch("/api/projects"),
      ]);

      if (taskRes.status === 401 || projRes.status === 401) {
        router.replace("/login");
        return;
      }

      if (taskRes.ok) {
        const taskData = await taskRes.json();
        setTasks(taskData.tasks || []);
      }

      if (projRes.ok) {
        const projData = await projRes.json();
        setProjects(projData.projects || []);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [router, statusFilter, projectFilter, energyFilter, sortBy, sortDir]);

  React.useEffect(() => {
    if (!sessionLoading) {
      if (!session?.user) {
        router.replace("/login");
      } else {
        fetchData();
      }
    }
  }, [session, sessionLoading, router, fetchData]);

  // Open create modal if ?action=new in URL
  React.useEffect(() => {
    if (searchParams.get("action") === "new") {
      setIsCreateOpen(true);
    }
  }, [searchParams]);

  const toggleTaskCompletion = async (task: TaskDTO) => {
    if (togglingTasksRef.current.has(task.id)) return;
    togglingTasksRef.current.add(task.id);

    const isNowCompleted = task.status !== "completed";
    const nextStatus: TaskStatus = isNowCompleted ? "completed" : "todo";

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update task");
      }

      const updatedData = await res.json();
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? updatedData.task : t))
      );
      toast.success(
        isNowCompleted ? "Task marked complete!" : "Task reopened!"
      );
    } catch (err: any) {
      toast.error(err.message || "Could not update task");
    } finally {
      togglingTasksRef.current.delete(task.id);
    }
  };

  const openCreateSubtask = (parentTask: TaskDTO) => {
    setCreateParentId(parentTask.id);
    setProjectId(parentTask.projectId || "");
    setTitle("");
    setDescription("");
    setStatus("todo");
    setPriority(parentTask.priority);
    setDueDate("");
    setIsCreateOpen(true);
  };

  const openCreateRoot = () => {
    setCreateParentId(null);
    setProjectId(projectFilter !== "all" ? projectFilter : "");
    setTitle("");
    setDescription("");
    setStatus("todo");
    setPriority("medium");
    setDueDate("");
    setIsCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingRef.current || !title.trim()) return;

    isCreatingRef.current = true;
    setCreateLoading(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        status,
        priority,
      };

      if (description.trim()) {
        payload.description = description.trim();
      }
      if (projectId.trim()) {
        payload.projectId = projectId.trim();
      }
      if (createParentId) {
        payload.parentTaskId = createParentId;
      }
      if (energyLevel) {
        payload.energyLevel = energyLevel;
      }
      if (dueDate) {
        payload.dueDate = new Date(dueDate).toISOString();
      }
      if (scheduledDate) {
        payload.scheduledDate = new Date(scheduledDate).toISOString();
      }

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create task");
      }

      const data = await res.json();
      setTasks((prev) => [data.task, ...prev]);
      toast.success(
        createParentId ? "Subtask created successfully!" : "Task created successfully!"
      );
      setIsCreateOpen(false);
      setTitle("");
      setDescription("");
      setEnergyLevel("");
      setDueDate("");
      setScheduledDate("");
      setCreateParentId(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to create task");
    } finally {
      isCreatingRef.current = false;
      setCreateLoading(false);
    }
  };

  const openEdit = (task: TaskDTO) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditProjectId(task.projectId || "");
    setEditStatus(task.status);
    setEditPriority(task.priority);
    setEditEnergyLevel(task.energyLevel || "");
    setEditDueDate(
      task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : ""
    );
    setEditScheduledDate(
      task.scheduledDate ? new Date(task.scheduledDate).toISOString().slice(0, 10) : ""
    );
    setIsEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditingRef.current || !editingTask || !editTitle.trim()) return;

    isEditingRef.current = true;
    setEditLoading(true);
    try {
      const payload: Record<string, unknown> = {
        title: editTitle.trim(),
        status: editStatus,
        priority: editPriority,
        description: editDescription.trim() || null,
        projectId: editProjectId.trim() || null,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
        scheduledDate: editScheduledDate ? new Date(editScheduledDate).toISOString() : null,
        energyLevel: editEnergyLevel || null,
      };

      const res = await fetch(`/api/tasks/${editingTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update task");
      }

      const data = await res.json();
      setTasks((prev) =>
        prev.map((t) => (t.id === editingTask.id ? data.task : t))
      );
      toast.success("Task updated successfully!");
      setIsEditOpen(false);
      setEditingTask(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to update task");
    } finally {
      isEditingRef.current = false;
      setEditLoading(false);
    }
  };

  const openDependencies = async (task: TaskDTO) => {
    setSelectedDepsTask(task);
    setIsDepsOpen(true);
    setDepsLoading(true);
    setNewPrereqId("");
    try {
      const res = await fetch(`/api/tasks/${task.id}/dependencies`);
      if (!res.ok) {
        throw new Error("Failed to load task dependencies");
      }
      const data = await res.json();
      setDepsData({
        blockedBy: data.blockedBy || [],
        blocks: data.blocks || [],
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to load dependencies");
    } finally {
      setDepsLoading(false);
    }
  };

  const handleAddPrerequisite = async () => {
    if (!selectedDepsTask || !newPrereqId || depsActionLoading) return;
    setDepsActionLoading(true);
    try {
      const res = await fetch(`/api/tasks/${selectedDepsTask.id}/dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependsOnTaskId: newPrereqId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add prerequisite");
      }

      toast.success("Prerequisite added!");
      setNewPrereqId("");
      const depRes = await fetch(`/api/tasks/${selectedDepsTask.id}/dependencies`);
      if (depRes.ok) {
        const d = await depRes.json();
        setDepsData(d);
      }
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to add dependency");
    } finally {
      setDepsActionLoading(false);
    }
  };

  const handleRemovePrerequisite = async (prereqId: string) => {
    if (!selectedDepsTask || depsActionLoading) return;
    setDepsActionLoading(true);
    try {
      const res = await fetch(
        `/api/tasks/${selectedDepsTask.id}/dependencies/${prereqId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove prerequisite");
      }

      toast.success("Prerequisite removed!");
      setDepsData((prev) => ({
        ...prev,
        blockedBy: prev.blockedBy.filter((t) => t.id !== prereqId),
      }));
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove prerequisite");
    } finally {
      setDepsActionLoading(false);
    }
  };

  const openDelete = (task: TaskDTO) => {
    setDeletingTask(task);
    setIsDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (isDeletingRef.current || !deletingTask) return;

    isDeletingRef.current = true;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/tasks/${deletingTask.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete task");
      }

      // Re-fetch to capture cascade deletions
      await fetchData();
      toast.success("Task and any subtasks deleted successfully");
      setIsDeleteOpen(false);
      setDeletingTask(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete task");
    } finally {
      isDeletingRef.current = false;
      setDeleteLoading(false);
    }
  };

  // Build task hierarchy tree
  const taskMap = new Map<string, TaskTreeNode>();
  tasks.forEach((t) => taskMap.set(t.id, { ...t, children: [] }));

  const rootTasks: TaskTreeNode[] = [];
  tasks.forEach((t) => {
    const node = taskMap.get(t.id)!;
    if (t.parentTaskId && taskMap.has(t.parentTaskId)) {
      taskMap.get(t.parentTaskId)!.children.push(node);
    } else {
      rootTasks.push(node);
    }
  });

  const statusFilterTabs = [
    { label: "All", value: "all" },
    { label: "Inbox", value: "inbox" },
    { label: "To Do", value: "todo" },
    { label: "In Progress", value: "in_progress" },
    { label: "Completed", value: "completed" },
    { label: "Blocked", value: "blocked" },
    { label: "Cancelled", value: "cancelled" },
  ];

  // Recursive task item renderer
  const renderTaskTree = (node: TaskTreeNode, depth = 0) => {
    const isCompleted = node.status === "completed";
    const project = projects.find((p) => p.id === node.projectId);

    return (
      <div key={node.id} className="space-y-1" data-testid={`task-item-${node.id}`}>
        <div
          className={`flex items-center justify-between rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40 ${
            depth > 0 ? "ml-6 sm:ml-8 border-l-2 border-l-primary/60 bg-muted/20" : ""
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {depth > 0 && (
              <CornerDownRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <button
              onClick={() => toggleTaskCompletion(node)}
              className="text-muted-foreground hover:text-primary transition-colors shrink-0"
              title={isCompleted ? "Mark incomplete" : "Mark complete"}
              aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
              data-testid={`toggle-task-${node.id}`}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <Circle className="h-5 w-5" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-sm font-semibold break-words [overflow-wrap:anywhere] ${
                    isCompleted ? "line-through text-muted-foreground" : ""
                  }`}
                >
                  {node.title}
                </span>
                <StatusBadge status={node.status} />
                <PriorityBadge priority={node.priority} />
                <ScoreBadge score={node.priorityScore} />
                <EnergyBadge energy={node.energyLevel} />
                {node.hasUncompletedDependencies && (
                  <Badge
                    variant="warning"
                    className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                    title="Task is blocked by unfinished prerequisites"
                    data-testid={`blocked-badge-${node.id}`}
                  >
                    ⚠️ Blocked
                  </Badge>
                )}
              </div>

              {node.description && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {node.description}
                </p>
              )}

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                {project && (
                  <span className="flex items-center gap-1 font-medium text-foreground/80">
                    <FolderKanban className="h-3 w-3" />
                    {project.name}
                  </span>
                )}
                {node.scheduledDate && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Calendar className="h-3 w-3" />
                    Scheduled: {new Date(node.scheduledDate).toLocaleDateString()}
                  </span>
                )}
                {node.dueDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Due: {new Date(node.dueDate).toLocaleDateString()}
                  </span>
                )}
                {node.completedAt && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Finished {new Date(node.completedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => openDependencies(node)}
              title="Manage Task Dependencies"
              data-testid={`manage-deps-${node.id}`}
            >
              <Link2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground hidden sm:flex"
              onClick={() => openCreateSubtask(node)}
              title="Add Subtask"
              data-testid={`add-subtask-${node.id}`}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Subtask</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground sm:hidden"
              onClick={() => openCreateSubtask(node)}
              title="Add Subtask"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => openEdit(node)}
              title="Edit Task"
              data-testid={`edit-task-${node.id}`}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => openDelete(node)}
              title="Delete Task"
              data-testid={`delete-task-${node.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Recursive rendering of nested children */}
        {node.children.length > 0 && (
          <div className="space-y-1">
            {node.children.map((child) => renderTaskTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <AppShell>
      <div className="space-y-6" data-testid="tasks-view">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Tasks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Hierarchical execution engine: manage root tasks and nested subtasks
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setIsQuickCaptureOpen(true)}
              className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
              data-testid="quick-capture-modal-btn"
            >
              <Sparkles className="h-4 w-4" />
              <span>Quick Capture</span>
              <kbd className="hidden sm:inline-block rounded border border-primary/30 bg-primary/15 px-1 font-mono text-[10px] font-bold">
                Q
              </kbd>
            </Button>
            <Button
              onClick={openCreateRoot}
              className="gap-2"
              data-testid="create-task-btn"
            >
              <Plus className="h-4 w-4" />
              <span>New Task</span>
            </Button>
          </div>
        </div>

        {/* Filters & Sorting Bar */}
        <div className="flex flex-col gap-3 border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Status tabs */}
            <div className="flex flex-wrap gap-1.5">
              {statusFilterTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setStatusFilter(tab.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === tab.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Energy filter tabs */}
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border">
              <span className="text-[11px] font-semibold text-muted-foreground px-2">
                Energy:
              </span>
              {[
                { label: "All", value: "all" },
                { label: "⚡ High", value: "high" },
                { label: "⚡ Med", value: "medium" },
                { label: "☕ Low", value: "low" },
              ].map((pill) => (
                <button
                  key={pill.value}
                  onClick={() => setEnergyFilter(pill.value)}
                  className={`rounded-md px-2.5 py-0.5 text-xs font-medium transition-all ${
                    energyFilter === pill.value
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`energy-filter-${pill.value}`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                Project:
              </span>
              <Select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="h-8 text-xs w-44"
              >
                <option value="all">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                <ArrowUpDown className="h-3 w-3" />
                Sort:
              </span>
              <Select
                value={sortBy}
                onChange={(e) => {
                  const val = e.target.value;
                  setSortBy(val);
                  setSortDir(
                    val === "priority_score" || val === "created_at"
                      ? "desc"
                      : "asc"
                  );
                }}
                className="h-8 text-xs w-48"
                data-testid="tasks-sort-by"
              >
                <option value="priority_score">Priority Score (High → Low)</option>
                <option value="due_date">Due Date (Earliest First)</option>
                <option value="created_at">Created Date (Newest First)</option>
                <option value="title">Title (Alphabetical A-Z)</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Tasks List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : rootTasks.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <CheckSquare className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No tasks found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
              {statusFilter === "all" && projectFilter === "all"
                ? "Your task list is clean. Create your first task to start planning and executing."
                : "No tasks matched the selected filter criteria."}
            </p>
            <Button
              onClick={openCreateRoot}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              <span>Create Task</span>
            </Button>
          </Card>
        ) : (
          <div className="space-y-2" data-testid="tasks-hierarchy-tree">
            {rootTasks.map((rootNode) => renderTaskTree(rootNode))}
          </div>
        )}

        {/* Create Task Modal */}
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title={createParentId ? "Create Subtask" : "Create New Task"}
          description={
            createParentId
              ? `Adding nested subtask under parent #${createParentId.slice(0, 8)}`
              : "Define a new action item"
          }
        >
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label
                htmlFor="create-task-title"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Title *
              </label>
              <Input
                id="create-task-title"
                name="title"
                placeholder="What needs to be done?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
                disabled={createLoading}
                data-testid="new-task-title"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="create-task-desc"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Description
              </label>
              <Textarea
                id="create-task-desc"
                name="description"
                placeholder="Notes, checklist, or instructions..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={createLoading}
                data-testid="new-task-desc"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="create-task-project"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Project
                </label>
                <Select
                  id="create-task-project"
                  name="projectId"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={createLoading || Boolean(createParentId)}
                  data-testid="new-task-project"
                >
                  <option value="">(No Project)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="create-task-priority"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Priority
                </label>
                <Select
                  id="create-task-priority"
                  name="priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  disabled={createLoading}
                  data-testid="new-task-priority"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="create-task-status"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Status
                </label>
                <Select
                  id="create-task-status"
                  name="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  disabled={createLoading}
                  data-testid="new-task-status"
                >
                  <option value="todo">To Do</option>
                  <option value="inbox">Inbox</option>
                  <option value="in_progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="create-task-duedate"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Due Date
                </label>
                <Input
                  id="create-task-duedate"
                  name="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={createLoading}
                  data-testid="new-task-duedate"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="create-task-energy"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Energy Level
                </label>
                <Select
                  id="create-task-energy"
                  name="energyLevel"
                  value={energyLevel}
                  onChange={(e) => setEnergyLevel(e.target.value as EnergyLevel | "")}
                  disabled={createLoading}
                  data-testid="new-task-energy"
                >
                  <option value="">(None)</option>
                  <option value="high">⚡ High Energy</option>
                  <option value="medium">⚡ Medium Energy</option>
                  <option value="low">☕ Low Energy</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="create-task-scheduled"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Scheduled Date
                </label>
                <Input
                  id="create-task-scheduled"
                  name="scheduledDate"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  disabled={createLoading}
                  data-testid="new-task-scheduled"
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
                data-testid="submit-create-task"
              >
                {createParentId ? "Create Subtask" : "Create Task"}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Edit Task Modal */}
        <Modal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          title="Edit Task"
          description="Update task details, status, or assignment"
        >
          <form onSubmit={handleEdit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label
                htmlFor="edit-task-title"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Title *
              </label>
              <Input
                id="edit-task-title"
                name="title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                disabled={editLoading}
                data-testid="edit-task-title"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-task-desc"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Description
              </label>
              <Textarea
                id="edit-task-desc"
                name="description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={editLoading}
                data-testid="edit-task-desc"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-task-project"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Project
                </label>
                <Select
                  id="edit-task-project"
                  name="projectId"
                  value={editProjectId}
                  onChange={(e) => setEditProjectId(e.target.value)}
                  disabled={editLoading || Boolean(editingTask?.parentTaskId)}
                  data-testid="edit-task-project"
                >
                  <option value="">(No Project)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-task-priority"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Priority
                </label>
                <Select
                  id="edit-task-priority"
                  name="priority"
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as Priority)}
                  disabled={editLoading}
                  data-testid="edit-task-priority"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-task-status"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Status
                </label>
                <Select
                  id="edit-task-status"
                  name="status"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                  disabled={editLoading}
                  data-testid="edit-task-status"
                >
                  <option value="todo">To Do</option>
                  <option value="inbox">Inbox</option>
                  <option value="in_progress">In Progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-task-duedate"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Due Date
                </label>
                <Input
                  id="edit-task-duedate"
                  name="dueDate"
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  disabled={editLoading}
                  data-testid="edit-task-duedate"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-task-energy"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Energy Level
                </label>
                <Select
                  id="edit-task-energy"
                  name="energyLevel"
                  value={editEnergyLevel}
                  onChange={(e) => setEditEnergyLevel(e.target.value as EnergyLevel | "")}
                  disabled={editLoading}
                  data-testid="edit-task-energy"
                >
                  <option value="">(None)</option>
                  <option value="high">⚡ High Energy</option>
                  <option value="medium">⚡ Medium Energy</option>
                  <option value="low">☕ Low Energy</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-task-scheduled"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Scheduled Date
                </label>
                <Input
                  id="edit-task-scheduled"
                  name="scheduledDate"
                  type="date"
                  value={editScheduledDate}
                  onChange={(e) => setEditScheduledDate(e.target.value)}
                  disabled={editLoading}
                  data-testid="edit-task-scheduled"
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
                data-testid="submit-edit-task"
              >
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>

        {/* Delete Task Confirmation Dialog */}
        <Modal
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          title="Delete Task"
        >
          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Cascade Deletion Warning</p>
                <p className="text-xs mt-1 text-destructive/90">
                  Are you sure you want to delete &quot;{deletingTask?.title}&quot;?
                  Deleting this task will permanently remove it and all of its nested child subtasks.
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
                data-testid="confirm-delete-task"
              >
                Delete Task
              </Button>
            </div>
          </div>
        </Modal>

        {/* Quick Capture Modal */}
        <QuickCaptureModal
          isOpen={isQuickCaptureOpen}
          onClose={() => setIsQuickCaptureOpen(false)}
          onTaskCreated={() => {
            fetchData();
          }}
        />

        {/* Task Dependencies Modal */}
        <Modal
          isOpen={isDepsOpen}
          onClose={() => setIsDepsOpen(false)}
          title="Task Dependencies"
          description={
            selectedDepsTask
              ? `Manage dependencies for: "${selectedDepsTask.title}"`
              : ""
          }
        >
          <div className="space-y-5 pt-2" data-testid="task-dependencies-modal">
            {depsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* 1. Prerequisites (Blocked By) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Blocked By (Prerequisites)
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      {depsData.blockedBy.length} prerequisite
                      {depsData.blockedBy.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {depsData.blockedBy.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                      No prerequisite tasks. This task is not blocked.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {depsData.blockedBy.map((prereq) => (
                        <div
                          key={prereq.id}
                          className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-xs"
                          data-testid={`prereq-item-${prereq.id}`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-medium truncate">
                              {prereq.title}
                            </span>
                            <StatusBadge status={prereq.status} />
                          </div>
                          <button
                            onClick={() => handleRemovePrerequisite(prereq.id)}
                            disabled={depsActionLoading}
                            className="ml-2 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                            title="Remove prerequisite"
                            aria-label={`Remove prerequisite ${prereq.title}`}
                            data-testid={`remove-prereq-${prereq.id}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Prerequisite input */}
                  <div className="flex items-center gap-2 pt-2">
                    <Select
                      value={newPrereqId}
                      onChange={(e) => setNewPrereqId(e.target.value)}
                      className="h-9 text-xs flex-1"
                      disabled={depsActionLoading}
                      data-testid="add-prereq-select"
                    >
                      <option value="">
                        Select task that must be completed first...
                      </option>
                      {tasks
                        .filter(
                          (t) =>
                            t.id !== selectedDepsTask?.id &&
                            !depsData.blockedBy.some((b) => b.id === t.id)
                        )
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title} ({t.status})
                          </option>
                        ))}
                    </Select>
                    <Button
                      size="sm"
                      onClick={handleAddPrerequisite}
                      disabled={!newPrereqId || depsActionLoading}
                      loading={depsActionLoading}
                      className="h-9 gap-1 text-xs"
                      data-testid="add-prereq-btn"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add</span>
                    </Button>
                  </div>
                </div>

                {/* 2. Dependents (Blocks) */}
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Blocks (Dependent Tasks)
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      {depsData.blocks.length} dependent
                      {depsData.blocks.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {depsData.blocks.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                      No other tasks are waiting on this task.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {depsData.blocks.map((dep) => (
                        <div
                          key={dep.id}
                          className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-xs"
                        >
                          <span className="font-medium truncate">
                            {dep.title}
                          </span>
                          <StatusBadge status={dep.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDepsOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}

export default function TasksPage() {
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
      <TasksContent />
    </React.Suspense>
  );
}
