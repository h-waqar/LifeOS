"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, LogIn, UserPlus, Sparkles, CheckCircle2, Shield } from "lucide-react";

export default function RootPage() {
  const { data: session, isPending } = useSession();

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-6 bg-background text-foreground"
      data-testid="root-landing"
    >
      <div className="flex flex-col items-center space-y-6 text-center max-w-xl animate-in fade-in duration-500">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-black text-2xl shadow-xl">
          L
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            LifeOS
          </h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            A single source of truth connecting goals, projects, tasks, time, knowledge, money, and relationships.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-md pt-2">
          <div className="flex items-center gap-2 rounded-lg border bg-card p-3 text-xs font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Task Hierarchy</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card p-3 text-xs font-medium">
            <Sparkles className="h-4 w-4 text-blue-500 shrink-0" />
            <span>Unified Graph</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card p-3 text-xs font-medium">
            <Shield className="h-4 w-4 text-purple-500 shrink-0" />
            <span>Single-User Lock</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          {session?.user ? (
            <Link href="/dashboard" data-testid="landing-dashboard-link">
              <Button size="lg" className="gap-2 shadow">
                <LayoutDashboard className="h-4 w-4" />
                <span>Go to Dashboard</span>
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/login" data-testid="landing-login-link">
                <Button size="lg" className="gap-2 shadow">
                  <LogIn className="h-4 w-4" />
                  <span>Sign In</span>
                </Button>
              </Link>
              <Link href="/register" data-testid="landing-register-link">
                <Button size="lg" variant="outline" className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  <span>Register</span>
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
