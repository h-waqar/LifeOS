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
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { signOut } from "@/lib/auth-client";
import { toast } from "sonner";

interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CommandPalette({
  open: controlledOpen,
  onOpenChange,
}: CommandPaletteProps = {}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const router = useRouter();
  const { resolvedTheme, toggleTheme } = useTheme();

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

  // Global Ctrl+K / Cmd+K listener
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!isOpen);
      }
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setOpen(false);
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
        className="relative z-50 w-full max-w-lg overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        data-testid="command-palette-dialog"
      >
        <Command
          className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-card text-card-foreground"
          label="Command Menu"
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              autoFocus
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
            </Command.Group>

            <Command.Group
              heading="Quick Actions"
              className="px-2 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold"
            >
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
