"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
  Command,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Target,
  Flame,
  Calendar,
  CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { useSession, signOut } from "@/lib/auth-client";
import { CommandPalette } from "@/components/command-palette";
import { QuickCaptureModal } from "@/components/quick-capture-modal";
import { toast } from "sonner";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { data: sessionData, isPending } = useSession();

  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = React.useState(false);

  // Global keydown shortcut for Quick Capture ('Q' or 'C' when not in text input)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (
        (e.key === "q" || e.key === "Q" || e.key === "c" || e.key === "C") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        setQuickCaptureOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close mobile drawer on route change
  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Close mobile drawer on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  const navItems = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      name: "Daily Plan",
      href: "/daily-plan",
      icon: CalendarCheck,
    },
    {
      name: "Goals",
      href: "/goals",
      icon: Target,
    },
    {
      name: "Projects",
      href: "/projects",
      icon: FolderKanban,
    },
    {
      name: "Tasks",
      href: "/tasks",
      icon: CheckSquare,
    },
    {
      name: "Calendar",
      href: "/calendar",
      icon: Calendar,
    },
    {
      name: "Habits",
      href: "/habits",
      icon: Flame,
    },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Signed out successfully");
      router.push("/login");
      router.refresh();
    } catch (err) {
      toast.error("Failed to sign out");
    }
  };

  const user = sessionData?.user;

  return (
    <div className="flex min-h-screen bg-background text-foreground" data-testid="app-shell">
      {/* Global Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onOpenQuickCapture={() => setQuickCaptureOpen(true)}
      />

      {/* Universal Quick Capture Modal */}
      <QuickCaptureModal
        isOpen={quickCaptureOpen}
        onClose={() => setQuickCaptureOpen(false)}
        onTaskCreated={() => {
          router.refresh();
        }}
      />

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r bg-card/60 backdrop-blur transition-all duration-300 z-30",
          sidebarCollapsed ? "w-16" : "w-64"
        )}
        data-testid="sidebar"
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b">
          {!sidebarCollapsed && (
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-bold tracking-tight text-lg"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-extrabold text-sm">
                L
              </div>
              <span>LifeOS</span>
            </Link>
          )}
          {sidebarCollapsed && (
            <Link
              href="/dashboard"
              className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-extrabold text-sm"
              title="LifeOS"
            >
              L
            </Link>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Quick Search & Quick Capture Buttons */}
        <div className="p-3 space-y-1.5">
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border border-input bg-background/50 px-3 py-2 text-xs text-muted-foreground shadow-sm hover:bg-accent hover:text-accent-foreground transition-all",
              sidebarCollapsed && "justify-center px-0"
            )}
            title="Open command palette (Ctrl+K / Cmd+K)"
            data-testid="command-palette-button"
          >
            <Command className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 text-left">Quick search...</span>
                <kbd className="pointer-events-none rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                  ⌘K
                </kbd>
              </>
            )}
          </button>

          <button
            onClick={() => setQuickCaptureOpen(true)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs font-medium text-primary shadow-xs hover:bg-primary/20 transition-all",
              sidebarCollapsed && "justify-center px-0"
            )}
            title="Universal Quick Capture (Q / C)"
            data-testid="quick-capture-button"
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 text-left">Quick Capture</span>
                <kbd className="pointer-events-none rounded border border-primary/30 bg-primary/15 px-1.5 font-mono text-[10px] font-bold text-primary">
                  Q
                </kbd>
              </>
            )}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  sidebarCollapsed && "justify-center px-2"
                )}
                title={sidebarCollapsed ? item.name : undefined}
                data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User & Preferences Footer */}
        <div className="border-t p-3 space-y-2">
          {/* User profile info */}
          {!sidebarCollapsed && user && (
            <div className="px-2 py-1">
              <p className="text-xs font-semibold truncate">{user.name || "LifeOS Owner"}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
            </div>
          )}

          <div
            className={cn(
              "flex items-center gap-1",
              sidebarCollapsed ? "flex-col" : "justify-between"
            )}
          >
            {/* Theme Toggle Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
              aria-label="Toggle theme"
              data-testid="theme-toggle"
              className="h-8 w-8"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            {/* Logout Button */}
            <Button
              variant="ghost"
              size={sidebarCollapsed ? "icon" : "sm"}
              onClick={handleSignOut}
              className={cn(
                "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                !sidebarCollapsed && "gap-2 text-xs"
              )}
              title="Sign Out"
              aria-label="Sign Out"
              data-testid="sign-out-button"
            >
              <LogOut className="h-4 w-4" />
              {!sidebarCollapsed && <span>Sign Out</span>}
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Backdrop and Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-card p-6 shadow-xl flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 font-bold tracking-tight text-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-extrabold text-sm">
                    L
                  </div>
                  <span>LifeOS</span>
                </Link>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setCommandPaletteOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg border border-input bg-background/50 px-3 py-2 text-xs text-muted-foreground shadow-sm"
              >
                <Command className="h-4 w-4" />
                <span>Quick search...</span>
              </button>

              <nav className="space-y-1">
                {navItems.map((item) => {
                  const isActive =
                    pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                      data-testid={`mobile-nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="border-t pt-4 space-y-4">
              {user && (
                <div>
                  <p className="text-xs font-semibold">{user.name || "LifeOS Owner"}</p>
                  <p className="text-[11px] text-muted-foreground">{user.email}</p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleTheme}
                  className="gap-2 text-xs"
                >
                  {resolvedTheme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                  <span>{resolvedTheme === "dark" ? "Light" : "Dark"}</span>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleSignOut}
                  className="gap-2 text-xs"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header Bar */}
        <header className="flex h-16 items-center justify-between border-b px-4 md:hidden bg-card/50 backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-bold tracking-tight">LifeOS</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setQuickCaptureOpen(true)}
              aria-label="Quick capture task"
              title="Universal Quick Capture"
              className="text-primary hover:text-primary hover:bg-primary/10"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="Command palette"
            >
              <Command className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </header>

        {/* Page View Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
