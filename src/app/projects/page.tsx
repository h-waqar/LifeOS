"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppShell } from "@/components/app-shell";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import type { ProjectDTO, Priority, ProjectStatus } from "@/types";
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  AlertTriangle,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";

function ProjectsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionLoading } = useSession();

  const [projects, setProjects] = React.useState<ProjectDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState<ProjectStatus>("active");
  const [priority, setPriority] = React.useState<Priority>("medium");
  const [createLoading, setCreateLoading] = React.useState(false);

  // Edit Modal
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editingProject, setEditingProject] = React.useState<ProjectDTO | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [editStatus, setEditStatus] = React.useState<ProjectStatus>("active");
  const [editPriority, setEditPriority] = React.useState<Priority>("medium");
  const [editLoading, setEditLoading] = React.useState(false);

  // Delete Modal
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [deletingProject, setDeletingProject] = React.useState<ProjectDTO | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

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
      }
    }
  }, [session, sessionLoading, router, fetchProjects]);

  // Open create modal if ?action=new in URL
  React.useEffect(() => {
    if (searchParams.get("action") === "new") {
      setIsCreateOpen(true);
    }
  }, [searchParams]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setCreateLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        status,
        priority,
      };
      if (description.trim()) {
        payload.description = description.trim();
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
      setIsCreateOpen(false);
      setName("");
      setDescription("");
      setStatus("active");
      setPriority("medium");
    } catch (err: any) {
      toast.error(err.message || "Failed to create project");
    } finally {
      setCreateLoading(false);
    }
  };

  const openEdit = (p: ProjectDTO) => {
    setEditingProject(p);
    setEditName(p.name);
    setEditDescription(p.description || "");
    setEditStatus(p.status);
    setEditPriority(p.priority);
    setIsEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject || !editName.trim()) return;

    setEditLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: editName.trim(),
        status: editStatus,
        priority: editPriority,
        description: editDescription.trim() || null,
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
      setEditLoading(false);
    }
  };

  const openDelete = (p: ProjectDTO) => {
    setDeletingProject(p);
    setIsDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingProject) return;

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
      setDeleteLoading(false);
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
              Organize and track your key personal and professional initiatives
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
            {projects.map((project) => (
              <Card
                key={project.id}
                className="flex flex-col justify-between transition-all hover:border-primary/50 shadow-sm"
                data-testid={`project-card-${project.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-bold line-clamp-1">
                      {project.name}
                    </CardTitle>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusBadge status={project.status} />
                      <PriorityBadge priority={project.priority} />
                    </div>
                  </div>
                  {project.description && (
                    <CardDescription className="line-clamp-2 text-xs mt-1">
                      {project.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardFooter className="flex items-center justify-between border-t pt-3 pb-3 text-xs text-muted-foreground">
                  <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                  <div className="flex items-center gap-1">
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
            ))}
          </div>
        )}

        {/* Create Project Modal */}
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Create New Project"
          description="Define a new project with goals and scope"
        >
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Project Name *
              </label>
              <Input
                placeholder="e.g. Q3 Health & Fitness"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                disabled={createLoading}
                data-testid="new-project-name"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Description
              </label>
              <Textarea
                placeholder="Project scope and goals..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={createLoading}
                data-testid="new-project-desc"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Status
                </label>
                <Select
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
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Priority
                </label>
                <Select
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
          description="Update project details, status, or priority"
        >
          <form onSubmit={handleEdit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">
                Project Name *
              </label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                disabled={editLoading}
                data-testid="edit-project-name"
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
                data-testid="edit-project-desc"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Status
                </label>
                <Select
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
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Priority
                </label>
                <Select
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
