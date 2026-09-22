"use client";

import * as React from "react";
import {
  Save,
  CheckCircle2,
  Calendar,
  Clock,
  ArrowRight,
  Plus,
  Trash2,
  Share2,
  FileText,
  AlertCircle,
  ExternalLink,
  Scissors,
  Eye,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { toast } from "sonner";
import {
  CONTENT_PLATFORMS,
  CONTENT_STATUSES,
  type ContentItemDTO,
  type ContentVariantDTO,
  type ContentPlatform,
  type ContentStatus,
} from "@/types";

interface MultiPlatformEditorProps {
  item: ContentItemDTO;
  onUpdate: () => void;
  onClose?: () => void;
}

const TWITTER_MAX = 280;
const LINKEDIN_MAX = 3000;

function calculateCharLength(text: string): number {
  if (!text) return 0;
  // Weight URLs as 23 chars for Twitter approximation
  const normalized = text.replace(/https?:\/\/[^\s]+/g, "x".repeat(23));
  return Array.from(normalized).length;
}

export function MultiPlatformEditor({
  item,
  onUpdate,
  onClose,
}: MultiPlatformEditorProps) {
  // Available platforms: items in targetChannels or default platforms
  const activePlatforms = React.useMemo(() => {
    const list = item.targetChannels.length > 0
      ? item.targetChannels
      : (["twitter", "linkedin", "blog"] as ContentPlatform[]);
    return Array.from(new Set(list));
  }, [item.targetChannels]);

  const [currentPlatform, setCurrentPlatform] = React.useState<ContentPlatform>(
    activePlatforms[0] || "twitter"
  );

  // Variant editing state for current platform
  const [currentBody, setCurrentBody] = React.useState("");
  const [threadItems, setThreadItems] = React.useState<string[]>([]);
  const [isThreadMode, setIsThreadMode] = React.useState(false);
  const [threadNumbering, setThreadNumbering] = React.useState(true);
  const [blogSlug, setBlogSlug] = React.useState("");
  const [metaDescription, setMetaDescription] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  // Workflow transition state
  const [targetStatus, setTargetStatus] = React.useState<ContentStatus>(item.status);
  const [scheduledAtInput, setScheduledAtInput] = React.useState(
    item.scheduledAt
      ? new Date(item.scheduledAt).toISOString().slice(0, 16)
      : ""
  );
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  // Load existing variant when platform or item changes
  React.useEffect(() => {
    const variant = item.variants?.find((v) => v.platform === currentPlatform);
    if (variant) {
      setCurrentBody(variant.body || "");
      setThreadItems(variant.threadItems || []);
      setIsThreadMode(
        (variant.threadItems && variant.threadItems.length > 1) ||
          item.contentType === "thread"
      );
      setThreadNumbering(variant.customSettings?.threadNumbering ?? true);
      setBlogSlug(variant.customSettings?.slug || "");
      setMetaDescription(variant.customSettings?.metaDescription || "");
    } else {
      setCurrentBody("");
      setThreadItems([]);
      setIsThreadMode(item.contentType === "thread");
      setThreadNumbering(true);
      setBlogSlug(
        currentPlatform === "blog"
          ? item.title.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-")
          : ""
      );
      setMetaDescription("");
    }
  }, [currentPlatform, item]);

  // Twitter live character counting
  const singleTweetCount = calculateCharLength(currentBody);
  const isSingleTweetOverLimit = singleTweetCount > TWITTER_MAX;

  // Twitter thread counting
  const threadCounts = threadItems.map((tweet) => calculateCharLength(tweet));
  const isThreadOverLimit = threadCounts.some((count) => count > TWITTER_MAX);

  // LinkedIn live character counting
  const linkedInCount = Array.from(currentBody).length;
  const isLinkedInOverLimit = linkedInCount > LINKEDIN_MAX;

  // Blog word count and reading time
  const blogWords = currentBody.trim() ? currentBody.trim().split(/\s+/).length : 0;
  const blogReadingTime = Math.max(1, Math.ceil(blogWords / 200));

  // Auto-split text into thread helper
  const handleSplitIntoThread = () => {
    if (!currentBody.trim()) return;
    const words = currentBody.trim().split(/\s+/);
    const chunks: string[] = [];
    let cur = "";

    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (calculateCharLength(cand) <= 265) {
        cur = cand;
      } else {
        if (cur) chunks.push(cur);
        cur = w;
      }
    }
    if (cur) chunks.push(cur);

    setIsThreadMode(true);
    setThreadItems(chunks);
    toast.success(`Split text into ${chunks.length} tweets.`);
  };

  const handleSaveVariant = async () => {
    // Validate limits
    if (currentPlatform === "twitter") {
      if (isThreadMode && isThreadOverLimit) {
        toast.error("One or more tweets exceed the 280-character limit.");
        return;
      }
      if (!isThreadMode && isSingleTweetOverLimit) {
        toast.error("Tweet exceeds the 280-character limit.");
        return;
      }
    }

    if (currentPlatform === "linkedin" && isLinkedInOverLimit) {
      toast.error("LinkedIn post exceeds the 3,000-character limit.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        platform: currentPlatform,
        title: item.title,
        body: isThreadMode && threadItems.length > 0 ? threadItems[0] : currentBody,
        threadItems: isThreadMode ? threadItems : [],
        status: "ready",
        customSettings: {
          slug: blogSlug || undefined,
          metaDescription: metaDescription || undefined,
          threadNumbering,
        },
      };

      const res = await fetch(`/api/content/${item.id}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save variant");
      }

      toast.success(`${currentPlatform.toUpperCase()} variant saved!`);
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusTransition = async (newStatus: ContentStatus) => {
    setIsTransitioning(true);
    try {
      const payload: any = {
        targetStatus: newStatus,
      };

      if (newStatus === "scheduled") {
        if (!scheduledAtInput) {
          toast.error("Please pick a scheduled date and time.");
          setIsTransitioning(false);
          return;
        }
        payload.scheduledAt = new Date(scheduledAtInput).toISOString();
      }

      const res = await fetch(`/api/content/${item.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Status transition failed");
      }

      toast.success(`Content moved to ${newStatus.replace("_", " ")}`);
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setIsTransitioning(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden" data-testid="multi-platform-editor">
      {/* Editor Header / Breadcrumbs */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className="font-semibold uppercase tracking-wider">
              {item.contentType}
            </span>
            <span>•</span>
            <span className="capitalize">{item.status.replace("_", " ")}</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {item.title}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>
              Done
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSaveVariant}
            disabled={isSaving}
            className="gap-1.5"
            data-testid="save-variant-button"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? "Saving..." : "Save Variant"}</span>
          </Button>
        </div>
      </div>

      {/* Platform Navigation Tabs */}
      <div className="flex border-b border-border bg-muted/20 px-6 gap-2">
        {activePlatforms.map((platform) => {
          const isActive = currentPlatform === platform;
          const variantExists = item.variants?.some((v) => v.platform === platform);
          return (
            <button
              key={platform}
              type="button"
              onClick={() => setCurrentPlatform(platform)}
              className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${platform}`}
            >
              <span className="capitalize">{platform}</span>
              {variantExists && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Draft saved" />
              )}
            </button>
          );
        })}
      </div>

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* =========================================================================
            TWITTER / X TAB
        ========================================================================= */}
        {currentPlatform === "twitter" && (
          <div className="space-y-4" data-testid="twitter-editor">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant={isThreadMode ? "outline" : "default"}
                  size="sm"
                  onClick={() => setIsThreadMode(false)}
                >
                  Single Tweet
                </Button>
                <Button
                  variant={isThreadMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setIsThreadMode(true);
                    if (threadItems.length === 0 && currentBody) {
                      setThreadItems([currentBody]);
                    }
                  }}
                >
                  Thread Mode
                </Button>
              </div>

              {!isThreadMode && currentBody.length > 280 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSplitIntoThread}
                  className="gap-1.5 text-xs"
                >
                  <Scissors className="h-3.5 w-3.5" />
                  <span>Split into Thread</span>
                </Button>
              )}
            </div>

            {/* Single Tweet Mode */}
            {!isThreadMode ? (
              <div className="space-y-2">
                <Textarea
                  value={currentBody}
                  onChange={(e) => setCurrentBody(e.target.value)}
                  placeholder="What's happening? (Draft your tweet here...)"
                  rows={6}
                  className="text-base leading-relaxed"
                  data-testid="tweet-body-input"
                />
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">URLs count as 23 characters</span>
                  <span
                    className={`font-semibold ${
                      singleTweetCount > TWITTER_MAX
                        ? "text-rose-500 font-bold"
                        : singleTweetCount > 260
                        ? "text-amber-500"
                        : "text-muted-foreground"
                    }`}
                    data-testid="tweet-char-count"
                  >
                    {singleTweetCount} / {TWITTER_MAX}
                  </span>
                </div>
              </div>
            ) : (
              /* Multi-Tweet Thread Mode */
              <div className="space-y-4" data-testid="thread-items-container">
                <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/50 pb-2">
                  <span>Thread: {threadItems.length} tweets</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={threadNumbering}
                      onChange={(e) => setThreadNumbering(e.target.checked)}
                      className="rounded border-input text-primary"
                    />
                    <span>Auto-number (1/N)</span>
                  </label>
                </div>

                {threadItems.map((tweet, idx) => {
                  const count = calculateCharLength(tweet);
                  const isOver = count > TWITTER_MAX;
                  return (
                    <div
                      key={idx}
                      className="relative p-3 rounded-lg border border-border bg-background space-y-2"
                      data-testid={`thread-card-${idx}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground">
                          Tweet {idx + 1}
                          {threadNumbering ? ` of ${threadItems.length}` : ""}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-semibold ${
                              isOver
                                ? "text-rose-500 font-bold"
                                : count > 260
                                ? "text-amber-500"
                                : "text-muted-foreground"
                            }`}
                          >
                            {count} / {TWITTER_MAX}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              setThreadItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            aria-label={`Remove tweet ${idx + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <Textarea
                        value={tweet}
                        onChange={(e) => {
                          const updated = [...threadItems];
                          updated[idx] = e.target.value;
                          setThreadItems(updated);
                        }}
                        placeholder={`Draft tweet #${idx + 1}...`}
                        rows={3}
                        className="text-sm"
                      />
                    </div>
                  );
                })}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setThreadItems((prev) => [...prev, ""])}
                  className="w-full gap-1.5 border-dashed"
                  data-testid="add-tweet-button"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Tweet to Thread</span>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            LINKEDIN TAB
        ========================================================================= */}
        {currentPlatform === "linkedin" && (
          <div className="space-y-4" data-testid="linkedin-editor">
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Write your LinkedIn update. Use paragraph spacing and clear takeaways.</span>
              <span
                className={`font-semibold ${
                  linkedInCount > LINKEDIN_MAX
                    ? "text-rose-500 font-bold"
                    : "text-muted-foreground"
                }`}
                data-testid="linkedin-char-count"
              >
                {linkedInCount.toLocaleString()} / {LINKEDIN_MAX.toLocaleString()}
              </span>
            </div>

            <Textarea
              value={currentBody}
              onChange={(e) => setCurrentBody(e.target.value)}
              placeholder="What do you want to talk about? (LinkedIn article/post draft...)"
              rows={12}
              className="text-sm leading-relaxed"
              data-testid="linkedin-body-input"
            />

            {/* Hashtag suggestions */}
            <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-2">
              <div className="flex items-center gap-1 font-semibold text-muted-foreground">
                <Hash className="h-3.5 w-3.5" />
                <span>Suggested Hashtags from Topic:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setCurrentBody((prev) => `${prev.trim()}\n\n#${tag}`)
                    }
                    className="px-2 py-0.5 rounded bg-background border text-primary hover:bg-accent text-xs font-mono"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            BLOG TAB
        ========================================================================= */}
        {currentPlatform === "blog" && (
          <div className="space-y-4" data-testid="blog-editor">
            {/* Slug & Meta Description */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-muted/30 rounded-lg border border-border">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  URL Slug Preview
                </label>
                <div className="flex items-center text-xs font-mono text-muted-foreground bg-background px-2.5 py-1.5 rounded-md border border-input">
                  <span>/blog/</span>
                  <input
                    value={blogSlug}
                    onChange={(e) => setBlogSlug(e.target.value)}
                    placeholder="my-post-slug"
                    className="bg-transparent text-foreground flex-1 focus:outline-none"
                    data-testid="blog-slug-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Reading Estimate
                </label>
                <div className="flex items-center gap-3 text-xs text-muted-foreground py-1.5">
                  <span className="font-semibold text-foreground">{blogWords} words</span>
                  <span>•</span>
                  <span>~{blogReadingTime} min read</span>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  SEO Meta Description
                </label>
                <Input
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder="Summary of article for search engine results..."
                  className="text-xs"
                />
              </div>
            </div>

            {/* Split Editor: Markdown Textarea + Live Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wider">Markdown Input</span>
                  <span>Supports headings, lists, code, quotes</span>
                </div>
                <Textarea
                  value={currentBody}
                  onChange={(e) => setCurrentBody(e.target.value)}
                  placeholder="# Enter Markdown Article Content Here..."
                  rows={16}
                  className="font-mono text-xs leading-relaxed"
                  data-testid="blog-markdown-input"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" />
                  <span className="font-semibold uppercase tracking-wider">Live Preview</span>
                </div>
                <div
                  className="p-4 rounded-lg border border-border bg-background min-h-[350px] max-h-[480px] overflow-y-auto"
                  data-testid="blog-markdown-preview"
                >
                  <MarkdownRenderer content={currentBody || "*Preview will appear here as you type...*"} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            GENERIC PLATFORM TAB (Newsletter, YouTube, Instagram, etc.)
        ========================================================================= */}
        {!["twitter", "linkedin", "blog"].includes(currentPlatform) && (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Author custom copy for {currentPlatform}.
            </div>
            <Textarea
              value={currentBody}
              onChange={(e) => setCurrentBody(e.target.value)}
              placeholder={`Draft your content for ${currentPlatform}...`}
              rows={10}
              className="text-sm"
            />
          </div>
        )}
      </div>

      {/* Workflow Status Action Bar */}
      <div className="p-4 border-t border-border bg-muted/40 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Current Status:
          </span>
          <span className="text-xs font-bold uppercase text-primary bg-primary/10 px-2.5 py-1 rounded">
            {item.status.replace("_", " ")}
          </span>
        </div>

        {/* Pipeline Progression Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {item.status === "idea" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStatusTransition("draft")}
              disabled={isTransitioning}
              className="gap-1 text-xs"
              data-testid="transition-draft-button"
            >
              <span>Move to Draft</span>
              <ArrowRight className="h-3 w-3" />
            </Button>
          )}

          {item.status === "draft" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStatusTransition("in_review")}
                disabled={isTransitioning}
                className="gap-1 text-xs"
                data-testid="transition-review-button"
              >
                <span>Ready for Review</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </>
          )}

          {["draft", "in_review"].includes(item.status) && (
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={scheduledAtInput}
                onChange={(e) => setScheduledAtInput(e.target.value)}
                className="h-8 rounded border border-input bg-background px-2 text-xs"
                data-testid="schedule-datetime-input"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStatusTransition("scheduled")}
                disabled={isTransitioning}
                className="gap-1 text-xs text-purple-600 dark:text-purple-400"
                data-testid="transition-schedule-button"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Schedule</span>
              </Button>
            </div>
          )}

          {["scheduled", "in_review", "draft"].includes(item.status) && (
            <Button
              size="sm"
              onClick={() => handleStatusTransition("published")}
              disabled={isTransitioning}
              className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="transition-publish-button"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Mark Published</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
