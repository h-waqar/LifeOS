"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams as useNextSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Search, Activity, Play, AlertCircle, List } from "lucide-react";
import type { AutomationDTO } from "@/types";

import { AutomationCard } from "./automation-card";
import { RuleBuilderModal } from "./rule-builder-modal";
import { RunHistoryDrawer } from "./run-history-drawer";

export function AutomationsDashboard() {
  const searchParams = useNextSearchParams();
  const [automations, setAutomations] = useState<AutomationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTrigger, setFilterTrigger] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Modals
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<AutomationDTO | null>(null);

  // History Drawer
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyAutomation, setHistoryAutomation] = useState<{ id: string; name: string } | null>(null);

  const fetchAutomations = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (filterTrigger !== "all") queryParams.set("triggerType", filterTrigger);
      if (filterStatus !== "all") queryParams.set("isActive", filterStatus === "active" ? "true" : "false");

      const res = await fetch(`/api/automations?${queryParams.toString()}`);
      const json = await res.json();

      if (json.error) {
        setError(json.error);
      } else {
        setAutomations(json.data || []);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch automations";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAutomations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTrigger, filterStatus]);

  // Open builder modal if ?action=new
  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setEditingAutomation(null);
      setIsBuilderOpen(true);
    }
  }, [searchParams]);

  const filteredAutomations = useMemo(() => {
    if (!searchQuery) return automations;
    const lowerQ = searchQuery.toLowerCase();
    return automations.filter(
      (a) => a.name.toLowerCase().includes(lowerQ) || (a.description || "").toLowerCase().includes(lowerQ)
    );
  }, [automations, searchQuery]);

  // Metrics
  const totalRules = automations.length;
  const activeRules = automations.filter((a) => a.isActive).length;
  const totalExecutions = automations.reduce((sum, a) => sum + (a.executionCount || 0), 0);
  const failedRuns = 0; // Placeholder — would need aggregate query on automation_runs

  // Handlers
  const handleToggle = async (id: string, isActive: boolean) => {
    setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, isActive } : a)));

    try {
      const res = await fetch(`/api/automations/${id}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, isActive: !isActive } : a)));
      } else {
        toast.success(`Automation ${isActive ? "enabled" : "disabled"}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to toggle";
      toast.error(message);
      setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, isActive: !isActive } : a)));
    }
  };

  const handleDelete = async (id: string) => {
    const prevList = [...automations];
    setAutomations((prev) => prev.filter((a) => a.id !== id));

    try {
      const res = await fetch(`/api/automations/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        setAutomations(prevList);
      } else {
        toast.success("Automation deleted");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete";
      toast.error(message);
      setAutomations(prevList);
    }
  };

  const handleEdit = (automation: AutomationDTO) => {
    setEditingAutomation(automation);
    setIsBuilderOpen(true);
  };

  const handleCreate = () => {
    setEditingAutomation(null);
    setIsBuilderOpen(true);
  };

  const handleViewHistory = (id: string, name: string) => {
    setHistoryAutomation({ id, name });
    setIsHistoryOpen(true);
  };

  const handleManualTrigger = async (id: string) => {
    try {
      const res = await fetch(`/api/automations/${id}/trigger`, { method: "POST" });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success("Automation triggered successfully");
        fetchAutomations();
      }
    } catch {
      toast.error("Failed to trigger automation");
    }
  };

  const handleSaved = (savedAutomation: AutomationDTO) => {
    setIsBuilderOpen(false);
    if (editingAutomation) {
      setAutomations((prev) => prev.map((a) => (a.id === savedAutomation.id ? savedAutomation : a)));
    } else {
      setAutomations((prev) => [savedAutomation, ...prev]);
    }
  };

  return (
    <div className="flex flex-col gap-6" data-testid="automations-dashboard">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Automations</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your custom rules and background workflows.</p>
        </div>
        <Button onClick={handleCreate} data-testid="new-automation-btn">
          <Plus className="w-4 h-4 mr-2" />
          New Automation
        </Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Rules</CardTitle>
            <List className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRules}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{activeRules}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Executions</CardTitle>
            <Play className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalExecutions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Failed (24h)</CardTitle>
            <AlertCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{failedRuns}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search automations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="automation-search"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterTrigger}
            onChange={(e) => setFilterTrigger(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="filter-trigger"
          >
            <option value="all">All Types</option>
            <option value="event">Event</option>
            <option value="schedule">Schedule</option>
            <option value="threshold">Threshold</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="filter-status"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Automations List */}
      <div className="flex-1">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="h-48 animate-pulse">
                <CardHeader className="pb-3 space-y-2">
                  <div className="h-5 w-2/3 rounded bg-muted" />
                  <div className="h-4 w-full rounded bg-muted" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="h-10 w-full rounded bg-muted" />
                  <div className="h-4 w-1/2 rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="text-center p-8 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 rounded-lg text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : filteredAutomations.length === 0 ? (
          <div className="text-center p-12 border border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground" data-testid="empty-state">
            <Activity className="w-10 h-10 mb-4 opacity-20" />
            <h3 className="text-lg font-medium mb-1">No automations found</h3>
            <p className="text-sm">Create an automation rule to automate your workflows.</p>
            <Button variant="outline" className="mt-4" onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Create your first rule
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAutomations.map((automation) => (
              <AutomationCard
                key={automation.id}
                automation={automation}
                onToggle={handleToggle}
                onEdit={() => handleEdit(automation)}
                onDelete={handleDelete}
                onViewHistory={() => handleViewHistory(automation.id, automation.name)}
                onManualTrigger={() => handleManualTrigger(automation.id)}
              />
            ))}
          </div>
        )}
      </div>

      <RuleBuilderModal
        open={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        editingAutomation={editingAutomation}
        onSaved={handleSaved}
      />

      <RunHistoryDrawer
        open={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        automationId={historyAutomation?.id || ""}
        automationName={historyAutomation?.name || ""}
      />
    </div>
  );
}
