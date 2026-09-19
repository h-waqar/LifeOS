"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { HabitDTO } from "@/types";
import { AlertTriangle } from "lucide-react";

interface HabitDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  habit: HabitDTO | null;
  onConfirm: () => Promise<void>;
  isDeleting?: boolean;
}

export function HabitDeleteModal({
  isOpen,
  onClose,
  habit,
  onConfirm,
  isDeleting = false,
}: HabitDeleteModalProps) {
  if (!habit) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Habit"
      description="This action cannot be undone"
    >
      <div className="space-y-4 pt-2" data-testid="habit-delete-modal">
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">
              Are you sure you want to delete &ldquo;{habit.title}&rdquo;?
            </p>
            <p className="text-xs text-muted-foreground">
              All history and check-in entries for this habit will be permanently deleted.
              If you wish to keep history, consider archiving the habit instead.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
            data-testid="cancel-delete-habit"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            loading={isDeleting}
            data-testid="confirm-delete-habit"
          >
            Delete Habit
          </Button>
        </div>
      </div>
    </Modal>
  );
}
