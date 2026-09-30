"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppShell } from "@/components/app-shell";
import { IntegrationsSettingsView } from "@/components/settings/integrations-settings-view";
import { Loader2, Settings } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();

  React.useEffect(() => {
    if (!sessionLoading && !session?.user) {
      router.replace("/login");
    }
  }, [session, sessionLoading, router]);

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6 pb-12">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings & Integrations</h1>
            <p className="text-xs text-muted-foreground">
              Manage third-party connections, activity ingestion, and automated backups.
            </p>
          </div>
        </div>

        <IntegrationsSettingsView />
      </div>
    </AppShell>
  );
}
