"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import type {
  LearningItemDTO,
  LearningItemDetailDTO,
  LearningType,
  LearningStatus,
  LearningStatsDTO,
  CreateLearningItemInput,
  NoteDTO,
} from "@/types";
import {
  GraduationCap,
  BookOpen,
  Video,
  FileText,
  Radio,
  Award,
  FileCode,
  Search,
  Plus,
  Star,
  CheckCircle2,
  Clock,
  Archive,
  RotateCcw,
  Trash2,
  Edit3,
  ExternalLink,
  Target,
  FolderKanban,
  Tag,
  X,
  ChevronRight,
  TrendingUp,
  BookCheck,
  ListTodo,
} from "lucide-react";
import { toast } from "sonner";

const TYPE_CONFIG: Record<
  LearningType,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  book: { label: "Book", icon: BookOpen, color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  course: { label: "Course", icon: Video, color: "text-purple-500 bg-purple-500/10 border-purple-500/20" },
  article: { label: "Article", icon: FileText, color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  podcast: { label: "Podcast", icon: Radio, color: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
  skill: { label: "Skill", icon: Award, color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  documentation: { label: "Documentation", icon: FileCode, color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20" },
  other: { label: "Other", icon: GraduationCap, color: "text-slate-500 bg-slate-500/10 border-slate-500/20" },
};

const STATUS_CONFIG: Record<
  LearningStatus,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  not_started: { label: "Not Started", color: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20", icon: TrendingUp },
  completed: { label: "Completed", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
  archived: { label: "Archived", color: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20", icon: Archive },
};

function LearningContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: sessionData, isPending } = useSession();

  // Data states
  const [items, setItems] = React.useState<LearningItemDTO[]>([]);
  const [stats, setStats] = React.useState<LearningStatsDTO | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Filter states
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedType, setSelectedType] = React.useState<string>("all");
  const [selectedStatus, setSelectedStatus] = React.useState<string>("all");
  const [showArchived, setShowArchived] = React.useState(false);

  // Inspector / Selection state
  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);
  const [selectedItemDetail, setSelectedItemDetail] = React.useState<LearningItemDetailDTO | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);

  // Modal states
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<LearningItemDTO | null>(null);
  const [formValues, setFormValues] = React.useState<CreateLearningItemInput>({
    title: "",
    type: "book",
    status: "not_started",
    author: "",
    url: "",
    rating: null,
    progress: 0,
    currentUnits: 0,
    totalUnits: null,
    unitType: "pages",
    summary: "",
    keyTakeaways: [],
    tags: [],
    goalId: null,
    projectId: null,
  });
  const [takeawayInput, setTakeawayInput] = React.useState("");
  const [tagInput, setTagInput] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});

  // Linked Entities lists for select dropdowns
  const [goalsList, setGoalsList] = React.useState<{ id: string; title: string }[]>([]);
  const [projectsList, setProjectsList] = React.useState<{ id: string; name: string }[]>([]);

  // Deep linking via URL query: ?id=<id> or ?action=new
  React.useEffect(() => {
    const targetId = searchParams.get("id");
    if (targetId) {
      setSelectedItemId(targetId);
    }
    const action = searchParams.get("action");
    if (action === "new") {
      handleOpenCreateModal();
    }
  }, [searchParams]);

  // Auth Protection
  React.useEffect(() => {
    if (!isPending && !sessionData) {
      router.push("/login");
    }
  }, [sessionData, isPending, router]);

  // Load Goal & Project options
  React.useEffect(() => {
    if (!sessionData) return;
    const loadRelations = async () => {
      try {
        const [gRes, pRes] = await Promise.all([
          fetch("/api/goals"),
          fetch("/api/projects"),
        ]);
        if (gRes.ok) {
          const gJson = await gRes.json();
          setGoalsList(gJson.data || []);
        }
        if (pRes.ok) {
          const pJson = await pRes.json();
          setProjectsList(pJson.data || []);
        }
      } catch {
        // Non-critical relation fetch
      }
    };
    loadRelations();
  }, [sessionData]);

  // Fetch items and stats
  const fetchItems = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (showArchived) params.set("isArchived", "true");
      if (selectedType !== "all") params.set("type", selectedType);
      if (selectedStatus !== "all") params.set("status", selectedStatus);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const [itemsRes, statsRes] = await Promise.all([
        fetch(`/api/learning?${params.toString()}`),
        fetch("/api/learning/stats"),
      ]);

      if (itemsRes.ok) {
        const json = await itemsRes.json();
        setItems(json.data || json.learningItems || []);
      }
      if (statsRes.ok) {
        const sJson = await statsRes.json();
        setStats(sJson.data || sJson.stats || null);
      }
    } catch (err) {
      toast.error("Failed to load learning items");
    } finally {
      setLoading(false);
    }
  }, [showArchived, selectedType, selectedStatus, searchQuery]);

  React.useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Fetch detail for selected item
  const fetchDetail = React.useCallback(async (id: string) => {
    try {
      setLoadingDetail(true);
      const res = await fetch(`/api/learning/${id}`);
      if (res.ok) {
        const json = await res.json();
        setSelectedItemDetail(json.data || json.learningItem);
      } else {
        setSelectedItemDetail(null);
      }
    } catch {
      toast.error("Failed to load details");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedItemId) {
      fetchDetail(selectedItemId);
    } else {
      setSelectedItemDetail(null);
    }
  }, [selectedItemId, fetchDetail]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFormValues({
      title: "",
      type: "book",
      status: "not_started",
      author: "",
      url: "",
      rating: null,
      progress: 0,
      currentUnits: 0,
      totalUnits: null,
      unitType: "pages",
      summary: "",
      keyTakeaways: [],
      tags: [],
      goalId: null,
      projectId: null,
    });
    setTakeawayInput("");
    setTagInput("");
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (item: LearningItemDTO) => {
    setEditingItem(item);
    setFormValues({
      title: item.title,
      type: item.type,
      status: item.status,
      author: item.author || "",
      url: item.url || "",
      rating: item.rating,
      progress: item.progress,
      currentUnits: item.currentUnits || 0,
      totalUnits: item.totalUnits || null,
      unitType: item.unitType || "pages",
      summary: item.summary || "",
      keyTakeaways: item.keyTakeaways || [],
      tags: item.tags || [],
      goalId: item.goalId,
      projectId: item.projectId,
    });
    setTakeawayInput("");
    setTagInput("");
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Handle Tag Addition
  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (!trimmed) return;
    if (formValues.tags && formValues.tags.includes(trimmed)) return;
    setFormValues((prev) => ({
      ...prev,
      tags: [...(prev.tags || []), trimmed],
    }));
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setFormValues((prev) => ({
      ...prev,
      tags: (prev.tags || []).filter((t) => t !== tag),
    }));
  };

  // Handle Takeaway Addition
  const handleAddTakeaway = () => {
    const trimmed = takeawayInput.trim();
    if (!trimmed) return;
    setFormValues((prev) => ({
      ...prev,
      keyTakeaways: [...(prev.keyTakeaways || []), trimmed],
    }));
    setTakeawayInput("");
  };

  const handleRemoveTakeaway = (index: number) => {
    setFormValues((prev) => ({
      ...prev,
      keyTakeaways: (prev.keyTakeaways || []).filter((_, i) => i !== index),
    }));
  };

  // Save Modal (Create / Update)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    if (!formValues.title || !formValues.title.trim()) {
      setFormErrors({ title: "Title cannot be empty" });
      return;
    }

    try {
      setIsSaving(true);
      const url = editingItem
        ? `/api/learning/${editingItem.id}`
        : "/api/learning";
      const method = editingItem ? "PATCH" : "POST";

      const payload = {
        title: formValues.title.trim(),
        type: formValues.type,
        status: formValues.status,
        author: formValues.author?.trim() || null,
        url: formValues.url?.trim() || null,
        rating: formValues.rating ?? null,
        progress: formValues.progress ?? 0,
        currentUnits: formValues.currentUnits ?? 0,
        totalUnits: formValues.totalUnits ?? null,
        unitType: formValues.unitType?.trim() || null,
        summary: formValues.summary?.trim() || null,
        keyTakeaways: formValues.keyTakeaways || [],
        tags: formValues.tags || [],
        goalId: formValues.goalId || null,
        projectId: formValues.projectId || null,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorJson = await res.json();
        if (errorJson.details && Array.isArray(errorJson.details)) {
          const mapped: Record<string, string> = {};
          for (const d of errorJson.details) {
            if (d.path?.[0]) mapped[d.path[0]] = d.message;
          }
          setFormErrors(mapped);
          return;
        }
        throw new Error(errorJson.error || "Failed to save item");
      }

      const json = await res.json();
      const savedItem = json.data || json.learningItem;
      toast.success(editingItem ? "Learning item updated" : "Learning item created");
      setIsModalOpen(false);

      // Refresh list and stats
      fetchItems();
      if (selectedItemId === savedItem.id) {
        fetchDetail(savedItem.id);
      } else if (!editingItem) {
        setSelectedItemId(savedItem.id);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save learning item");
    } finally {
      setIsSaving(false);
    }
  };

  // Archive / Restore
  const handleToggleArchive = async (item: LearningItemDTO) => {
    try {
      const url = item.isArchived
        ? `/api/learning/${item.id}?restore=true`
        : `/api/learning/${item.id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error("Operation failed");
      toast.success(item.isArchived ? "Restored from archive" : "Archived");
      fetchItems();
      if (selectedItemId === item.id) {
        fetchDetail(item.id);
      }
    } catch {
      toast.error("Failed to update archive status");
    }
  };

  // Hard Delete
  const handleDeletePermanent = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this learning item? Notes linked to it will be unlinked.")) {
      return;
    }
    try {
      const res = await fetch(`/api/learning/${id}?hard=true`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Learning item deleted");
      if (selectedItemId === id) {
        setSelectedItemId(null);
      }
      fetchItems();
    } catch {
      toast.error("Failed to delete learning item");
    }
  };

  // Create Note linked to this learning item
  const handleCreateLinkedNote = async (learningItemId: string, title: string) => {
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Notes on: ${title}`,
          content: `# Notes on: ${title}\n\nKey thoughts and insights...`,
          noteType: "learning",
          area: "personal_development",
          learningId: learningItemId,
        }),
      });
      if (!res.ok) throw new Error("Failed to create note");
      const json = await res.json();
      toast.success("Linked note created");
      fetchDetail(learningItemId);
      router.push(`/notes?id=${json.data.id}`);
    } catch {
      toast.error("Failed to create linked note");
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-7xl mx-auto pb-12" data-testid="learning-dashboard">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-primary" />
              Learning System
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track books, courses, articles, podcasts, and skills with key takeaways and linked notes.
            </p>
          </div>
          <Button
            onClick={handleOpenCreateModal}
            className="gap-2 shrink-0"
            data-testid="create-learning-item-btn"
          >
            <Plus className="h-4 w-4" />
            Add Learning Item
          </Button>
        </div>

        {/* Analytics & Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="learning-metrics">
          <Card className="p-4 bg-card/60 backdrop-blur border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase">Total Items</span>
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold mt-2 text-foreground" data-testid="metric-total">
              {stats?.totalItems ?? items.length}
            </p>
          </Card>

          <Card className="p-4 bg-card/60 backdrop-blur border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase">In Progress</span>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold mt-2 text-blue-500" data-testid="metric-in-progress">
              {stats?.activeCount ?? items.filter((i) => i.status === "in_progress").length}
            </p>
          </Card>

          <Card className="p-4 bg-card/60 backdrop-blur border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase">Completed</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold mt-2 text-emerald-500" data-testid="metric-completed">
              {stats?.completedCount ?? items.filter((i) => i.status === "completed").length}
            </p>
          </Card>

          <Card className="p-4 bg-card/60 backdrop-blur border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase">Avg. Progress</span>
              <Award className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold mt-2 text-amber-500" data-testid="metric-avg-progress">
              {stats?.averageProgress ?? 0}%
            </p>
          </Card>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-muted/40 p-3 rounded-lg border">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search learning items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
                data-testid="learning-search-input"
              />
            </div>

            {/* Type Filter */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="h-9 text-xs bg-background border border-input rounded-md px-2 text-foreground font-medium"
              data-testid="learning-type-filter"
            >
              <option value="all">All Types</option>
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-9 text-xs bg-background border border-input rounded-md px-2 text-foreground font-medium"
              data-testid="learning-status-filter"
            >
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant={showArchived ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
              className="gap-1.5 text-xs h-9"
              data-testid="toggle-archived-btn"
            >
              <Archive className="h-3.5 w-3.5" />
              {showArchived ? "Hide Archived" : "Show Archived"}
            </Button>
          </div>
        </div>

        {/* Main Content Grid: Items Grid & Detail Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Items List (2 cols on large screen) */}
          <div className="lg:col-span-2 space-y-4">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : items.length === 0 ? (
              <Card className="p-12 text-center border-dashed">
                <GraduationCap className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
                <h3 className="text-base font-semibold text-foreground">No learning items found</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  {searchQuery || selectedType !== "all" || selectedStatus !== "all"
                    ? "Try adjusting your filters or search query."
                    : "Track your first book, online course, or article to begin building your personal knowledge base."}
                </p>
                <Button onClick={handleOpenCreateModal} className="mt-4 gap-2" size="sm">
                  <Plus className="h-4 w-4" />
                  Add First Item
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="learning-items-grid">
                {items.map((item) => {
                  const typeCfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.other;
                  const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.not_started;
                  const TypeIcon = typeCfg.icon;
                  const StatusIcon = statusCfg.icon;
                  const isSelected = selectedItemId === item.id;

                  return (
                    <Card
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      className={`cursor-pointer transition-all hover:shadow-md border ${
                        isSelected ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "hover:border-border"
                      }`}
                      data-testid={`learning-card-${item.id}`}
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* Top row: Type Badge & Status Badge */}
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${typeCfg.color}`}
                          >
                            <TypeIcon className="h-3 w-3" />
                            {typeCfg.label}
                          </span>

                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusCfg.color}`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {statusCfg.label}
                          </span>
                        </div>

                        {/* Title & Author */}
                        <div>
                          <h3 className="font-semibold text-sm line-clamp-1 text-foreground" title={item.title}>
                            {item.title}
                          </h3>
                          {item.author && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              by {item.author}
                            </p>
                          )}
                        </div>

                        {/* Progress Bar & Unit Counters */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                            <span>Progress</span>
                            <span>
                              {item.totalUnits && item.totalUnits > 0
                                ? `${item.currentUnits ?? 0} / ${item.totalUnits} ${item.unitType || "units"} (${item.progress}%)`
                                : `${item.progress}%`}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-300 rounded-full"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                        </div>

                        {/* Rating & Notes Count Footer */}
                        <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground border-t border-border/50">
                          {/* Star Rating */}
                          <div className="flex items-center gap-0.5" data-testid={`item-rating-${item.id}`}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`h-3 w-3 ${
                                  item.rating && star <= item.rating
                                    ? "text-amber-500 fill-amber-500"
                                    : "text-muted-foreground/30"
                                }`}
                              />
                            ))}
                          </div>

                          {/* Linked Notes Count */}
                          {(item.linkedNotesCount ?? 0) > 0 && (
                            <span className="flex items-center gap-1 text-[11px] text-primary font-medium">
                              <FileText className="h-3 w-3" />
                              {item.linkedNotesCount} {item.linkedNotesCount === 1 ? "note" : "notes"}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail Inspector (1 col on right) */}
          <div className="lg:col-span-1">
            {selectedItemId ? (
              <Card className="sticky top-20 border bg-card/80 backdrop-blur shadow-sm" data-testid="detail-inspector">
                <CardHeader className="p-4 pb-2 border-b flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-primary" />
                    Item Details
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    {selectedItemDetail && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => handleOpenEditModal(selectedItemDetail)}
                        title="Edit Item"
                        data-testid="inspector-edit-btn"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground"
                      onClick={() => setSelectedItemId(null)}
                      title="Close"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  {loadingDetail || !selectedItemDetail ? (
                    <div className="flex h-48 items-center justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : (
                    <>
                      {/* Title & Type */}
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              TYPE_CONFIG[selectedItemDetail.type]?.color || ""
                            }`}
                          >
                            {TYPE_CONFIG[selectedItemDetail.type]?.label}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                              STATUS_CONFIG[selectedItemDetail.status]?.color || ""
                            }`}
                          >
                            {STATUS_CONFIG[selectedItemDetail.status]?.label}
                          </span>
                        </div>
                        <h2 className="text-lg font-bold text-foreground leading-tight" data-testid="inspector-title">
                          {selectedItemDetail.title}
                        </h2>
                        {selectedItemDetail.author && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            by {selectedItemDetail.author}
                          </p>
                        )}
                        {selectedItemDetail.url && (
                          <a
                            href={selectedItemDetail.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                          >
                            Open Link
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-1 bg-muted/30 p-2.5 rounded-lg border border-border/50">
                        <div className="flex items-center justify-between text-xs font-medium">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="text-foreground">
                            {selectedItemDetail.totalUnits && selectedItemDetail.totalUnits > 0
                              ? `${selectedItemDetail.currentUnits ?? 0} / ${selectedItemDetail.totalUnits} ${
                                  selectedItemDetail.unitType || "units"
                                } (${selectedItemDetail.progress}%)`
                              : `${selectedItemDetail.progress}%`}
                          </span>
                        </div>
                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300 rounded-full"
                            style={{ width: `${selectedItemDetail.progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Rating */}
                      <div className="flex items-center justify-between py-1 border-b border-border/50">
                        <span className="text-xs font-medium text-muted-foreground">Rating:</span>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`h-3.5 w-3.5 ${
                                selectedItemDetail.rating && s <= selectedItemDetail.rating
                                  ? "text-amber-500 fill-amber-500"
                                  : "text-muted-foreground/30"
                              }`}
                            />
                          ))}
                          <span className="text-xs text-muted-foreground ml-1">
                            {selectedItemDetail.rating ? `${selectedItemDetail.rating}/5` : "Unrated"}
                          </span>
                        </div>
                      </div>

                      {/* Linked Goal / Project */}
                      {(selectedItemDetail.goalId || selectedItemDetail.projectId) && (
                        <div className="space-y-2 py-1 border-b border-border/50">
                          <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider block">
                            Linked Relationships
                          </span>
                          {selectedItemDetail.goalTitle && (
                            <div className="flex items-center gap-1.5 text-xs text-foreground bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">
                              <Target className="h-3.5 w-3.5 text-emerald-500" />
                              <span className="font-medium truncate">Goal: {selectedItemDetail.goalTitle}</span>
                            </div>
                          )}
                          {selectedItemDetail.projectName && (
                            <div className="flex items-center gap-1.5 text-xs text-foreground bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded">
                              <FolderKanban className="h-3.5 w-3.5 text-indigo-500" />
                              <span className="font-medium truncate">Project: {selectedItemDetail.projectName}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Summary */}
                      {selectedItemDetail.summary && (
                        <div className="space-y-1 py-1 border-b border-border/50">
                          <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider block">
                            Summary
                          </span>
                          <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
                            {selectedItemDetail.summary}
                          </p>
                        </div>
                      )}

                      {/* Key Takeaways */}
                      {selectedItemDetail.keyTakeaways && selectedItemDetail.keyTakeaways.length > 0 && (
                        <div className="space-y-2 py-1 border-b border-border/50" data-testid="inspector-takeaways">
                          <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider block">
                            Key Takeaways ({selectedItemDetail.keyTakeaways.length})
                          </span>
                          <ul className="space-y-1.5">
                            {selectedItemDetail.keyTakeaways.map((takeaway, idx) => (
                              <li
                                key={idx}
                                className="flex items-start gap-2 text-xs bg-muted/30 p-2 rounded border border-border/40"
                              >
                                <span className="h-4 w-4 shrink-0 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-bold">
                                  {idx + 1}
                                </span>
                                <span className="leading-snug text-foreground/90">{takeaway}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Tags */}
                      {selectedItemDetail.tags && selectedItemDetail.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 py-1 border-b border-border/50">
                          {selectedItemDetail.tags.map((t) => (
                            <span
                              key={t}
                              className="text-[10px] bg-secondary px-2 py-0.5 rounded-full text-secondary-foreground font-medium"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Linked Notes Section */}
                      <div className="space-y-2 pt-1" data-testid="inspector-linked-notes">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                            Linked Notes ({selectedItemDetail.linkedNotes?.length || 0})
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() =>
                              handleCreateLinkedNote(selectedItemDetail.id, selectedItemDetail.title)
                            }
                            data-testid="create-linked-note-btn"
                          >
                            <Plus className="h-3 w-3" />
                            Note
                          </Button>
                        </div>

                        {selectedItemDetail.linkedNotes && selectedItemDetail.linkedNotes.length > 0 ? (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto">
                            {selectedItemDetail.linkedNotes.map((note) => (
                              <div
                                key={note.id}
                                onClick={() => router.push(`/notes?id=${note.id}`)}
                                className="flex items-center justify-between p-2 rounded-md bg-background border hover:border-primary/50 cursor-pointer text-xs transition-colors"
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                  <span className="font-medium truncate text-foreground">{note.title}</span>
                                </div>
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic py-1">
                            No notes linked yet. Click "+ Note" to capture insights.
                          </p>
                        )}
                      </div>

                      {/* Action buttons (Archive / Delete) */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/50">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleArchive(selectedItemDetail)}
                          className="text-xs gap-1"
                          data-testid="inspector-archive-btn"
                        >
                          {selectedItemDetail.isArchived ? (
                            <>
                              <RotateCcw className="h-3.5 w-3.5" />
                              Restore
                            </>
                          ) : (
                            <>
                              <Archive className="h-3.5 w-3.5" />
                              Archive
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeletePermanent(selectedItemDetail.id)}
                          className="text-xs text-destructive hover:bg-destructive/10 gap-1"
                          data-testid="inspector-delete-btn"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="p-8 text-center border-dashed bg-card/30">
                <p className="text-xs text-muted-foreground">
                  Select a learning item to view its details, summary, key takeaways, and linked notes.
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? "Edit Learning Item" : "New Learning Item"}
      >
        <form onSubmit={handleSaveItem} className="space-y-4 max-h-[75vh] overflow-y-auto px-1">
          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              Title <span className="text-destructive">*</span>
            </label>
            <Input
              value={formValues.title}
              onChange={(e) => setFormValues({ ...formValues, title: e.target.value })}
              placeholder="e.g. Clean Code, Designing Data-Intensive Applications..."
              data-testid="modal-title-input"
            />
            {formErrors.title && (
              <p className="text-xs text-destructive mt-1">{formErrors.title}</p>
            )}
          </div>

          {/* Type and Status row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Type</label>
              <select
                value={formValues.type}
                onChange={(e) => setFormValues({ ...formValues, type: e.target.value as LearningType })}
                className="w-full h-9 text-xs bg-background border border-input rounded-md px-2 text-foreground font-medium"
                data-testid="modal-type-select"
              >
                {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Status</label>
              <select
                value={formValues.status}
                onChange={(e) => setFormValues({ ...formValues, status: e.target.value as LearningStatus })}
                className="w-full h-9 text-xs bg-background border border-input rounded-md px-2 text-foreground font-medium"
                data-testid="modal-status-select"
              >
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Author and URL row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Author / Instructor</label>
              <Input
                value={formValues.author || ""}
                onChange={(e) => setFormValues({ ...formValues, author: e.target.value })}
                placeholder="e.g. Robert C. Martin"
                data-testid="modal-author-input"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Resource URL</label>
              <Input
                value={formValues.url || ""}
                onChange={(e) => setFormValues({ ...formValues, url: e.target.value })}
                placeholder="https://..."
                data-testid="modal-url-input"
              />
              {formErrors.url && (
                <p className="text-xs text-destructive mt-1">{formErrors.url}</p>
              )}
            </div>
          </div>

          {/* Progress and Units */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Progress (%)</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={formValues.progress ?? 0}
                onChange={(e) =>
                  setFormValues({ ...formValues, progress: parseInt(e.target.value, 10) || 0 })
                }
                data-testid="modal-progress-input"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Current Units</label>
              <Input
                type="number"
                min="0"
                value={formValues.currentUnits ?? 0}
                onChange={(e) =>
                  setFormValues({
                    ...formValues,
                    currentUnits: parseInt(e.target.value, 10) || 0,
                  })
                }
                data-testid="modal-current-units-input"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Total Units</label>
              <Input
                type="number"
                min="0"
                value={formValues.totalUnits ?? ""}
                onChange={(e) =>
                  setFormValues({
                    ...formValues,
                    totalUnits: e.target.value ? parseInt(e.target.value, 10) : null,
                  })
                }
                placeholder="Optional"
                data-testid="modal-total-units-input"
              />
            </div>
          </div>

          {/* Unit Type & Rating */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Unit Type</label>
              <Input
                value={formValues.unitType || ""}
                onChange={(e) => setFormValues({ ...formValues, unitType: e.target.value })}
                placeholder="e.g. pages, chapters, modules"
                data-testid="modal-unit-type-input"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Rating (1–5)</label>
              <select
                value={formValues.rating ?? ""}
                onChange={(e) =>
                  setFormValues({
                    ...formValues,
                    rating: e.target.value ? parseInt(e.target.value, 10) : null,
                  })
                }
                className="w-full h-9 text-xs bg-background border border-input rounded-md px-2 text-foreground font-medium"
                data-testid="modal-rating-select"
              >
                <option value="">Unrated</option>
                <option value="5">★★★★★ (5 - Outstanding)</option>
                <option value="4">★★★★☆ (4 - Great)</option>
                <option value="3">★★★☆☆ (3 - Good)</option>
                <option value="2">★★☆☆☆ (2 - Fair)</option>
                <option value="1">★☆☆☆☆ (1 - Poor)</option>
              </select>
            </div>
          </div>

          {/* Goal & Project Links */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Linked Goal</label>
              <select
                value={formValues.goalId ?? ""}
                onChange={(e) =>
                  setFormValues({
                    ...formValues,
                    goalId: e.target.value || null,
                  })
                }
                className="w-full h-9 text-xs bg-background border border-input rounded-md px-2 text-foreground font-medium"
                data-testid="modal-goal-select"
              >
                <option value="">None (Unlinked)</option>
                {goalsList.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">Linked Project</label>
              <select
                value={formValues.projectId ?? ""}
                onChange={(e) =>
                  setFormValues({
                    ...formValues,
                    projectId: e.target.value || null,
                  })
                }
                className="w-full h-9 text-xs bg-background border border-input rounded-md px-2 text-foreground font-medium"
                data-testid="modal-project-select"
              >
                <option value="">None (Unlinked)</option>
                {projectsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Summary</label>
            <Textarea
              value={formValues.summary || ""}
              onChange={(e) => setFormValues({ ...formValues, summary: e.target.value })}
              placeholder="High-level overview and synthesis..."
              rows={3}
              data-testid="modal-summary-input"
            />
          </div>

          {/* Key Takeaways */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Key Takeaways</label>
            <div className="flex gap-2 mb-2">
              <Input
                value={takeawayInput}
                onChange={(e) => setTakeawayInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTakeaway();
                  }
                }}
                placeholder="Add core takeaway..."
                className="h-8 text-xs"
                data-testid="modal-takeaway-input"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddTakeaway}
                className="h-8 text-xs shrink-0"
                data-testid="modal-add-takeaway-btn"
              >
                Add
              </Button>
            </div>

            {formValues.keyTakeaways && formValues.keyTakeaways.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {formValues.keyTakeaways.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs bg-muted/40 px-2 py-1 rounded border"
                  >
                    <span className="truncate flex-1 mr-2">{item}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTakeaway(idx)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Tags</label>
            <div className="flex gap-2 mb-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add tag and press enter..."
                className="h-8 text-xs"
                data-testid="modal-tag-input"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddTag}
                className="h-8 text-xs shrink-0"
              >
                Add
              </Button>
            </div>

            {formValues.tags && formValues.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {formValues.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full"
                  >
                    #{t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Submit buttons */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSaving}
              data-testid="modal-save-btn"
            >
              {isSaving ? "Saving..." : editingItem ? "Save Changes" : "Create Item"}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}

export default function LearningPage() {
  return (
    <React.Suspense
      fallback={
        <AppShell>
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        </AppShell>
      }
    >
      <LearningContent />
    </React.Suspense>
  );
}
