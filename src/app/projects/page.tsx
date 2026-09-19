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
import { StatusBadge, PriorityBadge, AreaBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type {
  ProjectDTO,
  Priority,
  ProjectStatus,
  LifeArea,
  ProjectMilestoneDTO,
  GoalDTO,
} from "@/types";
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  AlertTriangle,
  FolderOpen,
  Milestone,
  CheckCircle2,
  Circle,
  Calendar,
  Target,
  Archive,
} from "lucide-react";
import { toast } from "sonner";

function ProjectsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionLoading } = useSession();

  const [projects, setProjects] = React.useState<ProjectDTO[]>([]);
  const [goals, setGoals] = React.useState<GoalDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState<ProjectStatus>("active");
  const [priority, setPriority] = React.useState<Priority>("medium");
  const [area, setArea] = React.useState<LifeArea>("general");
  const [deadline, setDeadline] = React.useState("");
  const [goalId, setGoalId] = React.useState("");
  const [createLoading, setCreateLoading] = React.useState(false);

  // Edit Modal
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editingProject, setEditingProject] = React.useState<ProjectDTO | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [editStatus, setEditStatus] = React.useState<ProjectStatus>("active");
  const [editPriority, setEditPriority] = React.useState<Priority>("medium");
  const [editArea, setEditArea] = React.useState<LifeArea>("general");
  const [editDeadline, setEditDeadline] = React.useState("");
  const [editGoalId, setEditGoalId] = React.useState("");
  const [editLoading, setEditLoading] = React.useState(false);

  // Delete Modal
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [deletingProject, setDeletingProject] = React.useState<ProjectDTO | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  // Milestones Modal
  const [isMilestonesOpen, setIsMilestonesOpen] = React.useState(false);
  const [milestonesProject, setMilestonesProject] = React.useState<ProjectDTO | null>(null);
  const [projectMilestones, setProjectMilestones] = React.useState<ProjectMilestoneDTO[]>([]);
  const [milestonesLoading, setMilestonesLoading] = React.useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = React.useState("");
  const [newMilestoneDate, setNewMilestoneDate] = React.useState("");
  const [addingMilestone, setAddingMilestone] = React.useState(false);

  const isCreatingRef = React.useRef(false);
  const isEditingRef = React.useRef(false);
  const isDeletingRef = React.useRef(false);

  const fetchGoals = React.useCallback(async () => {
    try {
      const res = await fetch("/api/goals");
      if (res.ok) {
        const data = await res.json();
        setGoals(data.goals || []);
      }
    } catch {
      // ignore silently
    }
  }, []);

  const fetchProjects = React.useCallback(async () => {
    try {
      setLoading(true);
      const url =
        statusFilter === "all"
          ? "/api/projects"
          : `/api/projects?status=${encodeURIComponent(statusFilter)}`;

      const res = await fetch(url);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to load projects");
      }

      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err: any) {
      toast.error(err.message || "Could not load projects");
    } finally {
      setLoading(false);
    }
  }, [router, statusFilter]);

  React.useEffect(() => {
    if (!sessionLoading) {
      if (!session?.user) {
        router.replace("/login");
      } else {
        fetchProjects();
        fetchGoals();
      }
    }
  }, [session, sessionLoading, router, fetchProjects, fetchGoals]);

  // Open create modal if ?action=new in URL
  React.useEffect(() => {
    if (searchParams.get("action") === "new") {
      setIsCreateOpen(true);
    }
  }, [searchParams]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingRef.current) return;

    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }

    isCreatingRef.current = true;
    setCreateLoading(true);
    try {
      const payload: Record<string, any> = {
        name: name.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        area,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        goalId: goalId || undefined,
      };

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
      setIsCreateOpen(false);
      setName("");
      setDescription("");
      setStatus("active");
      setPriority("medium");
      setArea("general");
      setDeadline("");
      setGoalId("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create project");
    } finally {
      isCreatingRef.current = false;
      setCreateLoading(false);
    }
  };

  const openEdit = (p: ProjectDTO) => {
    setEditingProject(p);
    setEditName(p.name);
    setEditDescription(p.description || "");
    setEditStatus(p.status);
    setEditPriority(p.priority);
    setEditArea((p.area as LifeArea) || "general");
    setEditDeadline(p.deadline ? p.deadline.slice(0, 10) : "");
    setEditGoalId(p.goalId || "");
    setIsEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditingRef.current || !editingProject) return;

    if (!editName.trim()) {
      toast.error("Project name is required");
      return;
    }

    isEditingRef.current = true;
    setEditLoading(true);
    try {
      const payload: Record<string, any> = {
        name: editName.trim(),
        description: editDescription.trim() || null,
        status: editStatus,
        priority: editPriority,
        area: editArea,
        deadline: editDeadline ? new Date(editDeadline).toISOString() : null,
        goalId: editGoalId || null,
      };

      const res = await fetch(`/api/projects/${editingProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update project");
      }

      const data = await res.json();
      setProjects((prev) =>
        prev.map((p) => (p.id === editingProject.id ? data.project : p))
      );
      toast.success("Project updated successfully!");
      setIsEditOpen(false);
      setEditingProject(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to update project");
    } finally {
      isEditingRef.current = false;
      setEditLoading(false);
    }
  };

  const openDelete = (p: ProjectDTO) => {
    setDeletingProject(p);
    setIsDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (isDeletingRef.current || !deletingProject) return;

    isDeletingRef.current = true;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/projects/${deletingProject.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete project");
      }

      setProjects((prev) => prev.filter((p) => p.id !== deletingProject.id));
      toast.success("Project deleted. Any attached tasks are now unassigned.");
      setIsDeleteOpen(false);
      setDeletingProject(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete project");
    } finally {
      isDeletingRef.current = false;
      setDeleteLoading(false);
    }
  };

  const openMilestones = async (p: ProjectDTO) => {
    setMilestonesProject(p);
    setIsMilestonesOpen(true);
    setMilestonesLoading(true);
    try {
      const res = await fetch(`/api/projects/${p.id}/milestones`);
      if (res.ok) {
        const data = await res.json();
        setProjectMilestones(data.milestones || []);
      }
    } catch {
      toast.error("Failed to load milestones");
    } finally {
      setMilestonesLoading(false);
    }
  };

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!milestonesProject || !newMilestoneTitle.trim()) return;

    setAddingMilestone(true);
    try {
      const res = await fetch(`/api/projects/${milestonesProject.id}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newMilestoneTitle.trim(),
          targetDate: newMilestoneDate ? new Date(newMilestoneDate).toISOString() : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add milestone");
      }

      const data = await res.json();
      setProjectMilestones((prev) => [...prev, data.milestone]);
      setNewMilestoneTitle("");
      setNewMilestoneDate("");
      toast.success("Milestone added");
      fetchProjects();
    } catch (err: any) {
      toast.error(err.message || "Failed to add milestone");
    } finally {
      setAddingMilestone(false);
    }
  };

  const handleToggleMilestone = async (m: ProjectMilestoneDTO) => {
    if (!milestonesProject) return;
    const nextStatus = m.status === "completed" ? "pending" : "completed";
    try {
      const res = await fetch(
        `/api/projects/${milestonesProject.id}/milestones/${m.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        }
      );

      if (!res.ok) throw new Error("Failed to update milestone");
      const data = await res.json();
      setProjectMilestones((prev) =>
        prev.map((item) => (item.id === m.id ? data.milestone : item))
      );
      fetchProjects();
    } catch {
      toast.error("Failed to update milestone");
    }
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    if (!milestonesProject) return;
    try {
      const res = await fetch(
        `/api/projects/${milestonesProject.id}/milestones/${milestoneId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete milestone");
      setProjectMilestones((prev) => prev.filter((item) => item.id !== milestoneId));
      toast.success("Milestone deleted");
      fetchProjects();
    } catch {
      toast.error("Failed to delete milestone");
    }
  };

  const filterTabs = [
    { label: "All", value: "all" },
    { label: "Active", value: "active" },
    { label: "Planning", value: "planning" },
    { label: "Paused", value: "paused" },
    { label: "Completed", value: "completed" },
    { label: "Archived", value: "archived" },
  ];

  return (
    <AppShell>
      <div className="space-y-6" data-testid="projects-view">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Projects
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Organize initiatives, track milestones, and monitor automated progress
            </p>
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="gap-2"
            data-testid="create-project-btn"
          >
            <Plus className="h-4 w-4" />
            <span>New Project</span>
          </Button>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-2 border-b pb-3">
          {filterTabs.map((tab) => (
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

        {/* Projects Grid / Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : projects.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No projects found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
              {statusFilter === "all"
                ? "You haven't created any projects yet. Projects help group your tasks and measure progress."
                : `No projects with status '${statusFilter}'.`}
            </p>
            <Button
              onClick={() => setIsCreateOpen(true)}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              <span>Create Project</span>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="projects-grid">
            {projects.map((project) => {
              const linkedGoal = goals.find((g) => g.id === project.goalId);
              const progressPct = project.progress ?? 0;

              return (
                <Card
                  key={project.id}
                  className="flex flex-col justify-between transition-all hover:border-primary/50 shadow-sm"
                  data-testid={`project-card-${project.id}`}
                >
                  <CardHeader className="pb-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-bold line-clamp-1">
                        {project.name}
                      </CardTitle>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <StatusBadge status={project.status} />
                        <PriorityBadge priority={project.priority} />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {project.area && <AreaBadge area={project.area} />}
                      {linkedGoal && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          <Target className="h-3 w-3 text-primary" />
                          <span className="truncate max-w-[120px]">{linkedGoal.title}</span>
                        </span>
                      )}
                      {project.deadline && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(project.deadline).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {project.description && (
                      <CardDescription className="line-clamp-2 text-xs">
                        {project.description}
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="py-2 space-y-2">
                    {/* Automated Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-medium text-muted-foreground">
                        <span>Progress</span>
                        <span className="text-foreground font-semibold">{progressPct}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-2 rounded-full transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats summary */}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                      <span>
                        {project.completedTasksCount || 0}/{project.tasksCount || 0} tasks
                      </span>
                      <button
                        onClick={() => openMilestones(project)}
                        className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                      >
                        <Milestone className="h-3 w-3" />
                        <span>{project.milestonesCount || 0} milestones</span>
                      </button>
                    </div>
                  </CardContent>

                  <CardFooter className="flex items-center justify-between border-t pt-3 pb-3 text-xs text-muted-foreground">
                    <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openMilestones(project)}
                        title="Manage Milestones"
                        data-testid={`milestones-project-${project.id}`}
                      >
                        <Milestone className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(project)}
                        title="Edit project"
                        data-testid={`edit-project-${project.id}`}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => openDelete(project)}
                        title="Delete project"
                        data-testid={`delete-project-${project.id}`}
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

        {/* Create Project Modal */}
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Create New Project"
          description="Define a new project with life area, target deadline, and linked goal"
        >
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label
                htmlFor="create-project-name"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Project Name *
              </label>
              <Input
                id="create-project-name"
                name="name"
                placeholder="e.g. Marathon Preparation Plan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                disabled={createLoading}
                data-testid="new-project-name"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="create-project-desc"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Description
              </label>
              <Textarea
                id="create-project-desc"
                name="description"
                placeholder="Project scope and deliverables..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={createLoading}
                data-testid="new-project-desc"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="create-project-area"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Life Area
                </label>
                <Select
                  id="create-project-area"
                  name="area"
                  value={area}
                  onChange={(e) => setArea(e.target.value as LifeArea)}
                  disabled={createLoading}
                  data-testid="new-project-area"
                >
                  <option value="general">General</option>
                  <option value="health">Health</option>
                  <option value="career">Career</option>
                  <option value="finance">Finance</option>
                  <option value="personal_development">Personal Development</option>
                  <option value="relationships">Relationships</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="create-project-goal"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Linked Goal
                </label>
                <Select
                  id="create-project-goal"
                  name="goalId"
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                  disabled={createLoading}
                  data-testid="new-project-goal"
                >
                  <option value="">None (Independent)</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="create-project-status"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Status
                </label>
                <Select
                  id="create-project-status"
                  name="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                  disabled={createLoading}
                  data-testid="new-project-status"
                >
                  <option value="active">Active</option>
                  <option value="planning">Planning</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="create-project-priority"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Priority
                </label>
                <Select
                  id="create-project-priority"
                  name="priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  disabled={createLoading}
                  data-testid="new-project-priority"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="create-project-deadline"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Deadline
                </label>
                <Input
                  id="create-project-deadline"
                  name="deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  disabled={createLoading}
                  data-testid="new-project-deadline"
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
                data-testid="submit-create-project"
              >
                Create Project
              </Button>
            </div>
          </form>
        </Modal>

        {/* Edit Project Modal */}
        <Modal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          title="Edit Project"
          description="Update project details, area, deadline, or linked goal"
        >
          <form onSubmit={handleEdit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label
                htmlFor="edit-project-name"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Project Name *
              </label>
              <Input
                id="edit-project-name"
                name="name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                disabled={editLoading}
                data-testid="edit-project-name"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="edit-project-desc"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Description
              </label>
              <Textarea
                id="edit-project-desc"
                name="description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={editLoading}
                data-testid="edit-project-desc"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-project-area"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Life Area
                </label>
                <Select
                  id="edit-project-area"
                  name="area"
                  value={editArea}
                  onChange={(e) => setEditArea(e.target.value as LifeArea)}
                  disabled={editLoading}
                  data-testid="edit-project-area"
                >
                  <option value="general">General</option>
                  <option value="health">Health</option>
                  <option value="career">Career</option>
                  <option value="finance">Finance</option>
                  <option value="personal_development">Personal Development</option>
                  <option value="relationships">Relationships</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-project-goal"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Linked Goal
                </label>
                <Select
                  id="edit-project-goal"
                  name="goalId"
                  value={editGoalId}
                  onChange={(e) => setEditGoalId(e.target.value)}
                  disabled={editLoading}
                  data-testid="edit-project-goal"
                >
                  <option value="">None (Independent)</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-project-status"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Status
                </label>
                <Select
                  id="edit-project-status"
                  name="status"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as ProjectStatus)}
                  disabled={editLoading}
                  data-testid="edit-project-status"
                >
                  <option value="active">Active</option>
                  <option value="planning">Planning</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-project-priority"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Priority
                </label>
                <Select
                  id="edit-project-priority"
                  name="priority"
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as Priority)}
                  disabled={editLoading}
                  data-testid="edit-project-priority"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-project-deadline"
                  className="text-xs font-semibold uppercase text-muted-foreground"
                >
                  Deadline
                </label>
                <Input
                  id="edit-project-deadline"
                  name="deadline"
                  type="date"
                  value={editDeadline}
                  onChange={(e) => setEditDeadline(e.target.value)}
                  disabled={editLoading}
                  data-testid="edit-project-deadline"
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
                data-testid="submit-edit-project"
              >
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>

        {/* Milestones Management Modal */}
        <Modal
          isOpen={isMilestonesOpen}
          onClose={() => setIsMilestonesOpen(false)}
          title={`Milestones: ${milestonesProject?.name || ""}`}
          description="Track key checkpoints contributing to project completion"
        >
          <div className="space-y-4 pt-2">
            {/* Add Milestone Form */}
            <form onSubmit={handleAddMilestone} className="flex flex-col gap-2 p-3 bg-muted/40 rounded-lg border">
              <span className="text-xs font-semibold text-muted-foreground">Add Milestone</span>
              <div className="flex gap-2">
                <Input
                  placeholder="Milestone title..."
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  disabled={addingMilestone}
                  className="text-sm"
                  data-testid="new-milestone-title"
                />
                <Input
                  type="date"
                  value={newMilestoneDate}
                  onChange={(e) => setNewMilestoneDate(e.target.value)}
                  disabled={addingMilestone}
                  className="w-36 text-sm"
                  data-testid="new-milestone-date"
                />
                <Button
                  type="submit"
                  size="sm"
                  loading={addingMilestone}
                  disabled={!newMilestoneTitle.trim()}
                  data-testid="add-milestone-btn"
                >
                  Add
                </Button>
              </div>
            </form>

            {/* Milestones List */}
            {milestonesLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : projectMilestones.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                No milestones added yet. Milestones represent major project checkpoints.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {projectMilestones.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2.5 rounded-md border bg-card hover:bg-muted/50 transition-colors"
                    data-testid={`milestone-row-${m.id}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleToggleMilestone(m)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title={m.status === "completed" ? "Mark pending" : "Mark completed"}
                      >
                        {m.status === "completed" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Circle className="h-4 w-4" />
                        )}
                      </button>
                      <div>
                        <p
                          className={`text-sm font-medium ${
                            m.status === "completed"
                              ? "line-through text-muted-foreground"
                              : "text-foreground"
                          }`}
                        >
                          {m.title}
                        </p>
                        {m.targetDate && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(m.targetDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteMilestone(m.id)}
                      title="Delete milestone"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setIsMilestonesOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>

        {/* Delete Project Confirmation Dialog */}
        <Modal
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          title="Delete Project"
        >
          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Confirm Deletion</p>
                <p className="text-xs mt-1 text-destructive/90">
                  Are you sure you want to delete &quot;{deletingProject?.name}&quot;?
                  All associated tasks will remain intact, but their project assignment will be removed.
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
                data-testid="confirm-delete-project"
              >
                Delete Project
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}

export default function ProjectsPage() {
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
      <ProjectsContent />
    </React.Suspense>
  );
}
