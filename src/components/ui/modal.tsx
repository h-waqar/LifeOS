"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  className,
}: ModalProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const triggerElementRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const descId = React.useId();

  // Save trigger element before opening and restore after closing
  React.useEffect(() => {
    if (isOpen) {
      triggerElementRef.current =
        typeof document !== "undefined"
          ? (document.activeElement as HTMLElement)
          : null;
      document.body.style.overflow = "hidden";

      // Set initial focus inside modal on next tick
      const timer = setTimeout(() => {
        if (!contentRef.current) return;
        const autoFocusEl = contentRef.current.querySelector<HTMLElement>(
          "[autofocus], [data-autofocus]"
        );
        if (autoFocusEl) {
          autoFocusEl.focus();
        } else {
          const firstFocusable =
            contentRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
          if (firstFocusable) {
            firstFocusable.focus();
          } else {
            contentRef.current.focus();
          }
        }
      }, 50);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = "unset";
        if (
          triggerElementRef.current &&
          typeof document !== "undefined" &&
          document.contains(triggerElementRef.current)
        ) {
          triggerElementRef.current.focus();
        }
      };
    }
  }, [isOpen]);

  // Keyboard navigation & focus trap
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        if (!contentRef.current) return;

        const focusable = Array.from(
          contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter(
          (el) =>
            el.offsetParent !== null ||
            el.offsetWidth > 0 ||
            el.offsetHeight > 0 ||
            // Fallback for jsdom / test environments
            (typeof window !== "undefined" && !("offsetParent" in el))
        );

        if (focusable.length === 0) {
          e.preventDefault();
          contentRef.current.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (e.shiftKey) {
          if (active === first || !contentRef.current.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !contentRef.current.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (!contentRef.current) return;
      if (
        e.target instanceof Node &&
        !contentRef.current.contains(e.target)
      ) {
        const focusable =
          contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          contentRef.current.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Content */}
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-50 w-full max-w-lg rounded-xl border bg-card p-6 text-card-foreground shadow-2xl transition-all animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto outline-none",
          className
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>

        {(title || description) && (
          <div className="mb-4 space-y-1">
            {title && (
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p id={descId} className="text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        )}

        <div>{children}</div>
      </div>
    </div>
  );
}
