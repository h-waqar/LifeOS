"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import type { AutomationRunDTO } from "@/types";
import { formatRelativeTime } from "@/lib/utils/time";

interface RunHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  automationId: string;
  automationName: string;
}

const STATUS_VARIANT: Record<string, "success" | "destructive" | "secondary"> = {
  success: "success",
  failed: "destructive",
  skipped: "secondary",
};

export function RunHistoryDrawer({ open, onClose, automationId, automationName }: RunHistoryDrawerProps) {
  const [runs, setRuns] = React.useState<AutomationRunDTO[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedRun, setExpandedRun] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !automationId) return;

    const fetchRuns = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/automations/${automationId}/runs?limit=20`);
        const json = await res.json();
        if (json.error) {
          setError(json.error);
        } else {
          setRuns(json.data || []);
        }
      } catch {
        setError("Failed to fetch run history");
      } finally {
        setLoading(false);
      }
    };

    fetchRuns();
  }, [open, automationId]);

  const toggleExpand = (runId: string) => {
    setExpandedRun((prev) => (prev === runId ? null : runId));
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Execution History"
      description={automationName}
      className="max-w-2xl"
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-destructive text-sm">{error}</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="no-history">
          <Clock className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No execution history yet</p>
          <p className="text-xs mt-1">This automation hasn&apos;t been triggered.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto" data-testid="run-history-list">
          {runs.map((run) => {
            const isExpanded = expandedRun === run.id;
            return (
              <div
                key={run.id}
                className="border rounded-lg overflow-hidden"
                data-testid={`run-${run.id}`}
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(run.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <Badge variant={STATUS_VARIANT[run.status] ?? "secondary"} className="shrink-0">
                    {run.status}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{formatRelativeTime(run.createdAt)}</span>
                      <span className="text-muted-foreground">•</span>
                      <span className="font-mono text-muted-foreground">{run.executionDurationMs}ms</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <ArrowRight className="h-3 w-3" />
                      <span className="truncate">{run.triggerEvent}</span>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t px-3 py-3 space-y-3 bg-muted/20">
                    {run.errorMessage && (
                      <div className="text-xs">
                        <span className="font-medium text-destructive">Error:</span>
                        <pre className="mt-1 text-xs bg-destructive/10 text-destructive p-2 rounded overflow-x-auto whitespace-pre-wrap">
                          {run.errorMessage}
                        </pre>
                      </div>
                    )}

                    {run.contextSnapshot && Object.keys(run.contextSnapshot).length > 0 && (
                      <div className="text-xs">
                        <span className="font-medium text-muted-foreground">Context Snapshot:</span>
                        <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto max-h-32 whitespace-pre-wrap">
                          {JSON.stringify(run.contextSnapshot, null, 2)}
                        </pre>
                      </div>
                    )}

                    {run.actionOutput && Object.keys(run.actionOutput).length > 0 && (
                      <div className="text-xs">
                        <span className="font-medium text-muted-foreground">Action Output:</span>
                        <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto max-h-32 whitespace-pre-wrap">
                          {JSON.stringify(run.actionOutput, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
