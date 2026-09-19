"use client";

import * as React from "react";
import {
  Zap,
  Calendar,
  Clock,
  Tag,
  Folder,
  AlertCircle,
  Sparkles,
  X,
} from "lucide-react";
import { Badge, EnergyBadge, PriorityBadge } from "@/components/ui/badge";
import { toast } from "sonner";

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated?: (task: any) => void;
}

interface ParsedTokens {
  title: string;
  priority?: "critical" | "high" | "medium" | "low";
  dueDate?: string;
  scheduledDate?: string;
  energyLevel?: "low" | "medium" | "high";
  projectName?: string;
  duration?: number;
  tags: string[];
}

function parseTokensClient(text: string): ParsedTokens {
  let clean = text.trim();
  const tags: string[] = [];
  let priority: "critical" | "high" | "medium" | "low" | undefined;
  let dueDate: string | undefined;
  let scheduledDate: string | undefined;
  let energyLevel: "low" | "medium" | "high" | undefined;
  let projectName: string | undefined;
  let duration: number | undefined;

  clean = clean.replace(/(?:^|\s)\+([a-zA-Z0-9_-]+)/g, (_, t) => {
    tags.push(t.toLowerCase());
    return "";
  });

  clean = clean.replace(/(?:^|\s)!(p[0-3]|critical|high|medium|low)\b/gi, (_, t) => {
    const low = t.toLowerCase();
    if (low === "p0" || low === "critical") priority = "critical";
    else if (low === "p1" || low === "high") priority = "high";
    else if (low === "p2" || low === "medium") priority = "medium";
    else if (low === "p3" || low === "low") priority = "low";
    return "";
  });

  clean = clean.replace(/(?:^|\s)\^([a-zA-Z]+|\d{4}-\d{2}-\d{2})\b/g, (_, t) => {
    dueDate = t;
    return "";
  });

  clean = clean.replace(/(?:^|\s)\*([a-zA-Z]+|\d{4}-\d{2}-\d{2})\b/g, (_, t) => {
    scheduledDate = t;
    return "";
  });

  clean = clean.replace(/(?:^|\s)@(?:energy:)?(low|medium|high)\b/gi, (_, t) => {
    const low = t.toLowerCase();
    if (low === "low" || low === "medium" || low === "high") energyLevel = low;
    return "";
  });

  clean = clean.replace(/(?:^|\s)#(?:project:)?([a-zA-Z0-9_-]+)\b/g, (_, t) => {
    projectName = t;
    return "";
  });

  clean = clean.replace(/(?:^|\s)~(\d+)(m|h)?\b/gi, (_, amt, unit) => {
    const n = parseInt(amt, 10);
    if (!isNaN(n)) duration = unit?.toLowerCase() === "h" ? n * 60 : n;
    return "";
  });

  return {
    title: clean.replace(/\s+/g, " ").trim(),
    priority,
    dueDate,
    scheduledDate,
    energyLevel,
    projectName,
    duration,
    tags,
  };
}

export function QuickCaptureModal({
  isOpen,
  onClose,
  onTaskCreated,
}: QuickCaptureModalProps) {
  const [input, setInput] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const tokens = React.useMemo(() => parseTokensClient(input), [input]);

  React.useEffect(() => {
    if (isOpen) {
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setInput("");
      setError(null);
    }
  }, [isOpen]);

  // Global keydown listeners for Esc and submit on Enter
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/tasks/quick-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: input.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to capture task");
      }

      toast.success("Task captured!", {
        description: data.task.title,
      });

      setInput("");
      if (onTaskCreated) onTaskCreated(data.task);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to capture task");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const hasTokens =
    tokens.priority ||
    tokens.dueDate ||
    tokens.scheduledDate ||
    tokens.energyLevel ||
    tokens.projectName ||
    tokens.duration ||
    tokens.tags.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-capture-title"
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 backdrop-blur-sm pt-20 sm:pt-28 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl rounded-xl border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            <h2 id="quick-capture-title" className="text-lg font-semibold tracking-tight">
              Universal Quick Capture
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Write architecture brief !critical ^tomorrow @high #Core ~45m +spec"
              className="w-full rounded-lg border bg-background px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2.5 rounded-md">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Live Syntax Token Pills */}
          {hasTokens && (
            <div className="rounded-lg border border-border/60 bg-muted/40 p-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Parsed Attributes:
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {tokens.title && (
                  <span className="text-sm font-semibold text-foreground pr-2 border-r">
                    {tokens.title}
                  </span>
                )}
                {tokens.priority && <PriorityBadge priority={tokens.priority} />}
                {tokens.energyLevel && <EnergyBadge energy={tokens.energyLevel} />}
                {tokens.dueDate && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-primary" />
                    Due: {tokens.dueDate}
                  </Badge>
                )}
                {tokens.scheduledDate && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-amber-500" />
                    Scheduled: {tokens.scheduledDate}
                  </Badge>
                )}
                {tokens.projectName && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Folder className="h-3 w-3" />
                    {tokens.projectName}
                  </Badge>
                )}
                {tokens.duration && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {tokens.duration}m
                  </Badge>
                )}
                {tokens.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="purple"
                    className="flex items-center gap-1 text-xs"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Syntax Cheat Sheet */}
          <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span>
                <code className="rounded bg-muted px-1">!p0-p3</code> Priority
              </span>
              <span>
                <code className="rounded bg-muted px-1">^date</code> Due
              </span>
              <span>
                <code className="rounded bg-muted px-1">*date</code> Schedule
              </span>
              <span>
                <code className="rounded bg-muted px-1">@energy</code> Energy
              </span>
              <span>
                <code className="rounded bg-muted px-1">#project</code> Project
              </span>
              <span>
                <code className="rounded bg-muted px-1">~30m</code> Duration
              </span>
              <span>
                <code className="rounded bg-muted px-1">+tag</code> Tag
              </span>
            </div>

            <div className="flex items-center gap-2 mt-2 sm:mt-0">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-md text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!input.trim() || isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium shadow hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? "Capturing..." : "Capture Task"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
