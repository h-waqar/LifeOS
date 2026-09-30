"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, FlaskConical, Save } from "lucide-react";
import type { AutomationDTO, ConditionClause } from "@/types";
import { ConditionRow } from "./condition-row";

interface RuleBuilderModalProps {
  open: boolean;
  onClose: () => void;
  editingAutomation: AutomationDTO | null;
  onSaved: (automation: AutomationDTO) => void;
}

type Step = "basics" | "trigger" | "conditions" | "action";
const STEPS: Step[] = ["basics", "trigger", "conditions", "action"];
const STEP_LABELS: Record<Step, string> = {
  basics: "Basic Info",
  trigger: "Trigger",
  conditions: "Conditions",
  action: "Action",
};

const EVENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "task.completed", label: "When a task is completed" },
  { value: "task.created", label: "When a task is created" },
  { value: "task.overdue", label: "When a task is overdue" },
  { value: "project.all_tasks_completed", label: "When all project tasks are completed" },
  { value: "habit.logged", label: "When a habit is logged" },
  { value: "goal.progress_updated", label: "When goal progress updates" },
  { value: "goal.stagnant", label: "When a goal is stagnant (14 days)" },
  { value: "system.morning_routine_due", label: "Every morning (8:00 AM)" },
  { value: "system.evening_review_due", label: "Every evening (9:00 PM)" },
];

const ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "create_notification", label: "Send In-App Notification" },
  { value: "create_task", label: "Create Follow-up Task" },
  { value: "update_project", label: "Update Project Status" },
  { value: "trigger_ai_suggestions", label: "Trigger AI Suggestions" },
];

const NOTIFICATION_TYPES = ["info", "warning", "success", "error", "reminder"] as const;
const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const AI_SUGGESTION_TYPES = ["daily_planning", "weekly_review"] as const;

function getInitialClauses(automation: AutomationDTO | null): ConditionClause[] {
  if (!automation) return [];
  const c = automation.conditions;
  if (Array.isArray(c)) return c as ConditionClause[];
  if (c && typeof c === "object" && "clauses" in c && Array.isArray(c.clauses)) {
    return c.clauses.filter(
      (cl): cl is ConditionClause => "field" in cl && "operator" in cl
    );
  }
  return [];
}

function getInitialCombinator(automation: AutomationDTO | null): "AND" | "OR" {
  if (!automation) return "AND";
  const c = automation.conditions;
  if (c && typeof c === "object" && "combinator" in c) {
    return c.combinator as "AND" | "OR";
  }
  return "AND";
}

