"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Moon,
  Sun,
  LogOut,
  PlusCircle,
  Search,
  Sparkles,
  Target,
  Flame,
  Calendar,
  CalendarCheck,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { signOut } from "@/lib/auth-client";
import { toast } from "sonner";

interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenQuickCapture?: () => void;
}

export function CommandPalette({
  open: controlledOpen,
  onOpenChange,
  onOpenQuickCapture,
}: CommandPaletteProps = {}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const router = useRouter();
  const { resolvedTheme, toggleTheme } = useTheme();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const triggerElementRef = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (isControlled && onOpenChange) {
        onOpenChange(nextOpen);
      } else {
        setInternalOpen(nextOpen);
      }
    },
    [isControlled, onOpenChange]
  );

  // Focus management: autofocus search input on open, lock scroll, and restore focus on close
  React.useEffect(() => {
    if (isOpen) {
      const currentActive =
        typeof document !== "undefined"
          ? (document.activeElement as HTMLElement)
          : null;
      if (
        currentActive &&
        (!contentRef.current || !contentRef.current.contains(currentActive))
      ) {
        triggerElementRef.current = currentActive;
      }
      document.body.style.overflow = "hidden";

      // Explicitly focus search input immediately
      if (inputRef.current) {
        inputRef.current.focus();
      }
      const focusTimer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 0);

      return () => {
        clearTimeout(focusTimer);
        document.body.style.overflow = "unset";
        if (
          triggerElementRef.current &&
          typeof document !== "undefined" &&
          document.contains(triggerElementRef.current) &&
          triggerElementRef.current !== document.body
        ) {
          triggerElementRef.current.focus();
        }
      };
    }
  }, [isOpen]);

  // Focus trap & Escape listener for open palette
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        // Prevent focus from escaping the palette dialog
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (!contentRef.current) return;
      if (e.target instanceof Node && !contentRef.current.contains(e.target)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [isOpen, setOpen]);

  // Global Ctrl+K / Cmd+K listener
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        (e.key === "k" || e.key === "K" || e.code === "KeyK") &&
        (e.metaKey || e.ctrlKey)
      ) {
        e.preventDefault();
        setOpen(!isOpen);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isOpen, setOpen]);

  const runCommand = React.useCallback(
    (command: () => void) => {
      setOpen(false);
      command();
    },
    [setOpen]
  );

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 sm:p-6"
    >
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        ref={contentRef}
        className="relative z-50 w-full max-w-lg overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        data-testid="command-palette-dialog"
      >
        <Command
          className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-card text-card-foreground"
          label="Command Menu"
          loop
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              ref={inputRef}
              placeholder="Type a command or search..."
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="command-palette-input"
            />
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            <Command.Group
              heading="Navigation"
              className="px-2 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold"
            >
              <Command.Item
                onSelect={() => runCommand(() => router.push("/dashboard"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-dashboard"
              >
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Go to Dashboard</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/goals"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-goals"
              >
                <Target className="mr-2 h-4 w-4" />
                <span>Go to Goals</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/projects"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-projects"
              >
                <FolderKanban className="mr-2 h-4 w-4" />
                <span>Go to Projects</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/tasks"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-tasks"
              >
                <CheckSquare className="mr-2 h-4 w-4" />
                <span>Go to Tasks</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/calendar"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-calendar"
              >
                <Calendar className="mr-2 h-4 w-4" />
                <span>Go to Calendar</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/habits"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-habits"
              >
                <Flame className="mr-2 h-4 w-4 text-orange-500" />
                <span>Go to Habits</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/daily-plan"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-daily-plan"
              >
                <CalendarCheck className="mr-2 h-4 w-4 text-primary" />
                <span>Go to Daily Plan</span>
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading="Quick Actions"
              className="px-2 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold"
            >
              <Command.Item
                onSelect={() => runCommand(() => router.push("/daily-plan?mode=morning"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-morning-routine"
              >
                <Sun className="mr-2 h-4 w-4 text-amber-500" />
                <span>Start Morning Routine</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/daily-plan?mode=evening"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-evening-review"
              >
                <Moon className="mr-2 h-4 w-4 text-indigo-500" />
                <span>Start Evening Review</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/calendar?action=new"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-new-time-block"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                <span>Create Time Block</span>
              </Command.Item>
              {onOpenQuickCapture && (
                <Command.Item
                  onSelect={() => runCommand(() => onOpenQuickCapture())}
                  className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                  data-testid="cmd-quick-capture"
                >
                  <Sparkles className="mr-2 h-4 w-4 text-primary" />
                  <div className="flex flex-1 items-center justify-between">
                    <span>Universal Quick Capture</span>
                    <kbd className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      Q
                    </kbd>
                  </div>
                </Command.Item>
              )}
              <Command.Item
                onSelect={() => runCommand(() => router.push("/habits?action=new"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-new-habit"
              >
                <PlusCircle className="mr-2 h-4 w-4 text-orange-500" />
                <span>Create New Habit</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/goals?action=new"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-new-goal"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                <span>Create New Goal</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/tasks?action=new"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-new-task"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                <span>Create New Task</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/projects?action=new"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-new-project"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                <span>Create New Project</span>
              </Command.Item>
              <Command.Item
                onSelect={() =>
                  runCommand(() => {
                    toggleTheme();
                    toast.success(
                      `Theme switched to ${resolvedTheme === "dark" ? "light" : "dark"}`
                    );
                  })
                }
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-toggle-theme"
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="mr-2 h-4 w-4" />
                ) : (
                  <Moon className="mr-2 h-4 w-4" />
                )}
                <span>
                  Toggle Theme ({resolvedTheme === "dark" ? "Light" : "Dark"})
                </span>
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading="Session"
              className="px-2 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold"
            >
              <Command.Item
                onSelect={() =>
                  runCommand(async () => {
                    await signOut();
                    toast.success("Signed out successfully");
                    router.push("/login");
                  })
                }
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm text-destructive outline-none hover:bg-destructive/10 data-[selected=true]:bg-destructive/10"
                data-testid="cmd-sign-out"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign Out</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
