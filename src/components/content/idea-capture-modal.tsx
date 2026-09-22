"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CONTENT_TYPES,
  CONTENT_PLATFORMS,
  type ContentType,
  type ContentPlatform,
} from "@/types";

interface EntityOption {
  id: string;
  title: string;
}

interface IdeaCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  goals?: EntityOption[];
  projects?: EntityOption[];
  notes?: EntityOption[];
}

export function IdeaCaptureModal({
  isOpen,
  onClose,
  onSuccess,
  goals = [],
  projects = [],
  notes = [],
}: IdeaCaptureModalProps) {
  const [title, setTitle] = React.useState("");
  const [contentType, setContentType] = React.useState<ContentType>("post");
  const [topic, setTopic] = React.useState("");
  const [targetAudience, setTargetAudience] = React.useState("");
  const [selectedChannels, setSelectedChannels] = React.useState<ContentPlatform[]>([
    "twitter",
  ]);
  const [tagInput, setTagInput] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [summary, setSummary] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [goalId, setGoalId] = React.useState("");
  const [noteId, setNoteId] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setTitle("");
      setContentType("post");
      setTopic("");
      setTargetAudience("");
      setSelectedChannels(["twitter"]);
      setTagInput("");
      setTags([]);
      setSummary("");
      setProjectId("");
      setGoalId("");
      setNoteId("");
    }
  }, [isOpen]);

  const toggleChannel = (channel: ContentPlatform) => {
    setSelectedChannels((prev) =>
      prev.includes(channel)
        ? prev.filter((c) => c !== channel)
        : [...prev, channel]
    );
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim().replace(/^#/, "");
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        contentType,
        status: "idea",
        topic: topic.trim() || null,
        targetAudience: targetAudience.trim() || null,
        primaryPlatform: selectedChannels[0] || null,
        targetChannels: selectedChannels,
        tags,
        summary: summary.trim() || null,
        projectId: projectId || null,
        goalId: goalId || null,
        noteId: noteId || null,
      };

      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create content idea");
      }

      toast.success("Content idea captured!");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Capture Content Idea"
      description="Record a concept, select prospective channels, and define your target audience."
      className="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2" data-testid="idea-capture-form">
        {/* Title */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Idea Title *
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 10 Lessons from Building LifeOS"
            autoFocus
            required
            data-testid="idea-title-input"
          />
        </div>

        {/* Content Type & Prospective Channels */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Content Type
            </label>
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="idea-content-type-select"
            >
              {CONTENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace("_", " ").toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Topic / Domain
            </label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Architecture, Productivity"
              data-testid="idea-topic-input"
            />
          </div>
        </div>

        {/* Prospective Channels Multi-select */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Target Distribution Channels
          </label>
          <div className="flex flex-wrap gap-2">
            {CONTENT_PLATFORMS.map((platform) => {
              const isSelected = selectedChannels.includes(platform);
              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => toggleChannel(platform)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                  data-testid={`channel-toggle-${platform}`}
                >
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Target Audience */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Target Audience
          </label>
          <Input
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder="e.g. Solo founders, Engineers, Knowledge workers"
            data-testid="idea-audience-input"
          />
        </div>

        {/* Concept Pitch / Summary */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Concept Pitch / Core Hook
          </label>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What is the core premise, takeaway, or curiosity hook for this piece?"
            rows={3}
            data-testid="idea-summary-input"
          />
        </div>

        {/* Tags input */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Tags
          </label>
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
              placeholder="Type tag and press Add"
              className="flex-1"
              data-testid="idea-tag-input"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddTag}
            >
              Add
            </Button>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(t)}
                    className="text-muted-foreground hover:text-foreground font-bold ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Cross-Domain Linkages (Goal / Project / Note) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border/60 pt-3">
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
              Link Goal
            </label>
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-xs"
            >
              <option value="">None</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
              Link Project
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-xs"
            >
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
              Link Note
            </label>
            <select
              value={noteId}
              onChange={(e) => setNoteId(e.target.value)}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-xs"
            >
              <option value="">None</option>
              {notes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} data-testid="submit-idea-button">
            {isSubmitting ? "Capturing..." : "Capture Idea"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