export function RuleBuilderModal({ open, onClose, editingAutomation, onSaved }: RuleBuilderModalProps) {
  const isEditing = !!editingAutomation;

  // Step state
  const [currentStep, setCurrentStep] = React.useState<Step>("basics");
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  // Form state
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [triggerType, setTriggerType] = React.useState<"event" | "schedule" | "threshold">("event");
  const [eventName, setEventName] = React.useState("task.completed");
  const [cronExpression, setCronExpression] = React.useState("");
  const [actionType, setActionType] = React.useState("create_notification");
  const [combinator, setCombinator] = React.useState<"AND" | "OR">("AND");
  const [clauses, setClauses] = React.useState<ConditionClause[]>([]);

  // Action config state
  const [notifTitle, setNotifTitle] = React.useState("");
  const [notifMessage, setNotifMessage] = React.useState("");
  const [notifType, setNotifType] = React.useState<string>("info");
  const [taskTitle, setTaskTitle] = React.useState("");
  const [taskPriority, setTaskPriority] = React.useState<string>("medium");
  const [taskDueOffset, setTaskDueOffset] = React.useState(1);
  const [projectStatus, setProjectStatus] = React.useState<string>("completed");
  const [aiType, setAiType] = React.useState<string>("daily_planning");

  // Initialize on open/edit
  React.useEffect(() => {
    if (open) {
      if (editingAutomation) {
        setName(editingAutomation.name);
        setDescription(editingAutomation.description || "");
        setTriggerType(editingAutomation.triggerType);
        const tc = editingAutomation.triggerConfig;
        if (editingAutomation.triggerType === "event" && tc.eventName) {
          setEventName(String(tc.eventName));
        }
        if (editingAutomation.triggerType === "schedule" && tc.cron) {
          setCronExpression(String(tc.cron));
        }
        setActionType(editingAutomation.actionType);
        setCombinator(getInitialCombinator(editingAutomation));
        setClauses(getInitialClauses(editingAutomation));

        // Action config
        const ac = editingAutomation.actionConfig;
        if (editingAutomation.actionType === "create_notification") {
          setNotifTitle(String(ac.title || ""));
          setNotifMessage(String(ac.message || ""));
          setNotifType(String(ac.type || "info"));
        } else if (editingAutomation.actionType === "create_task") {
          setTaskTitle(String(ac.title || ""));
          setTaskPriority(String(ac.priority || "medium"));
          setTaskDueOffset(Number(ac.dueOffsetDays) || 1);
        } else if (editingAutomation.actionType === "update_project") {
          setProjectStatus(String(ac.status || "completed"));
        } else if (editingAutomation.actionType === "trigger_ai_suggestions") {
          setAiType(String(ac.type || "daily_planning"));
        }
      } else {
        // Reset
        setName("");
        setDescription("");
        setTriggerType("event");
        setEventName("task.completed");
        setCronExpression("");
        setActionType("create_notification");
        setCombinator("AND");
        setClauses([]);
        setNotifTitle("");
        setNotifMessage("");
        setNotifType("info");
        setTaskTitle("");
        setTaskPriority("medium");
        setTaskDueOffset(1);
        setProjectStatus("completed");
        setAiType("daily_planning");
      }
      setCurrentStep("basics");
    }
  }, [open, editingAutomation]);

  const stepIndex = STEPS.indexOf(currentStep);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  const buildPayload = () => {
    const triggerConfig: Record<string, unknown> = {};
    if (triggerType === "event") {
      triggerConfig.eventName = eventName;
    } else if (triggerType === "schedule") {
      triggerConfig.cron = cronExpression;
    }

    let actionConfig: Record<string, unknown> = {};
    if (actionType === "create_notification") {
      actionConfig = { title: notifTitle, message: notifMessage, type: notifType };
    } else if (actionType === "create_task") {
      actionConfig = { title: taskTitle, priority: taskPriority, dueOffsetDays: taskDueOffset };
    } else if (actionType === "update_project") {
      actionConfig = { status: projectStatus };
    } else if (actionType === "trigger_ai_suggestions") {
      actionConfig = { type: aiType };
    }

    return {
      name,
      description: description || null,
      triggerType,
      triggerConfig,
      conditions: { combinator, clauses },
      actionType,
      actionConfig,
    };
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Automation name is required");
      setCurrentStep("basics");
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      const url = isEditing ? `/api/automations/${editingAutomation.id}` : "/api/automations";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success(isEditing ? "Automation updated" : "Automation created");
        onSaved(json.data);
      }
    } catch {
      toast.error("Failed to save automation");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const payload = buildPayload();
      const body = editingAutomation
        ? {
            automationId: editingAutomation.id,
            mockEvent: { name: triggerType === "event" ? eventName : "schedule.tick", payload: {} },
          }
        : {
            rule: payload,
            mockEvent: { name: triggerType === "event" ? eventName : "schedule.tick", payload: {} },
          };

      const res = await fetch("/api/automations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (json.error) {
        toast.error(`Test failed: ${json.error}`);
      } else if (json.data?.matched) {
        toast.success(`Test passed: conditions matched, would execute ${json.data.actionType}`);
      } else {
        toast.info(`Test result: conditions did not match (${json.data?.message || "no match"})`);
      }
    } catch {
      toast.error("Failed to test automation");
    } finally {
      setTesting(false);
    }
  };

  const addClause = () => {
    setClauses((prev) => [...prev, { field: "", operator: "equals", value: "" }]);
  };

  const updateClause = (index: number, updated: ConditionClause) => {
    setClauses((prev) => prev.map((c, i) => (i === index ? updated : c)));
  };

  const removeClause = (index: number) => {
    setClauses((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isEditing ? "Edit Automation" : "Create Automation"}
      description={`Step ${stepIndex + 1} of ${STEPS.length}: ${STEP_LABELS[currentStep]}`}
      className="max-w-2xl"
    >
      {/* Step Indicator */}
      <div className="flex items-center gap-1 mb-6">
        {STEPS.map((step, i) => (
          <React.Fragment key={step}>
            <button
              type="button"
              onClick={() => setCurrentStep(step)}
              className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                i === stepIndex
                  ? "bg-primary text-primary-foreground"
                  : i < stepIndex
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {STEP_LABELS[step]}
            </button>
            {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border" />}
          </React.Fragment>
        ))}
      </div>

      {/* Step: Basics */}
      {currentStep === "basics" && (
        <div className="space-y-4">
          <div>
            <label htmlFor="auto-name" className="block text-sm font-medium mb-1.5">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="auto-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Notify on high-priority task completion"
              data-testid="rule-name-input"
            />
          </div>
          <div>
            <label htmlFor="auto-desc" className="block text-sm font-medium mb-1.5">Description</label>
            <Textarea
              id="auto-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of what this automation does"
              rows={3}
            />
          </div>
        </div>
      )}

      {/* Step: Trigger */}
      {currentStep === "trigger" && (
        <div className="space-y-4">
          <div>
            <label htmlFor="trigger-type" className="block text-sm font-medium mb-1.5">Trigger Type</label>
            <select
              id="trigger-type"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as "event" | "schedule" | "threshold")}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="event">Event-based</option>
              <option value="schedule">Schedule-based</option>
              <option value="threshold">Threshold-based</option>
            </select>
          </div>

          {triggerType === "event" && (
            <div>
              <label htmlFor="event-name" className="block text-sm font-medium mb-1.5">Event</label>
              <select
                id="event-name"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="event-select"
              >
                {EVENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {triggerType === "schedule" && (
            <div>
              <label htmlFor="cron-expr" className="block text-sm font-medium mb-1.5">
                Cron Expression
              </label>
              <Input
                id="cron-expr"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="e.g. 0 8 * * * (daily at 8 AM)"
              />
              <p className="text-xs text-muted-foreground mt-1">
                5-field cron: minute hour day-of-month month day-of-week
              </p>
            </div>
          )}

          {triggerType === "threshold" && (
            <p className="text-sm text-muted-foreground">
              Threshold triggers fire when system metrics cross defined boundaries. Configure the threshold parameters in the trigger config.
            </p>
          )}
        </div>
      )}

      {/* Step: Conditions */}
      {currentStep === "conditions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">Match Conditions</label>
            <select
              value={combinator}
              onChange={(e) => setCombinator(e.target.value as "AND" | "OR")}
              className="h-7 rounded border border-input bg-background px-2 text-xs shadow-sm"
            >
              <option value="AND">Match ALL (AND)</option>
              <option value="OR">Match ANY (OR)</option>
            </select>
          </div>

          {clauses.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No conditions — this automation will trigger on every matching event.
            </p>
          ) : (
            <div className="space-y-2">
              {clauses.map((clause, index) => (
                <ConditionRow
                  key={index}
                  condition={clause}
                  onChange={(updated) => updateClause(index, updated)}
                  onRemove={() => removeClause(index)}
                />
              ))}
            </div>
          )}

          <Button type="button" variant="outline" size="sm" onClick={addClause} data-testid="add-condition-btn">
            + Add Condition
          </Button>
        </div>
      )}

      {/* Step: Action */}
      {currentStep === "action" && (
        <div className="space-y-4">
          <div>
            <label htmlFor="action-type" className="block text-sm font-medium mb-1.5">Action Type</label>
            <select
              id="action-type"
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="action-type-select"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Notification Config */}
          {actionType === "create_notification" && (
            <div className="space-y-3 border rounded-md p-3">
              <div>
                <label htmlFor="notif-title" className="block text-xs font-medium mb-1">Title</label>
                <Input id="notif-title" value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} placeholder="Notification title (supports {{interpolation}})" />
              </div>
              <div>
                <label htmlFor="notif-msg" className="block text-xs font-medium mb-1">Message</label>
                <Textarea id="notif-msg" value={notifMessage} onChange={(e) => setNotifMessage(e.target.value)} placeholder="Notification message" rows={2} />
              </div>
              <div>
                <label htmlFor="notif-type" className="block text-xs font-medium mb-1">Type</label>
                <select
                  id="notif-type"
                  value={notifType}
                  onChange={(e) => setNotifType(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {NOTIFICATION_TYPES.map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Task Config */}
          {actionType === "create_task" && (
            <div className="space-y-3 border rounded-md p-3">
              <div>
                <label htmlFor="task-title" className="block text-xs font-medium mb-1">Task Title</label>
                <Input id="task-title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Follow-up task title" />
              </div>
              <div>
                <label htmlFor="task-priority" className="block text-xs font-medium mb-1">Priority</label>
                <select
                  id="task-priority"
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="task-due" className="block text-xs font-medium mb-1">Due in (days)</label>
                <Input id="task-due" type="number" min={0} value={taskDueOffset} onChange={(e) => setTaskDueOffset(parseInt(e.target.value, 10) || 0)} />
              </div>
            </div>
          )}

          {/* Project Config */}
          {actionType === "update_project" && (
            <div className="space-y-3 border rounded-md p-3">
              <div>
                <label htmlFor="proj-status" className="block text-xs font-medium mb-1">Set Status</label>
                <select
                  id="proj-status"
                  value={projectStatus}
                  onChange={(e) => setProjectStatus(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
          )}

          {/* AI Config */}
          {actionType === "trigger_ai_suggestions" && (
            <div className="space-y-3 border rounded-md p-3">
              <div>
                <label htmlFor="ai-type" className="block text-xs font-medium mb-1">Suggestion Type</label>
                <select
                  id="ai-type"
                  value={aiType}
                  onChange={(e) => setAiType(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {AI_SUGGESTION_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation Footer */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t">
        <div className="flex gap-2">
          {!isFirst && (
            <Button type="button" variant="outline" size="sm" onClick={() => setCurrentStep(STEPS[stepIndex - 1])}>
              <ChevronLeft className="w-3.5 h-3.5 mr-1" />
              Back
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing || !name.trim()}
            data-testid="test-rule-btn"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5 mr-1" />}
            Test Rule
          </Button>
          {isLast ? (
            <Button type="button" size="sm" onClick={handleSave} disabled={saving} data-testid="save-automation-btn">
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              {isEditing ? "Update" : "Create"}
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => setCurrentStep(STEPS[stepIndex + 1])}>
              Next
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
