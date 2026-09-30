"use client";

import * as React from "react";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssistantChat } from "./assistant-chat";
import { cn } from "@/lib/utils";

interface AssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  className?: string;
}

export function AssistantDrawer({
  open,
  onClose,
  className,
}: AssistantDrawerProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        className={cn(
          "relative z-50 h-full w-full sm:w-[500px] bg-background border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-200",
          className
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/40">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Assistant Drawer
            </h3>
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono font-medium">
              ⌘J
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
            aria-label="Close Assistant Drawer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 p-2 overflow-hidden">
          <AssistantChat className="h-full border-none shadow-none" />
        </div>
      </div>
    </div>
  );
}
