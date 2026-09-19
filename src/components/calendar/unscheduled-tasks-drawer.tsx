"use client";

import * as React from "react";
import { CheckSquare, Calendar as CalendarIcon, Clock, Plus, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/ui/badge";
import type { TaskDTO } from "@/types";

interface UnscheduledTasksDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskDTO[];
  onScheduleTask: (task: TaskDTO) => void;
}

export function UnscheduledTasksDrawer({
  isOpen,
  onClose,
  tasks,
  onScheduleTask,
}: UnscheduledTasksDrawerProps) {
  if (!isOpen) return null;

  // Filter tasks that are not completed and not cancelled
  const activeUnscheduled = tasks.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled"
  );

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 w-full max-w-sm sm:max-w-md bg-card border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      data-testid="unscheduled-tasks-drawer"
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Unscheduled Tasks Backlog</h3>
            <p className="text-xs text-muted-foreground">
              Click-to-block tasks onto your calendar (CAL-02)
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close drawer">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tasks List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {activeUnscheduled.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <CheckSquare className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm font-medium">No pending tasks to schedule</p>
            <p className="text-xs mt-1">All your active tasks are either completed or scheduled.</p>
          </div>
        ) : (
          activeUnscheduled.map((task) => (
            <div
              key={task.id}
              className="group flex flex-col justify-between p-3 rounded-lg border bg-card hover:border-primary/50 transition-all shadow-sm space-y-2"
              data-testid={`unscheduled-task-item-${task.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium leading-tight">{task.title}</span>
                <PriorityBadge priority={task.priority} />
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                <div className="flex items-center gap-2">
                  {task.estimatedDuration && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {task.estimatedDuration}m
                    </span>
                  )}
                  {task.dueDate && (
                    <span className="flex items-center gap-1 text-destructive">
                      <CalendarIcon className="h-3 w-3" />
                      Due {new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onScheduleTask(task)}
                  className="h-7 text-xs gap-1 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                  data-testid={`schedule-task-btn-${task.id}`}
                >
                  <Plus className="h-3 w-3" />
                  <span>Schedule</span>
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
