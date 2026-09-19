"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { HabitDTO } from "@/types";
import { Flame, CheckCircle2, TrendingUp, Trophy } from "lucide-react";

interface HabitStatsOverviewProps {
  habits: HabitDTO[];
}

export function HabitStatsOverview({ habits }: HabitStatsOverviewProps) {
  const activeHabits = habits.filter((h) => h.status === "active");
  const totalActive = activeHabits.length;
  const completedToday = activeHabits.filter((h) => h.isCompletedToday).length;
  const todayRate = totalActive > 0 ? Math.round((completedToday / totalActive) * 100) : 0;
  
  const bestStreak = habits.length > 0
    ? Math.max(0, ...habits.map((h) => Math.max(h.longestStreak || 0, h.currentStreak || 0)))
    : 0;

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4" data-testid="habit-stats-overview">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active Habits
          </CardTitle>
          <Flame className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="metric-active-habits">
            {totalActive}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {habits.length} total habits
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Completed Today
          </CardTitle>
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="metric-completed-today">
            {completedToday}
            <span className="text-sm font-normal text-muted-foreground ml-1.5">
              / {totalActive}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {totalActive - completedToday} remaining today
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Today&apos;s Rate
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="metric-today-rate">
            {todayRate}%
          </div>
          <div className="mt-2 w-full bg-secondary rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${todayRate}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Longest Streak
          </CardTitle>
          <Trophy className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="metric-longest-streak">
            {bestStreak}
            <span className="text-sm font-normal text-muted-foreground ml-1">
              days
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Personal all-time record
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
