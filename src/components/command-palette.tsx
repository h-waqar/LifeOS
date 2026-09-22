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
  FileText,
  Users,
  Loader2,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { signOut } from "@/lib/auth-client";
import { toast } from "sonner";
import type { SearchResultItem, SearchEntityType } from "@/types";

interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenQuickCapture?: () => void;
}

function getEntityIcon(type: SearchEntityType) {
  switch (type) {
    case "note":
      return <FileText className="mr-2 h-4 w-4 text-blue-500 shrink-0" />;
    case "task":
      return <CheckSquare className="mr-2 h-4 w-4 text-emerald-500 shrink-0" />;
    case "project":
      return <FolderKanban className="mr-2 h-4 w-4 text-purple-500 shrink-0" />;
    case "goal":
      return <Target className="mr-2 h-4 w-4 text-amber-500 shrink-0" />;
    case "person":
      return <Users className="mr-2 h-4 w-4 text-cyan-500 shrink-0" />;
    default:
      return <Search className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

export function CommandPalette({
  open: controlledOpen,
  onOpenChange,
  onOpenQuickCapture,
}: CommandPaletteProps = {}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);

  const router = useRouter();
  const { resolvedTheme, toggleTheme } = useTheme();

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setSearchQuery("");
        setSearchResults([]);
        setIsSearching(false);
        setSearchError(null);
      }
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

  // Debounced cross-domain search fetch
  React.useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    let isMounted = true;
    setIsSearching(true);
    setSearchError(null);

    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&limit=25`
        );
        if (!res.ok) {
          throw new Error("Search request failed");
        }
        const json = await res.json();
        if (isMounted) {
          setSearchResults(json.data?.results || []);
        }
      } catch {
        if (isMounted) {
          setSearchError("Failed to fetch search results");
          setSearchResults([]);
        }
      } finally {
        if (isMounted) {
          setIsSearching(false);
        }
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  const runCommand = React.useCallback(
    (command: () => void) => {
      setOpen(false);
      command();
    },
    [setOpen]
  );

  const groupedResults = React.useMemo(() => {
    const groups: Record<SearchEntityType, SearchResultItem[]> = {
      note: [],
      task: [],
      project: [],
      goal: [],
      person: [],
    };
    for (const item of searchResults) {
      if (groups[item.type]) {
        groups[item.type].push(item);
      }
    }
    return groups;
  }, [searchResults]);

  if (!isOpen) return null;

  const renderSearchResultItem = (item: SearchResultItem) => (
    <Command.Item
      key={`${item.type}-${item.id}`}
      value={`${searchQuery} ${item.title} ${item.subtitle || ""} ${item.snippet || ""} ${item.type}`}
      onSelect={() => runCommand(() => router.push(item.href))}
      className="relative flex cursor-pointer select-none items-center justify-between rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
      data-testid={`search-result-${item.type}-${item.id}`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
        {getEntityIcon(item.type)}
        <div className="flex flex-col min-w-0">
          <span className="font-medium text-foreground truncate">{item.title}</span>
          {(item.snippet || item.subtitle) && (
            <span className="text-xs text-muted-foreground truncate">
              {item.snippet || item.subtitle}
            </span>
          )}
        </div>
      </div>
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
        {item.type}
      </span>
    </Command.Item>
  );

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
            {isSearching ? (
              <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin text-primary" />
            ) : (
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            )}
            <Command.Input
              autoFocus
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="Type a command or search..."
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="command-palette-input"
            />
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              {searchQuery.trim()
                ? `No results found for "${searchQuery.trim()}".`
                : "No results found."}
            </Command.Empty>

            {isSearching && (
              <div
                className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"
                data-testid="command-palette-loading"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Searching across notes, tasks, projects, goals & people...</span>
              </div>
            )}

            {searchError && (
              <div
                className="px-3 py-2 text-xs text-destructive"
                data-testid="command-palette-error"
              >
                {searchError}
              </div>
            )}

            {/* Dynamic Search Results Section */}
            {groupedResults.note.length > 0 && (
              <Command.Group
                heading={`Notes (${groupedResults.note.length})`}
                className="px-2 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold"
              >
                {groupedResults.note.map(renderSearchResultItem)}
              </Command.Group>
            )}

            {groupedResults.task.length > 0 && (
              <Command.Group
                heading={`Tasks (${groupedResults.task.length})`}
                className="px-2 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold"
              >
                {groupedResults.task.map(renderSearchResultItem)}
              </Command.Group>
            )}

            {groupedResults.project.length > 0 && (
              <Command.Group
                heading={`Projects (${groupedResults.project.length})`}
                className="px-2 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold"
              >
                {groupedResults.project.map(renderSearchResultItem)}
              </Command.Group>
            )}

            {groupedResults.goal.length > 0 && (
              <Command.Group
                heading={`Goals (${groupedResults.goal.length})`}
                className="px-2 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold"
              >
                {groupedResults.goal.map(renderSearchResultItem)}
              </Command.Group>
            )}

            {groupedResults.person.length > 0 && (
              <Command.Group
                heading={`People (${groupedResults.person.length})`}
                className="px-2 py-1.5 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold"
              >
                {groupedResults.person.map(renderSearchResultItem)}
              </Command.Group>
            )}

            {/* Existing Static Command Groups */}
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
              <Command.Item
                onSelect={() => runCommand(() => router.push("/notes"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-notes"
              >
                <FileText className="mr-2 h-4 w-4" />
                <span>Go to Notes</span>
              </Command.Item>
              <Command.Item
                onSelect={() => runCommand(() => router.push("/people"))}
                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                data-testid="cmd-people"
              >
                <Users className="mr-2 h-4 w-4" />
                <span>Go to People</span>
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
