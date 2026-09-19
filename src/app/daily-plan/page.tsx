"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { MorningPlanView } from "@/components/daily-plan/morning-plan-view";
import { EveningReviewView } from "@/components/daily-plan/evening-review-view";
import { DailyPlanHistoryView } from "@/components/daily-plan/daily-plan-history-view";
import type { DailyPlanContextDTO } from "@/types";
import {
  Sun,
  Moon,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Loader2,
  CalendarCheck,
} from "lucide-react";
import { toast } from "sonner";

const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

export default function DailyPlanPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <DailyPlanContent />
    </React.Suspense>
  );
}

function DailyPlanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionLoading } = useSession();

  // Date State: default today's ISO date string
  const todayStr = React.useMemo(() => toIsoDate(new Date()), []);
  const initialDate = searchParams?.get("date") || todayStr;
  const initialMode = (searchParams?.get("mode") as "morning" | "evening" | "history") || "morning";

  const [date, setDate] = React.useState<string>(initialDate);
  const [activeTab, setActiveTab] = React.useState<"morning" | "evening" | "history">(initialMode);
  const [context, setContext] = React.useState<DailyPlanContextDTO | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Synchronize URL parameters when date or tab changes
  const updateUrl = React.useCallback(
    (newDate: string, newTab: "morning" | "evening" | "history") => {
      const params = new URLSearchParams();
      params.set("date", newDate);
      params.set("mode", newTab);
      router.replace(`/daily-plan?${params.toString()}`);
    },
    [router]
  );

  const fetchContext = React.useCallback(async (targetDate: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/daily-plan?date=${targetDate}`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load daily planning data");
      }
      const data = await res.json();
      setContext(data.context);
    } catch (err: any) {
      toast.error(err.message || "Failed to load daily plan");
    } finally {
      setLoading(false);
    }
  }, [router]);

  React.useEffect(() => {
    if (!sessionLoading) {
      if (!session?.user) {
        router.replace("/login");
      } else {
        fetchContext(date);
      }
    }
  }, [session, sessionLoading, router, fetchContext, date]);

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    updateUrl(newDate, activeTab);
  };

  const handlePrevDay = () => {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    handleDateChange(toIsoDate(d));
  };

  const handleNextDay = () => {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    handleDateChange(toIsoDate(d));
  };

  const handleToday = () => {
    handleDateChange(todayStr);
  };

  const handleTabChange = (tab: "morning" | "evening" | "history") => {
    setActiveTab(tab);
    updateUrl(date, tab);
  };

  if (sessionLoading || (!session?.user && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isToday = date === todayStr;
  const formattedHeaderDate = new Date(`${date}T00:00:00.000Z`).toLocaleDateString(
    undefined,
    {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl mx-auto" data-testid="daily-plan-page">
        {/* Page Top Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-6 w-6 text-primary" />
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Daily Planning</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Morning intentions, priority execution, and evening reflection.
            </p>
          </div>

          {/* Date Navigator Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handlePrevDay}
              title="Previous Day"
              aria-label="Previous Day"
              data-testid="date-nav-prev"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Button
              variant={isToday ? "secondary" : "outline"}
              size="sm"
              className="text-xs h-8 font-medium"
              onClick={handleToday}
              data-testid="date-nav-today"
            >
              Today
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handleNextDay}
              title="Next Day"
              aria-label="Next Day"
              data-testid="date-nav-next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <div className="ml-1 text-sm font-semibold tracking-tight text-foreground flex items-center gap-1.5 bg-muted/50 px-3 py-1 rounded-md border">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span>{formattedHeaderDate}</span>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b">
          <button
            onClick={() => handleTabChange("morning")}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === "morning"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-morning-routine"
          >
            <Sun className="h-4 w-4 text-amber-500" />
            <span>Morning Routine</span>
            {context?.plan?.status === "completed" && (
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            )}
          </button>

          <button
            onClick={() => handleTabChange("evening")}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === "evening"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-evening-review"
          >
            <Moon className="h-4 w-4 text-indigo-500" />
            <span>Evening Review</span>
            {context?.review && (
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
            )}
          </button>

          <button
            onClick={() => handleTabChange("history")}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === "history"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-daily-history"
          >
            <BarChart3 className="h-4 w-4 text-primary" />
            <span>History & Trends</span>
          </button>
        </div>

        {/* Tab Content */}
        {loading && !context ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {activeTab === "morning" && context && (
              <MorningPlanView
                date={date}
                context={context}
                onRefresh={() => fetchContext(date)}
                onNavigateToEvening={() => handleTabChange("evening")}
              />
            )}

            {activeTab === "evening" && context && (
              <EveningReviewView
                date={date}
                context={context}
                onRefresh={() => fetchContext(date)}
              />
            )}

            {activeTab === "history" && <DailyPlanHistoryView />}
          </>
        )}
      </div>
    </AppShell>
  );
}
