"use client";

import * as React from "react";
import { Plus, MessageSquare, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { AIConversationDTO } from "@/types";

interface ConversationSidebarProps {
  activeId?: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  className?: string;
}

export function ConversationSidebar({
  activeId,
  onSelect,
  onNewChat,
  className,
}: ConversationSidebarProps) {
  const [conversations, setConversations] = React.useState<AIConversationDTO[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchConversations = React.useCallback(async () => {
    try {
      const res = await fetch("/api/ai/conversations");
      if (res.ok) {
        const body = await res.json();
        setConversations(body.data || []);
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchConversations();
  }, [fetchConversations, activeId]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/ai/conversations/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        toast.success("Conversation deleted");
        if (activeId === id) {
          onNewChat();
        }
      }
    } catch {
      toast.error("Failed to delete conversation");
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full w-64 border-r border-border bg-sidebar/50 p-3",
        className
      )}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Conversations
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onNewChat}
          className="h-7 px-2 text-xs flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        {loading ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center p-6 text-xs text-muted-foreground">
            No previous conversations. Start chatting!
          </div>
        ) : (
          conversations.map((c) => {
            const isActive = c.id === activeId;
            return (
              <div
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-2 truncate">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{c.title || "Untitled Chat"}</span>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleDelete(e, c.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity"
                  title="Delete chat"
                  aria-label="Delete chat"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
