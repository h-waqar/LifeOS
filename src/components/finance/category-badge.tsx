import * as React from "react";
import { cn } from "@/lib/utils";
import * as Icons from "lucide-react";

interface CategoryBadgeProps {
  name: string;
  icon?: string | null;
  color?: string | null;
  className?: string;
}

export function CategoryBadge({
  name,
  icon,
  color,
  className,
}: CategoryBadgeProps) {
  // Dynamically resolve icon from lucide-react or fallback
  const IconComponent = icon && (Icons as any)[icon] ? (Icons as any)[icon] : Icons.Tag;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
        className
      )}
      style={{
        backgroundColor: color ? `${color}15` : undefined,
        borderColor: color ? `${color}40` : undefined,
        color: color ?? "inherit",
      }}
    >
      <IconComponent className="h-3 w-3 shrink-0" />
      <span>{name}</span>
    </span>
  );
}
