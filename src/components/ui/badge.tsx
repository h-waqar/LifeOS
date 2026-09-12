import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
        success:
          "border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        warning:
          "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
        info: "border-transparent bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
        purple:
          "border-transparent bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <Badge variant="success">Completed</Badge>;
    case "in_progress":
    case "active":
      return <Badge variant="info">Active</Badge>;
    case "planning":
    case "todo":
      return <Badge variant="secondary">{status === "todo" ? "To Do" : "Planning"}</Badge>;
    case "blocked":
    case "paused":
      return <Badge variant="warning">{status === "blocked" ? "Blocked" : "Paused"}</Badge>;
    case "cancelled":
    case "archived":
      return <Badge variant="outline">{status === "cancelled" ? "Cancelled" : "Archived"}</Badge>;
    case "inbox":
      return <Badge variant="purple">Inbox</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function PriorityBadge({ priority }: { priority: string }) {
  switch (priority) {
    case "critical":
      return <Badge variant="destructive">Critical</Badge>;
    case "high":
      return <Badge variant="warning">High</Badge>;
    case "medium":
      return <Badge variant="info">Medium</Badge>;
    case "low":
      return <Badge variant="secondary">Low</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
}
