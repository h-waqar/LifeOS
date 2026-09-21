"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { AreaBadge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import type {
  NoteDTO,
  NoteType,
  LifeArea,
  NoteLinkDTO,
  BacklinkItemDTO,
} from "@/types";
import {
  FileText,
  Plus,
  Search,
  Pin,
  PinOff,
  Trash2,
  Archive,
  Save,
  Eye,
  Edit3,
  Columns,
  PanelRightClose,
  PanelRightOpen,
  Link2,
  Tag,
  FolderKanban,
  Target,
  CheckSquare,
  Sparkles,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";

const NOTE_TYPES: { label: string; value: NoteType }[] = [
  { label: "Quick Note", value: "quick" },
  { label: "Meeting Note", value: "meeting" },
  { label: "Research", value: "research" },
  { label: "Idea", value: "idea" },
  { label: "Journal", value: "journal" },
  { label: "Documentation", value: "documentation" },
  { label: "Reference", value: "reference" },
  { label: "Learning", value: "learning" },
];

const LIFE_AREAS: { label: string; value: LifeArea }[] = [
  { label: "General", value: "general" },
  { label: "Career", value: "career" },
  { label: "Personal Dev", value: "personal_development" },
  { label: "Health", value: "health" },
  { label: "Finance", value: "finance" },
  { label: "Relationships", value: "relationships" },
];

function NotesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionLoading } = useSession();

  // State
  const [notes, setNotes] = React.useState<NoteDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedNoteId, setSelectedNoteId] = React.useState<string | null>(null);
  const [selectedNote, setSelectedNote] = React.useState<
    (NoteDTO & { outgoingLinks?: NoteLinkDTO[]; backlinks?: BacklinkItemDTO[] }) | null
  >(null);
  const [noteLoading, setNoteLoading] = React.useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = React.useState("");
  const [areaFilter, setAreaFilter] = React.useState<string>("all");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [selectedTag, setSelectedTag] = React.useState<string | null>(null);

  // Editor State
  const [viewMode, setViewMode] = React.useState<"edit" | "preview" | "split">("split");
  const [showInspector, setShowInspector] = React.useState(true);
  const [editorTitle, setEditorTitle] = React.useState("");
  const [editorContent, setEditorContent] = React.useState("");
  const [editorArea, setEditorArea] = React.useState<LifeArea>("general");
  const [editorType, setEditorType] = React.useState<NoteType>("quick");
  const [editorTags, setEditorTags] = React.useState<string[]>([]);
  const [isPinned, setIsPinned] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [newTagInput, setNewTagInput] = React.useState("");

  // Auth Protection
  React.useEffect(() => {
    if (!sessionLoading && !session) {
      router.push("/login");
    }
  }, [session, sessionLoading, router]);

  // Load Notes List
  const fetchNotes = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (areaFilter !== "all") params.set("area", areaFilter);
      if (typeFilter !== "all") params.set("noteType", typeFilter);
      if (selectedTag) params.set("tag", selectedTag);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`/api/notes?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load notes");
      const json = await res.json();
      setNotes(json.data || []);

      // If no note selected, select first
      if (json.data && json.data.length > 0 && !selectedNoteId) {
        setSelectedNoteId(json.data[0].id);
      }
    } catch (err) {
      toast.error("Error loading notes");
    } finally {
      setLoading(false);
    }
  }, [areaFilter, typeFilter, selectedTag, searchQuery, selectedNoteId]);

  React.useEffect(() => {
    if (session) {
      fetchNotes();
    }
  }, [session, fetchNotes]);

  // Load Selected Note Details
  React.useEffect(() => {
    if (!selectedNoteId) {
      setSelectedNote(null);
      return;
    }

    let isMounted = true;
    const loadNote = async () => {
      try {
        setNoteLoading(true);
        const res = await fetch(`/api/notes/${selectedNoteId}`);
        if (!res.ok) throw new Error("Failed to load note details");
        const json = await res.json();
        if (isMounted) {
          setSelectedNote(json.data);
          setEditorTitle(json.data.title);
          setEditorContent(json.data.content);
          setEditorArea(json.data.area);
          setEditorType(json.data.noteType);
          setEditorTags(json.data.tags || []);
          setIsPinned(json.data.isPinned);
        }
      } catch (err) {
        toast.error("Error loading note");
      } finally {
        if (isMounted) setNoteLoading(false);
      }
    };

    loadNote();
    return () => {
      isMounted = false;
    };
  }, [selectedNoteId]);

  // Create New Note
  const handleCreateNote = async () => {
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled Note",
          content: "# Untitled Note\n\nStart writing markdown here...",
          area: areaFilter !== "all" ? areaFilter : "general",
          noteType: typeFilter !== "all" ? typeFilter : "quick",
          tags: selectedTag ? [selectedTag] : [],
        }),
      });

      if (!res.ok) throw new Error("Failed to create note");
      const json = await res.json();
      toast.success("Note created");
      setNotes((prev) => [json.data, ...prev]);
      setSelectedNoteId(json.data.id);
      setViewMode("edit");
    } catch (err) {
      toast.error("Failed to create note");
    }
  };

  // Save Note
  const handleSaveNote = async () => {
    if (!selectedNoteId) return;
    try {
      setIsSaving(true);
      const res = await fetch(`/api/notes/${selectedNoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editorTitle,
          content: editorContent,
          area: editorArea,
          noteType: editorType,
          tags: editorTags,
          isPinned,
        }),
      });

      if (!res.ok) throw new Error("Failed to save note");
      const json = await res.json();
      toast.success("Note saved");

      // Refresh note detail (to get updated backlinks and outgoing links)
      const detailRes = await fetch(`/api/notes/${selectedNoteId}`);
      if (detailRes.ok) {
        const detailJson = await detailRes.json();
        setSelectedNote(detailJson.data);
      }

      // Update in list
      setNotes((prev) =>
        prev.map((n) => (n.id === selectedNoteId ? { ...n, ...json.data } : n))
      );
    } catch (err) {
      toast.error("Failed to save note");
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Pin
  const handleTogglePin = async () => {
    if (!selectedNoteId) return;
    const nextPin = !isPinned;
    setIsPinned(nextPin);
    try {
      await fetch(`/api/notes/${selectedNoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: nextPin }),
      });
      setNotes((prev) =>
        prev.map((n) => (n.id === selectedNoteId ? { ...n, isPinned: nextPin } : n))
      );
      toast.success(nextPin ? "Note pinned" : "Note unpinned");
    } catch {
      setIsPinned(!nextPin);
      toast.error("Failed to update pin status");
    }
  };

  // Delete Note
  const handleDeleteNote = async () => {
    if (!selectedNoteId) return;
    if (!confirm("Are you sure you want to delete this note?")) return;

    try {
      const res = await fetch(`/api/notes/${selectedNoteId}?hard=true`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete note");
      toast.success("Note deleted");

      setNotes((prev) => prev.filter((n) => n.id !== selectedNoteId));
      setSelectedNoteId(null);
      setSelectedNote(null);
    } catch {
      toast.error("Failed to delete note");
    }
  };

  // Add Tag
  const handleAddTag = () => {
    const trimmed = newTagInput.trim().toLowerCase();
    if (!trimmed) return;
    if (editorTags.includes(trimmed)) {
      setNewTagInput("");
      return;
    }
    const updated = [...editorTags, trimmed];
    setEditorTags(updated);
    setNewTagInput("");
  };

  // Remove Tag
  const handleRemoveTag = (tagToRemove: string) => {
    setEditorTags(editorTags.filter((t) => t !== tagToRemove));
  };

  // Wikilink Click Handler
  const handleWikilinkClick = (targetTitle: string) => {
    const norm = targetTitle.toLowerCase().trim();
    const found = notes.find((n) => n.title.toLowerCase().trim() === norm);
    if (found) {
      setSelectedNoteId(found.id);
      toast.info(`Opened: ${found.title}`);
    } else {
      toast.info(`Note "${targetTitle}" does not exist yet.`);
    }
  };

  // Collect all unique tags from loaded notes
  const allTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach((n) => {
      if (Array.isArray(n.tags)) {
        n.tags.forEach((t) => tagSet.add(t));
      }
    });
    return Array.from(tagSet);
  }, [notes]);

  if (sessionLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/40 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">Knowledge & Notes</h1>
            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted border border-border/60">
              {notes.length} notes
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleCreateNote}
              className="flex items-center gap-1.5"
              data-testid="new-note-button"
            >
              <Plus className="w-4 h-4" />
              <span>New Note</span>
            </Button>
          </div>
        </div>

        {/* 3-Column Workspace */}
        <div className="flex flex-1 overflow-hidden">
          {/* Column 1: Notes Sidebar (List & Filters) */}
          <aside className="w-80 border-r border-border flex flex-col bg-card/20 flex-shrink-0">
            {/* Search & Area Filter */}
            <div className="p-3 border-b border-border space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notes or content..."
                  className="pl-8 h-9 text-xs"
                  data-testid="notes-search-input"
                />
              </div>

              {/* Area & Type Selects */}
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value)}
                  className="h-8 text-xs bg-background border border-input rounded-md px-2 text-foreground focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Areas</option>
                  {LIFE_AREAS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="h-8 text-xs bg-background border border-input rounded-md px-2 text-foreground focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Types</option>
                  {NOTE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tags Filter Pill Strip */}
              {allTags.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none">
                  {selectedTag && (
                    <button
                      onClick={() => setSelectedTag(null)}
                      className="px-2 py-0.5 text-[10px] rounded-full bg-primary/20 text-primary flex items-center gap-1 flex-shrink-0"
                    >
                      <span>#{selectedTag}</span>
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {allTags
                    .filter((t) => t !== selectedTag)
                    .slice(0, 5)
                    .map((t) => (
                      <button
                        key={t}
                        onClick={() => setSelectedTag(t)}
                        className="px-2 py-0.5 text-[10px] rounded-full bg-muted text-muted-foreground hover:text-foreground flex-shrink-0 transition-colors"
                      >
                        #{t}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Note Cards List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loading ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  Loading notes...
                </div>
              ) : notes.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-xs text-muted-foreground">No notes found.</p>
                  <Button size="sm" variant="outline" onClick={handleCreateNote}>
                    Create your first note
                  </Button>
                </div>
              ) : (
                notes.map((n) => {
                  const isSelected = n.id === selectedNoteId;
                  return (
                    <button
                      key={n.id}
                      onClick={() => setSelectedNoteId(n.id)}
                      data-testid={`note-item-${n.id}`}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? "bg-primary/10 border-primary/40 shadow-sm"
                          : "bg-card/40 hover:bg-muted/50 border-border/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <h3 className="text-xs font-semibold text-foreground truncate flex-1">
                          {n.title || "Untitled Note"}
                        </h3>
                        {n.isPinned && <Pin className="w-3 h-3 text-primary flex-shrink-0" />}
                      </div>

                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
                        {n.content.replace(/^#+\s+/gm, "").slice(0, 100) || "Empty note"}
                      </p>

                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border/40">
                          {n.noteType}
                        </span>
                        {n.area && <AreaBadge area={n.area} />}
                        {n.tags?.slice(0, 2).map((t) => (
                          <span
                            key={t}
                            className="text-[9px] text-blue-500/80 font-mono"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Column 2: Center Editor & Preview Pane */}
          <main className="flex-1 flex flex-col overflow-hidden bg-background">
            {selectedNote ? (
              <>
                {/* Note Editor Header Bar */}
                <div className="flex items-center justify-between px-6 py-2.5 border-b border-border bg-card/10">
                  <Input
                    value={editorTitle}
                    onChange={(e) => setEditorTitle(e.target.value)}
                    placeholder="Note title..."
                    className="text-base font-semibold h-9 max-w-lg border-transparent hover:border-border focus:border-primary px-2"
                    data-testid="note-title-input"
                  />

                  <div className="flex items-center gap-1.5">
                    {/* View Mode Toggle */}
                    <div className="flex items-center border border-border rounded-md p-0.5 bg-muted/30">
                      <Button
                        size="sm"
                        variant={viewMode === "edit" ? "default" : "ghost"}
                        onClick={() => setViewMode("edit")}
                        className="h-7 px-2 text-xs"
                        title="Edit mode"
                      >
                        <Edit3 className="w-3.5 h-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant={viewMode === "split" ? "default" : "ghost"}
                        onClick={() => setViewMode("split")}
                        className="h-7 px-2 text-xs"
                        title="Split mode"
                      >
                        <Columns className="w-3.5 h-3.5 mr-1" />
                        Split
                      </Button>
                      <Button
                        size="sm"
                        variant={viewMode === "preview" ? "default" : "ghost"}
                        onClick={() => setViewMode("preview")}
                        className="h-7 px-2 text-xs"
                        title="Preview mode"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Preview
                      </Button>
                    </div>

                    {/* Pin Toggle */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleTogglePin}
                      className="h-8 w-8 p-0"
                      title={isPinned ? "Unpin note" : "Pin note"}
                    >
                      {isPinned ? (
                        <Pin className="w-4 h-4 text-primary" />
                      ) : (
                        <PinOff className="w-4 h-4 text-muted-foreground" />
                      )}
                    </Button>

                    {/* Save Button */}
                    <Button
                      size="sm"
                      onClick={handleSaveNote}
                      disabled={isSaving}
                      className="flex items-center gap-1 h-8"
                      data-testid="save-note-button"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSaving ? "Saving..." : "Save"}</span>
                    </Button>

                    {/* Delete Button */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleDeleteNote}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      title="Delete note"
                      data-testid="delete-note-button"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>

                    {/* Inspector Drawer Toggle */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowInspector(!showInspector)}
                      className="h-8 w-8 p-0"
                      title="Toggle Inspector"
                    >
                      {showInspector ? (
                        <PanelRightClose className="w-4 h-4" />
                      ) : (
                        <PanelRightOpen className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Editor Content Area */}
                <div className="flex-1 flex overflow-hidden">
                  {/* Left half: Raw Markdown Textarea */}
                  {(viewMode === "edit" || viewMode === "split") && (
                    <div
                      className={`flex-1 flex flex-col p-4 overflow-y-auto ${
                        viewMode === "split" ? "border-r border-border" : ""
                      }`}
                    >
                      <textarea
                        value={editorContent}
                        onChange={(e) => setEditorContent(e.target.value)}
                        placeholder="Write your markdown note here... Use [[Note Title]] for wikilinks."
                        className="w-full flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
                        data-testid="note-content-textarea"
                      />
                    </div>
                  )}

                  {/* Right half: Rendered Markdown Preview */}
                  {(viewMode === "preview" || viewMode === "split") && (
                    <div className="flex-1 p-6 overflow-y-auto bg-muted/10">
                      <MarkdownRenderer
                        content={editorContent}
                        onWikilinkClick={handleWikilinkClick}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <FileText className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium">Select a note or create a new one</p>
                <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">
                  LifeOS Notes support rich Markdown, bidirectional [[wikilinks]], tags, and
                  backlink graph inspection.
                </p>
                <Button size="sm" onClick={handleCreateNote} className="mt-4">
                  Create Note
                </Button>
              </div>
            )}
          </main>

          {/* Column 3: Inspector Drawer (Metadata & Backlinks) */}
          {selectedNote && showInspector && (
            <aside
              className="w-80 border-l border-border bg-card/30 flex flex-col overflow-y-auto p-4 space-y-6 flex-shrink-0"
              data-testid="note-inspector"
            >
              {/* Metadata Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Note Properties
                </h3>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    Life Area
                  </label>
                  <select
                    value={editorArea}
                    onChange={(e) => setEditorArea(e.target.value as LifeArea)}
                    className="w-full h-8 text-xs bg-background border border-input rounded-md px-2 text-foreground"
                    data-testid="note-area-select"
                  >
                    {LIFE_AREAS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    Note Type
                  </label>
                  <select
                    value={editorType}
                    onChange={(e) => setEditorType(e.target.value as NoteType)}
                    className="w-full h-8 text-xs bg-background border border-input rounded-md px-2 text-foreground"
                    data-testid="note-type-select"
                  >
                    {NOTE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tags Management */}
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {editorTags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(t)}
                          className="hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Add tag..."
                      className="h-7 text-xs"
                      data-testid="new-tag-input"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAddTag}
                      className="h-7 px-2 text-xs"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>

              {/* Outgoing Wikilinks Section */}
              <div className="space-y-2 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    Outgoing Links
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    {selectedNote.outgoingLinks?.length || 0}
                  </span>
                </div>

                {selectedNote.outgoingLinks && selectedNote.outgoingLinks.length > 0 ? (
                  <div className="space-y-1">
                    {selectedNote.outgoingLinks.map((link) => (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => handleWikilinkClick(link.targetTitle)}
                        className="w-full text-left text-xs p-1.5 rounded hover:bg-muted/60 text-blue-500 dark:text-blue-400 truncate flex items-center justify-between"
                      >
                        <span>[[{link.targetTitle}]]</span>
                        <span className="text-[10px] text-muted-foreground">
                          {link.targetNoteId ? "resolved" : "uncreated"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No outgoing links</p>
                )}
              </div>

              {/* Backlinks (Linked Mentions) Section */}
              <div className="space-y-2 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    Backlinks
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    {selectedNote.backlinks?.length || 0}
                  </span>
                </div>

                {selectedNote.backlinks && selectedNote.backlinks.length > 0 ? (
                  <div className="space-y-2" data-testid="backlinks-list">
                    {selectedNote.backlinks.map((b) => (
                      <button
                        key={b.noteId}
                        type="button"
                        onClick={() => {
                          setSelectedNoteId(b.noteId);
                          toast.info(`Opened linked note: ${b.title}`);
                        }}
                        className="w-full text-left p-2 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 transition-colors"
                      >
                        <h4 className="text-xs font-semibold text-foreground truncate">
                          {b.title}
                        </h4>
                        {b.snippet && (
                          <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 italic font-mono">
                            {b.snippet}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No other notes link here yet.
                  </p>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function NotesPage() {
  return (
    <React.Suspense
      fallback={
        <AppShell>
          <div className="flex items-center justify-center min-h-[60vh]">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </AppShell>
      }
    >
      <NotesContent />
    </React.Suspense>
  );
}
