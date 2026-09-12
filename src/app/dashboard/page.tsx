"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppShell } from "@/components/app-shell";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { ProjectDTO, TaskDTO, Priority, ProjectStatus, TaskStatus } from "@/types";
import {
  FolderKanban,
  CheckSquare,
  Clock,
  AlertTriangle,
  Plus,
  CheckCircle2,
  Circle,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();

  const [projects, setProjects] = React.useState<ProjectDTO[]>([]);
  const [tasks, setTasks] = React.useState<TaskDTO[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Quick modals state
  const [isTaskModalOpen, setIsTaskModalOpen] = React.useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  // New task form state
  const [taskTitle, setTaskTitle] = React.useState("");
  const [taskDescription, setTaskDescription] = React.useState("");
  const [taskProjectId, setTaskProjectId] = React.useState("");
  const [taskPriority, setTaskPriority] = React.useState<Priority>("medium");

  // New project form state
  const [projectName, setProjectName] = React.useState("");
  const [projectDescription, setProjectDescription] = React.useState("");
  const [projectPriority, setProjectPriority] = React.useState<Priority>("medium");
  const [projectStatus, setProjectStatus] = React.useState<ProjectStatus>("active");

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [projRes, taskRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/tasks"),
      ]);

      if (projRes.status === 401 || taskRes.status === 401) {
        router.replace("/login");
        return;
      }

      if (projRes.ok) {
        const projData = await projRes.json();
        setProjects(projData.projects || []);
      }

      if (taskRes.ok) {
        const taskData = await taskRes.json();
        setTasks(taskData.tasks || []);
      }
    } catch (err) {
      toast.error("Failed to load dashboard data");
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
  }, [session, sessionLoading, router, fetchData]);

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

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    setActionLoading(true);
    try {
      const payload: Record<string, unknown> = {
        title: taskTitle.trim(),
        priority: taskPriority,
        status: "todo",
      };
      if (taskDescription.trim()) {
        payload.description = taskDescription.trim();
      }
      if (taskProjectId.trim()) {
        payload.projectId = taskProjectId.trim();
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
      toast.success("Task created successfully!");
      setIsTaskModalOpen(false);
      setTaskTitle("");
      setTaskDescription("");
      setTaskProjectId("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create task");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    setActionLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: projectName.trim(),
        status: projectStatus,
        priority: projectPriority,
      };
      if (projectDescription.trim()) {
        payload.description = projectDescription.trim();
      }

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create project");
      }

      const data = await res.json();
      setProjects((prev) => [data.project, ...prev]);
      toast.success("Project created successfully!");
      setIsProjectModalOpen(false);
      setProjectName("");
      setProjectDescription("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create project");
    } finally {
      setActionLoading(false);
    }
  };

  if (sessionLoading || (!session?.user && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Metrics
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const pendingTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const criticalTasks = tasks.filter(
    (t) => (t.priority === "critical" || t.priority === "high") && t.status !== "completed"
  ).length;

  const recentTasks = tasks.slice(0, 6);
  const activeProjectsList = projects.filter((p) => p.status === "active").slice(0, 4);

  return (
    <AppShell>
      <div className="space-y-8" data-testid="dashboard-view">
        {/* Dashboard Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome back, {session?.user?.name || "LifeOS Owner"}. Here is an overview of your workspace.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsProjectModalOpen(true)}
              className="gap-1.5"
              data-testid="quick-add-project-btn"
            >
              <Plus className="h-4 w-4" />
              <span>New Project</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsTaskModalOpen(true)}
              className="gap-1.5"
              data-testid="quick-add-task-btn"
            >
              <Plus className="h-4 w-4" />
              <span>New Task</span>
            </Button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active Projects
              </CardTitle>
              <FolderKanban className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-active-projects">
                {activeProjects}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {projects.length} total projects
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pending Tasks
              </CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-pending-tasks">
                {pendingTasks}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Across all active projects
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Completed Tasks
              </CardTitle>
              <CheckSquare className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-completed-tasks">
                {completedTasks}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total finished work
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                High Priority
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-critical-tasks">
                {criticalTasks}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Requiring immediate focus
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Tasks & Active Projects Split */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Recent Tasks */}
          <Card className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Recent Tasks</CardTitle>
                <CardDescription>Latest tasks across your projects</CardDescription>
              </div>
              <Link href="/tasks">
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="flex-1 space-y-3">
              {recentTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <CheckSquare className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm font-medium">No tasks created yet</p>
                  <p className="text-xs mt-1">Create your first task to start organizing.</p>
                </div>
              ) : (
                <div className="divide-y rounded-md border">
                  {recentTasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          onClick={() => toggleTaskCompletion(t)}
                          className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                          title={t.status === "completed" ? "Mark incomplete" : "Mark complete"}
                          aria-label={t.status === "completed" ? "Mark incomplete" : "Mark complete"}
                        >
                          {t.status === "completed" ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          ) : (
                            <Circle className="h-5 w-5" />
                          )}
                        </button>
                        <span
                          className={`text-sm truncate font-medium ${
                            t.status === "completed"
                              ? "line-through text-muted-foreground"
                              : ""
                          }`}
                        >
                          {t.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <PriorityBadge priority={t.priority} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Projects */}
          <Card className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Active Projects</CardTitle>
                <CardDescription>Projects currently in progress</CardDescription>
              </div>
              <Link href="/projects">
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="flex-1 space-y-3">
              {activeProjectsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <FolderKanban className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm font-medium">No active projects</p>
                  <p className="text-xs mt-1">Create a project to group your tasks and milestones.</p>
                </div>
              ) : (
                <div className="divide-y rounded-md border">
                  {activeProjectsList.map((p) => {
                    const projectTasks = tasks.filter((t) => t.projectId === p.id);
                    const completedCount = projectTasks.filter((t) => t.status === "completed").length;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0 pr-3">
                          <p className="text-sm font-semibold truncate">{p.name}</p>
                          {p.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {p.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {completedCount}/{projectTasks.length} tasks
                          </span>
                          <PriorityBadge priority={p.priority} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Task Creation Modal */}
        <Modal
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          title="Create New Task"
          description="Add a task to your workspace"
        >
          <form onSubmit={handleCreateTask} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Task Title *
              </label>
              <Input
                placeholder="What needs to be done?"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                required
                autoFocus
                disabled={actionLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Description
              </label>
              <Textarea
                placeholder="Optional notes or details..."
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                disabled={actionLoading}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Project
                </label>
                <Select
                  value={taskProjectId}
                  onChange={(e) => setTaskProjectId(e.target.value)}
                  disabled={actionLoading}
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
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as Priority)}
                  disabled={actionLoading}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTaskModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button type="submit" loading={actionLoading}>
                Create Task
              </Button>
            </div>
          </form>
        </Modal>

        {/* Quick Project Creation Modal */}
        <Modal
          isOpen={isProjectModalOpen}
          onClose={() => setIsProjectModalOpen(false)}
          title="Create New Project"
          description="Initialize a project to organize tasks"
        >
          <form onSubmit={handleCreateProject} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Project Name *
              </label>
              <Input
                placeholder="Project title..."
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required
                autoFocus
                disabled={actionLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Description
              </label>
              <Textarea
                placeholder="Project scope and goals..."
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                disabled={actionLoading}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Status
                </label>
                <Select
                  value={projectStatus}
                  onChange={(e) => setProjectStatus(e.target.value as ProjectStatus)}
                  disabled={actionLoading}
                >
                  <option value="active">Active</option>
                  <option value="planning">Planning</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Priority
                </label>
                <Select
                  value={projectPriority}
                  onChange={(e) => setProjectPriority(e.target.value as Priority)}
                  disabled={actionLoading}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsProjectModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button type="submit" loading={actionLoading}>
                Create Project
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
