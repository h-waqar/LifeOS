"use client";

import * as React from "react";
import { ExternalLink, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { ContentPublicationDTO } from "@/types";

interface MarkPublishedModalProps {
  publication: ContentPublicationDTO | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function MarkPublishedModal({
  publication,
  isOpen,
  onClose,
  onSuccess,
}: MarkPublishedModalProps) {
  const [postUrl, setPostUrl] = React.useState("");
  const [externalPostId, setExternalPostId] = React.useState("");
  const [publishedAt, setPublishedAt] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (isOpen && publication) {
      setPostUrl(publication.postUrl || "");
      setExternalPostId(publication.externalPostId || "");
      setPublishedAt(new Date().toISOString().slice(0, 16));
      setNotes(publication.notes || "");
    }
  }, [isOpen, publication]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publication) return;

    setIsSubmitting(true);
    try {
      const payload = {
        postUrl: postUrl.trim() || null,
        externalPostId: externalPostId.trim() || null,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString(),
        notes: notes.trim() || null,
      };

      const res = await fetch(`/api/content/publications/${publication.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to mark as published");
      }

      toast.success("Publication marked as live!");
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
      title="Mark Content as Published"
      description={`Record the live distribution details for ${publication.platform.toUpperCase()}.`}
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2" data-testid="mark-published-form">
        {/* Live URL */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Live Post URL
          </label>
          <div className="flex gap-2">
            <Input
              type="url"
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              placeholder="https://x.com/username/status/12345678"
              className="flex-1 text-xs font-mono"
              autoFocus
              data-testid="live-post-url-input"
            />
            {postUrl && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => window.open(postUrl, "_blank", "noopener,noreferrer")}
                title="Test link"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* External Post ID */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            External Post / Tweet ID (Optional)
          </label>
          <Input
            value={externalPostId}
            onChange={(e) => setExternalPostId(e.target.value)}
            placeholder="e.g. 18274619472"
            className="text-xs font-mono"
            data-testid="external-post-id-input"
          />
        </div>

        {/* Published At Date & Time */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Publication Time
          </label>
          <Input
            type="datetime-local"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
            className="text-xs"
            data-testid="published-at-input"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Distribution Notes
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Posted during morning peak. Crossposted to newsletter."
            rows={2}
            className="text-xs"
            data-testid="publish-notes-input"
          />
        </div>

        {/* Form Actions */}
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
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="submit-mark-published-button"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>{isSubmitting ? "Saving..." : "Confirm Published"}</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
}
