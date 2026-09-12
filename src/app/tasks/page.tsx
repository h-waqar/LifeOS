"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { TaskDTO, ProjectDTO, TaskStatus, Priority } from "@/types";
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

  // Filters
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [projectFilter, setProjectFilter] = React.useState<string>("all");

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [createParentId, setCreateParentId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [projectId, setProjectId] = React.useState<string>("");
  const [status, setStatus] = React.useState<TaskStatus>("todo");
  const [priority, setPriority] = React.useState<Priority>("medium");
  const [dueDate, setDueDate] = React.useState("");
  const [createLoading, setCreateLoading] = React.useState(false);

  // Edit Modal
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<TaskDTO | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [editProjectId, setEditProjectId] = React.useState<string>("");
  const [editStatus, setEditStatus] = React.useState<TaskStatus>("todo");
  const [editPriority, setEditPriority] = React.useState<Priority>("medium");
  const [editDueDate, setEditDueDate] = React.useState("");
  const [editLoading, setEditLoading] = React.useState(false);

  // Delete Modal
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [deletingTask, setDeletingTask] = React.useState<TaskDTO | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (projectFilter !== "all") params.set("projectId", projectFilter);

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
  }, [router, statusFilter, projectFilter]);

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
    if (!title.trim()) return;

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
      if (dueDate) {
        payload.dueDate = new Date(dueDate).toISOString();
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
      setCreateParentId(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to create task");
    } finally {
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
    setEditDueDate(
      task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : ""
    );
    setIsEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTitle.trim()) return;

    setEditLoading(true);
    try {
      const payload: Record<string, unknown> = {
        title: editTitle.trim(),
        status: editStatus,
        priority: editPriority,
        description: editDescription.trim() || null,
        projectId: editProjectId.trim() || null,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
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
      setEditLoading(false);
    }
  };

  const openDelete = (task: TaskDTO) => {
    setDeletingTask(task);
    setIsDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingTask) return;

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
                  className={`text-sm font-semibold truncate ${
                    isCompleted ? "line-through text-muted-foreground" : ""
                  }`}
                >
                  {node.title}
                </span>
                <StatusBadge status={node.status} />
                <PriorityBadge priority={node.priority} />
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
                {node.dueDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(node.dueDate).toLocaleDateString()}
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
          <Button
            onClick={openCreateRoot}
            className="gap-2"
            data-testid="create-task-btn"
          >
            <Plus className="h-4 w-4" />
            <span>New Task</span>
          </Button>
        </div>

        {/* Filters bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
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
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Title *
              </label>
              <Input
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
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Description
              </label>
              <Textarea
                placeholder="Notes, checklist, or instructions..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={createLoading}
                data-testid="new-task-desc"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Project
                </label>
                <Select
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
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Priority
                </label>
                <Select
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
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Status
                </label>
                <Select
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
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Due Date
                </label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={createLoading}
                  data-testid="new-task-duedate"
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
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Title *
              </label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                disabled={editLoading}
                data-testid="edit-task-title"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Description
              </label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={editLoading}
                data-testid="edit-task-desc"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Project
                </label>
                <Select
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
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Priority
                </label>
                <Select
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
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Status
                </label>
                <Select
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
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Due Date
                </label>
                <Input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  disabled={editLoading}
                  data-testid="edit-task-duedate"
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
