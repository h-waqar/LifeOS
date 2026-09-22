"use client";

import * as React from "react";
import { TrendingUp, BarChart2, History, Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { ContentPublicationDTO, ContentMetricDTO } from "@/types";

interface MetricsModalProps {
  publication: ContentPublicationDTO | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function MetricsModal({
  publication,
  isOpen,
  onClose,
  onSuccess,
}: MetricsModalProps) {
  const [views, setViews] = React.useState<number>(0);
  const [likes, setLikes] = React.useState<number>(0);
  const [comments, setComments] = React.useState<number>(0);
  const [shares, setShares] = React.useState<number>(0);
  const [saves, setSaves] = React.useState<number>(0);
  const [clicks, setClicks] = React.useState<number>(0);
  const [notes, setNotes] = React.useState("");
  const [history, setHistory] = React.useState<ContentMetricDTO[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (isOpen && publication) {
      setViews(0);
      setLikes(0);
      setComments(0);
      setShares(0);
      setSaves(0);
      setClicks(0);
      setNotes("");

      // Fetch existing metrics history
      setIsLoadingHistory(true);
      fetch(`/api/content/${publication.id}/metrics`)
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .then((json) => {
          const list: ContentMetricDTO[] = json.data || [];
          setHistory(list);
          if (list.length > 0) {
            // Pre-fill latest recorded values
            const latest = list[0];
            setViews(latest.views);
            setLikes(latest.likes);
            setComments(latest.comments);
            setShares(latest.shares);
            setSaves(latest.saves);
            setClicks(latest.clicks);
          }
        })
        .catch((err) => console.error("Failed to load metrics history:", err))
        .finally(() => setIsLoadingHistory(false));
    }
  }, [isOpen, publication]);

  // Real-time deterministic calculation
  const totalEngagements = React.useMemo(() => {
    return (
      Math.max(0, likes) +
      Math.max(0, comments) +
      Math.max(0, shares) +
      Math.max(0, saves) +
      Math.max(0, clicks)
    );
  }, [likes, comments, shares, saves, clicks]);

  const engagementRate = React.useMemo(() => {
    const v = Math.max(0, views);
    if (v === 0) return "0.00";
    const rate = (totalEngagements / v) * 100;
    return rate.toFixed(2);
  }, [views, totalEngagements]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publication) return;

    setIsSubmitting(true);
    try {
      const payload = {
        views: Math.max(0, Number(views) || 0),
        likes: Math.max(0, Number(likes) || 0),
        comments: Math.max(0, Number(comments) || 0),
        shares: Math.max(0, Number(shares) || 0),
        saves: Math.max(0, Number(saves) || 0),
        clicks: Math.max(0, Number(clicks) || 0),
        notes: notes.trim() || null,
      };

      const res = await fetch(`/api/content/${publication.id}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to log metrics");
      }

      toast.success("Performance metrics logged successfully!");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!publication) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Log Performance Metrics"
      description={`Record reach and interaction metrics for ${publication.platform.toUpperCase()}.`}
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2" data-testid="metrics-modal-form">
        {/* Engagement Rate Preview Card */}
        <div className="p-3 bg-muted/40 rounded-lg border border-border flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              <span>Calculated Engagement Rate</span>
            </div>
            <div className="text-xl font-bold text-foreground mt-0.5" data-testid="preview-engagement-rate">
              {engagementRate}%
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>
              <span className="font-semibold text-foreground">{totalEngagements.toLocaleString()}</span> engagements
            </div>
            <div>
              on <span className="font-semibold text-foreground">{(views || 0).toLocaleString()}</span> views
            </div>
          </div>
        </div>

        {/* Numeric Inputs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Views / Impr.
            </label>
            <Input
              type="number"
              min="0"
              value={views}
              onChange={(e) => setViews(parseInt(e.target.value) || 0)}
              className="text-sm font-semibold"
              data-testid="input-metrics-views"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Likes / Reactions
            </label>
            <Input
              type="number"
              min="0"
              value={likes}
              onChange={(e) => setLikes(parseInt(e.target.value) || 0)}
              className="text-sm"
              data-testid="input-metrics-likes"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Comments / Replies
            </label>
            <Input
              type="number"
              min="0"
              value={comments}
              onChange={(e) => setComments(parseInt(e.target.value) || 0)}
              className="text-sm"
              data-testid="input-metrics-comments"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Shares / Reposts
            </label>
            <Input
              type="number"
              min="0"
              value={shares}
              onChange={(e) => setShares(parseInt(e.target.value) || 0)}
              className="text-sm"
              data-testid="input-metrics-shares"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Saves / Bookmarks
            </label>
            <Input
              type="number"
              min="0"
              value={saves}
              onChange={(e) => setSaves(parseInt(e.target.value) || 0)}
              className="text-sm"
              data-testid="input-metrics-saves"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Link Clicks
            </label>
            <Input
              type="number"
              min="0"
              value={clicks}
              onChange={(e) => setClicks(parseInt(e.target.value) || 0)}
              className="text-sm"
              data-testid="input-metrics-clicks"
            />
          </div>
        </div>

        {/* Snapshot Notes */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Snapshot Notes
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. 24-hour snapshot. Post reached trending in tech."
            rows={2}
            className="text-xs"
            data-testid="input-metrics-notes"
          />
        </div>

        {/* Historical Snapshots Section */}
        {history.length > 0 && (
          <div className="pt-2 border-t border-border space-y-2">
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <History className="h-3.5 w-3.5" />
              <span>Previous Snapshots ({history.length})</span>
            </div>
            <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1 text-xs">
              {history.map((snap) => (
                <div
                  key={snap.id}
                  className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/50 text-[11px]"
                >
                  <span className="text-muted-foreground font-mono">
                    {new Date(snap.recordedAt).toLocaleDateString()}
                  </span>
                  <span>
                    <strong>{snap.views.toLocaleString()}</strong> views •{" "}
                    <strong>{snap.likes.toLocaleString()}</strong> likes •{" "}
                    <span className="text-primary font-semibold">{Number(snap.engagementRate).toFixed(2)}%</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting}
            className="gap-1.5"
            data-testid="submit-metrics-button"
          >
            <BarChart2 className="h-4 w-4" />
            <span>{isSubmitting ? "Saving..." : "Save Metrics"}</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
}
