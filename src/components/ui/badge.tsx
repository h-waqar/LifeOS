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

export function EnergyBadge({ energy }: { energy: string | null | undefined }) {
  if (!energy) return null;
  switch (energy.toLowerCase()) {
    case "high":
      return (
        <Badge
          variant="destructive"
          className="bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30"
        >
          ⚡ High Energy
        </Badge>
      );
    case "medium":
      return (
        <Badge
          variant="info"
          className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
        >
          ⚡ Medium Energy
        </Badge>
      );
    case "low":
      return (
        <Badge
          variant="secondary"
          className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
        >
          ☕ Low Energy
        </Badge>
      );
    default:
      return <Badge variant="outline">{energy}</Badge>;
  }
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === undefined || score === null) return null;
  const num = Math.round(score);

  if (num >= 150) {
    return (
      <Badge
        variant="destructive"
        className="font-mono font-bold tracking-tight shadow-sm"
        title="Priority Score (Critical)"
      >
        {num}
      </Badge>
    );
  }
  if (num >= 100) {
    return (
      <Badge
        variant="warning"
        className="font-mono font-bold tracking-tight"
        title="Priority Score (High)"
      >
        {num}
      </Badge>
    );
  }
  if (num >= 50) {
    return (
      <Badge
        variant="info"
        className="font-mono font-medium tracking-tight"
        title="Priority Score (Medium)"
      >
        {num}
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="font-mono text-muted-foreground tracking-tight"
      title="Priority Score (Low)"
    >
      {num}
    </Badge>
  );
}

export function AreaBadge({ area }: { area: string | null | undefined }) {
  if (!area) return null;
  switch (area) {
    case "health":
      return (
        <Badge variant="success" className="capitalize">
          Health
        </Badge>
      );
    case "career":
      return (
        <Badge variant="info" className="capitalize">
          Career
        </Badge>
      );
    case "finance":
      return (
        <Badge variant="warning" className="capitalize">
          Finance
        </Badge>
      );
    case "personal_development":
      return (
        <Badge variant="purple" className="capitalize">
          Personal Dev
        </Badge>
      );
    case "relationships":
      return (
        <Badge
          variant="secondary"
          className="bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30 capitalize"
        >
          Relationships
        </Badge>
      );
    default: {
      const formatted = area.replace("_", " ");
      return (
        <Badge variant="secondary">
          {formatted.charAt(0).toUpperCase() + formatted.slice(1)}
        </Badge>
      );
    }
  }
}

export function HorizonBadge({ horizon }: { horizon: string | null | undefined }) {
  if (!horizon) return null;
  switch (horizon) {
    case "long_term":
      return <Badge variant="purple">Long-term (1-5y)</Badge>;
    case "medium_term":
      return <Badge variant="info">Medium-term (Annual/Qtr)</Badge>;
    case "short_term":
      return <Badge variant="secondary">Short-term (Monthly)</Badge>;
    default:
      return <Badge variant="secondary">{horizon}</Badge>;
  }
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function FrequencyBadge({
  frequency,
  frequencyTarget,
  frequencyDays,
  intervalDays,
}: {
  frequency: string | null | undefined;
  frequencyTarget?: number;
  frequencyDays?: number[];
  intervalDays?: number;
}) {
  if (!frequency) return null;
  switch (frequency) {
    case "daily":
      return <Badge variant="info">Daily</Badge>;
    case "weekdays":
      return <Badge variant="purple">Weekdays</Badge>;
    case "weekly":
      return (
        <Badge variant="secondary">
          {frequencyTarget && frequencyTarget > 1
            ? `${frequencyTarget}x / week`
            : "Weekly"}
        </Badge>
      );
    case "specific_days": {
      if (frequencyDays && frequencyDays.length > 0) {
        const days = frequencyDays
          .slice()
          .sort((a, b) => a - b)
          .map((d) => DAY_NAMES[d === 7 ? 0 : d])
          .join(", ");
        return <Badge variant="secondary">{days || "Specific Days"}</Badge>;
      }
      return <Badge variant="secondary">Specific Days</Badge>;
    }
    case "custom":
      return (
        <Badge variant="secondary">
          Every {intervalDays && intervalDays > 1 ? `${intervalDays}d` : "day"}
        </Badge>
      );
    default:
      return <Badge variant="secondary">{frequency}</Badge>;
  }
}

export function TimeOfDayBadge({
  timeOfDay,
}: {
  timeOfDay: string | null | undefined;
}) {
  if (!timeOfDay) return null;
  switch (timeOfDay) {
    case "morning":
      return (
        <Badge
          variant="warning"
          className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1"
        >
          <span>🌅</span> Morning
        </Badge>
      );
    case "afternoon":
      return (
        <Badge
          variant="info"
          className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 gap-1"
        >
          <span>☀️</span> Afternoon
        </Badge>
      );
    case "evening":
      return (
        <Badge
          variant="purple"
          className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 gap-1"
        >
          <span>🌙</span> Evening
        </Badge>
      );
    case "anytime":
      return (
        <Badge variant="secondary" className="gap-1">
          <span>⏰</span> Anytime
        </Badge>
      );
    default:
      return <Badge variant="secondary">{timeOfDay}</Badge>;
  }
}

export function CommitmentBadge({
  level,
  commitment,
}: {
  level?: "soft" | "hard" | string | null | undefined;
  commitment?: "soft" | "hard" | string | null | undefined;
}) {
  const val = commitment ?? level;
  if (!val) return null;
  if (val === "hard") {
    return (
      <Badge
        variant="destructive"
        className="gap-1 bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
        title="Hard commitment (fixed commitment, cannot overlap other hard commitments)"
      >
        <span>🔒</span> Hard
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="gap-1 text-muted-foreground"
      title="Soft commitment (flexible focus block)"
    >
      <span>⏳</span> Soft
    </Badge>
  );
}

export function ConflictBadge({
  hasHardConflict,
  hasConflict,
}: {
  hasHardConflict?: boolean;
  hasConflict?: boolean;
}) {
  if (hasHardConflict) {
    return (
      <Badge
        variant="destructive"
        className="gap-1 animate-pulse"
        title="Hard commitment scheduling collision"
        data-testid="badge-hard-conflict"
      >
        <span>⚠️</span> Collision
      </Badge>
    );
  }
  if (hasConflict) {
    return (
      <Badge
        variant="warning"
        className="gap-1"
        title="Scheduling overlap conflict"
        data-testid="badge-soft-conflict"
      >
        <span>⚠️</span> Overlap
      </Badge>
    );
  }
  return null;
}



