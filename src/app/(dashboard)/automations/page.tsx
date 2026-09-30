import { Suspense } from "react";
import { AutomationsDashboard } from "@/components/automations/automations-dashboard";
import { Loader2 } from "lucide-react";

export const metadata = {
  title: "Automations — LifeOS",
  description: "Manage your automation rules and workflows",
};

export default function AutomationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <AutomationsDashboard />
    </Suspense>
  );
}
