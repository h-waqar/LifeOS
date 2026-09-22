"use client";

import * as React from "react";
import {
  FileText,
  Share2,
  Calendar,
  Clock,
  CheckCircle2,
  Archive,
  Edit3,
  MoreVertical,
  Target,
  FolderKanban,
  Tag,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ContentItemDTO, ContentStatus, ContentPlatform } from "@/types";

interface ContentCardProps {
  item: ContentItemDTO;
  onOpenEditor: (item: ContentItemDTO) => void;
  onStatusChange?: (item: ContentItemDTO, newStatus: ContentStatus) => void;
  onDelete?: (id: string) => void;
  onArchive?: (id: string) => void;
}

export function getStatusBadge(status: ContentStatus) {
  switch (status) {
    case "idea":
      return (
        <Badge variant="outline" className="bg-muted/60 text-muted-foreground border-border text-[11px]">
          Idea
        </Badge>
      );
    case "draft":
      return (
        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[11px]">
          Draft
        </Badge>
      );
    case "in_review":
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[11px]">
          In Review
        </Badge>
      );
    case "scheduled":
      return (
        <Badge variant="outline" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 text-[11px]">
          Scheduled
        </Badge>
      );
    case "published":
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px]">
          Published
        </Badge>
      );
    case "archived":
      return (
        <Badge variant="outline" className="bg-stone-500/10 text-stone-600 dark:text-stone-400 border-stone-500/30 text-[11px]">
          Archived
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function getPlatformBadge(platform: ContentPlatform) {
  switch (platform) {
    case "twitter":
      return (
        <span
          key={platform}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-500/15 text-sky-600 dark:text-sky-400"
          title="Twitter / X"
        >
          X
        </span>
      );
    case "linkedin":
      return (
        <span
          key={platform}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-600/15 text-blue-700 dark:text-blue-300"
          title="LinkedIn"
        >
          LinkedIn
        </span>
      );
    case "blog":
      return (
        <span
          key={platform}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300"
          title="Blog Article"
        >
          Blog
        </span>
      );
    default:
      return (
        <span
          key={platform}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground uppercase"
        >
          {platform}
        </span>
      );
  }
}

export function ContentCard({
  item,
  onOpenEditor,
  onStatusChange,
  onDelete,
  onArchive,
}: ContentCardProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <div
      className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs hover:shadow-md hover:border-primary/40 transition-all"
      data-testid={`content-card-${item.id}`}
    >
      <div>
        {/* Header row: Type & Status badges, Action menu */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {item.contentType.replace("_", " ")}
            </span>
            <span>•</span>
            {getStatusBadge(item.status)}
          </div>

          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Content actions"
              data-testid={`content-actions-${item.id}`}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-8 z-30 w-44 rounded-lg border border-border bg-popover p-1 shadow-lg text-xs">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenEditor(item);
                    }}
                    data-testid={`action-edit-${item.id}`}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Open Editor</span>
                  </button>

                  {item.status !== "published" && onStatusChange && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent text-emerald-600 dark:text-emerald-400"
                      onClick={() => {
                        setMenuOpen(false);
                        onStatusChange(item, "published");
                      }}
                      data-testid={`action-publish-${item.id}`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Mark as Published</span>
                    </button>
                  )}

                  {item.status !== "archived" && onArchive && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent text-amber-600 dark:text-amber-400"
                      onClick={() => {
                        setMenuOpen(false);
                        onArchive(item.id);
                      }}
                      data-testid={`action-archive-${item.id}`}
                    >
                      <Archive className="h-3.5 w-3.5" />
                      <span>Archive</span>
                    </button>
                  )}

                  {onDelete && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-destructive/10 text-destructive"
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete(item.id);
                      }}
                      data-testid={`action-delete-${item.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Title */}
        <h3
          className="font-semibold text-base leading-snug tracking-tight text-foreground hover:text-primary cursor-pointer transition-colors mb-1.5"
          onClick={() => onOpenEditor(item)}
          data-testid={`content-title-${item.id}`}
        >
          {item.title}
        </h3>

        {/* Summary or Concept pitch */}
        {item.summary && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {item.summary}
          </p>
        )}

        {/* Topic & Tags */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {item.topic && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground bg-secondary px-2 py-0.5 rounded">
              {item.topic}
            </span>
          )}
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
            >
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Footer: Channels, Links, Schedule info */}
      <div className="border-t border-border/60 pt-2.5 mt-2 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {/* Target Channels */}
          <div className="flex items-center gap-1 flex-wrap">
            {item.targetChannels.length > 0 ? (
              item.targetChannels.map(getPlatformBadge)
            ) : (
              <span className="text-[10px] text-muted-foreground italic">
                No channels set
              </span>
            )}
          </div>

          {/* Variants Count badge */}
          {item.variantsCount !== undefined && item.variantsCount > 0 && (
            <span className="text-[10px] font-medium text-primary">
              {item.variantsCount} {item.variantsCount === 1 ? "variant" : "variants"}
            </span>
          )}
        </div>

        {/* Cross-entity badges (Goal / Project) */}
        {(item.projectName || item.goalTitle) && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {item.projectName && (
              <span className="inline-flex items-center gap-1 truncate max-w-[140px]" title={item.projectName}>
                <FolderKanban className="h-3 w-3 text-purple-500" />
                {item.projectName}
              </span>
            )}
            {item.goalTitle && (
              <span className="inline-flex items-center gap-1 truncate max-w-[140px]" title={item.goalTitle}>
                <Target className="h-3 w-3 text-amber-500" />
                {item.goalTitle}
              </span>
            )}
          </div>
        )}

        {/* Schedule date if present */}
        {item.scheduledAt && (
          <div className="flex items-center gap-1 text-[11px] text-purple-600 dark:text-purple-400 font-medium">
            <Calendar className="h-3 w-3" />
            <span>Scheduled for {new Date(item.scheduledAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
