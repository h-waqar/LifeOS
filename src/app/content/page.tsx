"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  Filter,
  Share2,
  Calendar as CalendarIcon,
  BarChart3,
  Loader2,
  Sparkles,
  RefreshCw,
  FolderKanban,
  Tag,
  LayoutGrid,
  List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContentCard } from "@/components/content/content-card";
import { IdeaCaptureModal } from "@/components/content/idea-capture-modal";
import { MultiPlatformEditor } from "@/components/content/multi-platform-editor";
import { ContentCalendarView } from "@/components/content/content-calendar-view";
import { ContentAnalyticsView } from "@/components/content/content-analytics-view";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import type {
  ContentItemDTO,
  ContentStatus,
  ContentPlatform,
} from "@/types";

export default function ContentPage() {
  const searchParams = useSearchParams();
  const initialAction = searchParams.get("action");
  const initialId = searchParams.get("id");

  const [items, setItems] = React.useState<ContentItemDTO[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<"library" | "calendar" | "analytics">("library");

  // Filters
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [platformFilter, setPlatformFilter] = React.useState<string>("all");

  // Selected item for editor
  const [selectedItem, setSelectedItem] = React.useState<ContentItemDTO | null>(null);
  const [isIdeaModalOpen, setIsIdeaModalOpen] = React.useState(false);

  // Cross-entity options for idea capture
  const [goals, setGoals] = React.useState<Array<{ id: string; title: string }>>([]);
  const [projects, setProjects] = React.useState<Array<{ id: string; title: string }>>([]);
  const [notes, setNotes] = React.useState<Array<{ id: string; title: string }>>([]);

  const fetchContent = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (platformFilter !== "all") params.set("platform", platformFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`/api/content?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load content items");
      const json = await res.json();
      setItems(json.data || []);
      setTotalCount(json.total || 0);

      // If initialId was provided in query param, auto-open it
      if (initialId) {
        const match = (json.data || []).find((i: ContentItemDTO) => i.id === initialId);
        if (match) setSelectedItem(match);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load content items");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, platformFilter, searchQuery, initialId]);

  // Load auxiliary options once
  React.useEffect(() => {
    async function loadAux() {
      try {
        const [gRes, pRes, nRes] = await Promise.all([
          fetch("/api/goals").then((r) => (r.ok ? r.json() : { data: [] })),
          fetch("/api/projects").then((r) => (r.ok ? r.json() : { data: [] })),
          fetch("/api/notes").then((r) => (r.ok ? r.json() : { data: [] })),
        ]);
        setGoals((gRes.data || []).map((g: any) => ({ id: g.id, title: g.title })));
        setProjects((pRes.data || []).map((p: any) => ({ id: p.id, title: p.name || p.title })));
        setNotes((nRes.data || []).map((n: any) => ({ id: n.id, title: n.title })));
      } catch {
        // non-blocking
      }
    }
    loadAux();
  }, []);

  React.useEffect(() => {
    if (initialAction === "new") {
      setIsIdeaModalOpen(true);
    }
  }, [initialAction]);

  React.useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleStatusChange = async (item: ContentItemDTO, newStatus: ContentStatus) => {
    try {
      const res = await fetch(`/api/content/${item.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update status");
      }
      toast.success(`Updated status to ${newStatus}`);
      fetchContent();
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  const handleArchive = async (id: string) => {
    try {
      const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to archive content item");
      toast.success("Content item archived");
      fetchContent();
    } catch (err: any) {
      toast.error(err.message || "Failed to archive item");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this content item?")) return;
    try {
      const res = await fetch(`/api/content/${id}?hard=true`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete content item");
      toast.success("Content item permanently deleted");
      fetchContent();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete item");
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto" data-testid="content-page">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Share2 className="h-7 w-7 text-primary" />
            <span>Content & Social Media</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Capture ideas, author multi-platform variants, schedule publications, and track reach.
          </p>
        </div>

        <Button
          onClick={() => setIsIdeaModalOpen(true)}
          className="gap-2 shrink-0"
          data-testid="new-idea-button"
        >
          <Plus className="h-4 w-4" />
          <span>New Content Idea</span>
        </Button>
      </div>

      {/* Top View Mode Switcher */}
      <div className="flex border-b border-border gap-2" data-testid="content-tabs-nav">
        <button
          type="button"
          onClick={() => setActiveTab("library")}
          className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "library"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-content-library"
        >
          <LayoutGrid className="h-4 w-4" />
          <span>Content Library</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("calendar")}
          className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "calendar"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-editorial-calendar"
        >
          <CalendarIcon className="h-4 w-4" />
          <span>Editorial Calendar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("analytics")}
          className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === "analytics"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-performance-analytics"
        >
          <BarChart3 className="h-4 w-4" />
          <span>Performance Analytics</span>
        </button>
      </div>

      {/* View Content */}
      {activeTab === "calendar" ? (
        <ContentCalendarView
          onOpenEditor={async (clickedItem) => {
            try {
              const res = await fetch(`/api/content/${clickedItem.id}`);
              if (res.ok) {
                const json = await res.json();
                setSelectedItem(json.data);
              } else {
                setSelectedItem(clickedItem);
              }
            } catch {
              setSelectedItem(clickedItem);
            }
          }}
        />
      ) : activeTab === "analytics" ? (
        <ContentAnalyticsView />
      ) : (
        <>
          {/* Filter and View Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-card rounded-xl border border-border">
            {/* Search input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search content by title, topic, or hook..."
                className="pl-9 h-9 text-xs"
                data-testid="content-search-input"
              />
            </div>

            {/* Status Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
              {[
                { id: "all", label: "All" },
                { id: "idea", label: "Ideas" },
                { id: "draft", label: "Drafts" },
                { id: "in_review", label: "In Review" },
                { id: "scheduled", label: "Scheduled" },
                { id: "published", label: "Published" },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setStatusFilter(pill.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === pill.id
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  data-testid={`filter-status-${pill.id}`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Platform Dropdown */}
            <div className="shrink-0">
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="platform-filter-select"
              >
                <option value="all">All Channels</option>
                <option value="twitter">Twitter / X</option>
                <option value="linkedin">LinkedIn</option>
                <option value="blog">Blog</option>
                <option value="newsletter">Newsletter</option>
                <option value="youtube">YouTube</option>
                <option value="instagram">Instagram</option>
              </select>
            </div>
          </div>

          {/* Main Content Grid */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm">Loading your content library...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl border border-dashed border-border bg-card/40">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {searchQuery || statusFilter !== "all" || platformFilter !== "all"
                  ? "No matching content items"
                  : "No content ideas yet"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
                {searchQuery || statusFilter !== "all" || platformFilter !== "all"
                  ? "Try adjusting your search query or filter criteria."
                  : "Capture your first content idea, choose distribution channels, and start authoring multi-platform drafts."}
              </p>
              <Button
                size="sm"
                onClick={() => setIsIdeaModalOpen(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                <span>Capture Content Idea</span>
              </Button>
            </div>
          ) : (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              data-testid="content-items-grid"
            >
              {items.map((item) => (
                <ContentCard
                  key={item.id}
                  item={item}
                  onOpenEditor={async (clickedItem) => {
                    // Fetch full item with all variants
                    try {
                      const res = await fetch(`/api/content/${clickedItem.id}`);
                      if (res.ok) {
                        const json = await res.json();
                        setSelectedItem(json.data);
                      } else {
                        setSelectedItem(clickedItem);
                      }
                    } catch {
                      setSelectedItem(clickedItem);
                    }
                  }}
                  onStatusChange={handleStatusChange}
                  onArchive={handleArchive}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Idea Capture Modal */}
      <IdeaCaptureModal
        isOpen={isIdeaModalOpen}
        onClose={() => setIsIdeaModalOpen(false)}
        onSuccess={() => fetchContent()}
        goals={goals}
        projects={projects}
        notes={notes}
      />

      {/* Multi-Platform Editor Modal */}
      {selectedItem && (
        <Modal
          isOpen={Boolean(selectedItem)}
          onClose={() => setSelectedItem(null)}
          title=""
          className="max-w-5xl h-[88vh] p-0 overflow-hidden"
        >
          <MultiPlatformEditor
            item={selectedItem}
            onUpdate={async () => {
              // Refresh editor item
              try {
                const res = await fetch(`/api/content/${selectedItem.id}`);
                if (res.ok) {
                  const json = await res.json();
                  setSelectedItem(json.data);
                }
              } catch {}
              fetchContent();
            }}
            onClose={() => setSelectedItem(null)}
          />
        </Modal>
      )}
    </div>
  );
}
