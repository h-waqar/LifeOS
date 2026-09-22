"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  Plus,
  ArrowRight,
  BarChart2,
  ExternalLink,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MarkPublishedModal } from "./mark-published-modal";
import { MetricsModal } from "./metrics-modal";
import { getPlatformBadge } from "./content-card";
import type {
  ContentPublicationDTO,
  ContentItemDTO,
  ContentPlatform,
} from "@/types";

interface ContentCalendarViewProps {
  onOpenEditor?: (item: ContentItemDTO) => void;
}

export function ContentCalendarView({ onOpenEditor }: ContentCalendarViewProps) {
  const [viewMode, setViewMode] = React.useState<"month" | "week">("month");
  const [currentDate, setCurrentDate] = React.useState<Date>(new Date());
  const [publications, setPublications] = React.useState<ContentPublicationDTO[]>([]);
  const [unscheduled, setUnscheduled] = React.useState<ContentItemDTO[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  // Selected publication for actions
  const [selectedPub, setSelectedPub] = React.useState<ContentPublicationDTO | null>(null);
  const [isPublishModalOpen, setIsPublishModalOpen] = React.useState(false);
  const [isMetricsModalOpen, setIsMetricsModalOpen] = React.useState(false);

  // Quick Schedule Modal for unscheduled item
  const [scheduleItem, setScheduleItem] = React.useState<ContentItemDTO | null>(null);
  const [scheduleDate, setScheduleDate] = React.useState("");
  const [schedulePlatform, setSchedulePlatform] = React.useState<ContentPlatform>("twitter");
  const [isScheduling, setIsScheduling] = React.useState(false);

  // Reschedule Modal
  const [reschedulePub, setReschedulePub] = React.useState<ContentPublicationDTO | null>(null);
  const [rescheduleDate, setRescheduleDate] = React.useState("");
  const [isRescheduling, setIsRescheduling] = React.useState(false);

  // Compute month date boundaries
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const fetchCalendarData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      // 1st of month to end of month + padding
      const start = new Date(Date.UTC(year, month, 1));
      const end = new Date(Date.UTC(year, month + 1, 0));

      const startDateStr = start.toISOString().split("T")[0];
      const endDateStr = end.toISOString().split("T")[0];

      const [pubRes, unRes] = await Promise.all([
        fetch(`/api/content/calendar?startDate=${startDateStr}&endDate=${endDateStr}`),
        fetch(`/api/content/calendar?unscheduled=true`),
      ]);

      if (pubRes.ok) {
        const json = await pubRes.json();
        setPublications(json.data || []);
      }
      if (unRes.ok) {
        const json = await unRes.json();
        setUnscheduled(json.data || []);
      }
    } catch (err) {
      console.error("Failed to load calendar data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  React.useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  // Navigate dates
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Calendar Day generation
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday

  const daysArray = React.useMemo(() => {
    const days: Array<{ day: number; dateStr: string; isCurrentMonth: boolean }> = [];

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const prevDate = new Date(Date.UTC(year, month - 1, d));
      days.push({
        day: d,
        dateStr: prevDate.toISOString().split("T")[0],
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const thisDate = new Date(Date.UTC(year, month, d));
      days.push({
        day: d,
        dateStr: thisDate.toISOString().split("T")[0],
        isCurrentMonth: true,
      });
    }

    // Next month padding to complete 35 or 42 cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(Date.UTC(year, month + 1, d));
      days.push({
        day: d,
        dateStr: nextDate.toISOString().split("T")[0],
        isCurrentMonth: false,
      });
    }

    return days;
  }, [year, month, daysInMonth, firstDayIndex]);

  // Group publications by date (YYYY-MM-DD)
  const publicationsByDate = React.useMemo(() => {
    const map = new Map<string, ContentPublicationDTO[]>();
    for (const pub of publications) {
      const dateKey = pub.scheduledFor.split("T")[0];
      const list = map.get(dateKey) || [];
      list.push(pub);
      map.set(dateKey, list);
    }
    return map;
  }, [publications]);

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleItem || !scheduleDate) return;

    setIsScheduling(true);
    try {
      const payload = {
        platform: schedulePlatform,
        scheduledFor: new Date(scheduleDate).toISOString(),
      };

      const res = await fetch(`/api/content/${scheduleItem.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to schedule item");
      }

      toast.success("Publication scheduled!");
      setScheduleItem(null);
      fetchCalendarData();
    } catch (err: any) {
      toast.error(err.message || "Failed to schedule");
    } finally {
      setIsScheduling(false);
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulePub || !rescheduleDate) return;

    setIsRescheduling(true);
    try {
      const payload = {
        scheduledFor: new Date(rescheduleDate).toISOString(),
      };

      const res = await fetch(`/api/content/publications/${reschedulePub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to reschedule publication");
      }

      toast.success("Publication rescheduled!");
      setReschedulePub(null);
      fetchCalendarData();
    } catch (err: any) {
      toast.error(err.message || "Failed to reschedule");
    } finally {
      setIsRescheduling(false);
    }
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6" data-testid="content-calendar-view">
      {/* Main Calendar Panel */}
      <div className="flex-1 space-y-4">
        {/* Calendar Navigation Bar */}
        <div className="flex items-center justify-between bg-card p-4 rounded-xl border border-border">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground" data-testid="calendar-current-month">
              {monthNames[month]} {year}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToday}
              className="text-xs h-7"
            >
              Today
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center border border-border rounded-lg overflow-hidden p-0.5 bg-muted/40">
              <Button
                variant={viewMode === "month" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setViewMode("month")}
              >
                Month
              </Button>
              <Button
                variant={viewMode === "week" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setViewMode("week")}
              >
                Week
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={handlePrevMonth}
                aria-label="Previous month"
                data-testid="calendar-prev-button"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={handleNextMonth}
                aria-label="Next month"
                data-testid="calendar-next-button"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-muted-foreground">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 bg-muted/20 p-1 rounded-xl border border-border" data-testid="calendar-grid">
          {daysArray.map(({ day, dateStr, isCurrentMonth }) => {
            const dayPubs = publicationsByDate.get(dateStr) || [];
            const isToday = dateStr === new Date().toISOString().split("T")[0];

            return (
              <div
                key={dateStr}
                className={`min-h-[110px] p-1.5 rounded-lg border transition-colors flex flex-col justify-between ${
                  isCurrentMonth
                    ? "bg-card border-border/60 hover:border-primary/40"
                    : "bg-muted/10 border-border/20 text-muted-foreground/50 opacity-60"
                } ${isToday ? "ring-1 ring-primary/60 border-primary" : ""}`}
                data-testid={`calendar-day-${dateStr}`}
              >
                {/* Day Number Header */}
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-semibold ${
                      isToday
                        ? "bg-primary text-primary-foreground h-5 w-5 rounded-full flex items-center justify-center font-bold"
                        : ""
                    }`}
                  >
                    {day}
                  </span>
                  {dayPubs.length > 0 && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {dayPubs.length}
                    </span>
                  )}
                </div>

                {/* Day Content Chips */}
                <div className="space-y-1 overflow-y-auto max-h-[85px]">
                  {dayPubs.map((pub) => {
                    const isPub = pub.status === "published";
                    return (
                      <div
                        key={pub.id}
                        className={`p-1 rounded text-[11px] border leading-tight cursor-pointer transition-all ${
                          isPub
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                            : "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
                        }`}
                        onClick={() => setSelectedPub(pub)}
                        title={`${pub.contentTitle || "Untitled"} (${pub.platform})`}
                        data-testid={`calendar-chip-${pub.id}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold uppercase text-[9px]">
                            {pub.platform.slice(0, 3)}
                          </span>
                          {isPub ? (
                            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                          ) : (
                            <Clock className="h-2.5 w-2.5 text-purple-500" />
                          )}
                        </div>
                        <div className="truncate font-medium mt-0.5">
                          {pub.contentTitle || "Untitled Draft"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Side Drawer: Unscheduled Drafts & Inspector */}
      <div className="w-full lg:w-80 space-y-4">
        {/* Selected Publication Inspector */}
        {selectedPub && (
          <div className="p-4 bg-card rounded-xl border border-primary/40 space-y-3" data-testid="publication-inspector">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                Publication Details
              </span>
              <button
                type="button"
                onClick={() => setSelectedPub(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div>
              <h4 className="font-bold text-sm leading-snug">
                {selectedPub.contentTitle || "Untitled"}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                {getPlatformBadge(selectedPub.platform)}
                <Badge
                  variant="outline"
                  className={
                    selectedPub.status === "published"
                      ? "text-emerald-600 border-emerald-500/40 text-[10px]"
                      : "text-purple-600 border-purple-500/40 text-[10px]"
                  }
                >
                  {selectedPub.status.toUpperCase()}
                </Badge>
              </div>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                <strong>Scheduled:</strong>{" "}
                {new Date(selectedPub.scheduledFor).toLocaleString()}
              </div>
              {selectedPub.publishedAt && (
                <div>
                  <strong>Published:</strong>{" "}
                  {new Date(selectedPub.publishedAt).toLocaleString()}
                </div>
              )}
              {selectedPub.postUrl && (
                <div className="truncate">
                  <a
                    href={selectedPub.postUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <span>View Live Post</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5 pt-2 border-t border-border">
              {selectedPub.status !== "published" && (
                <Button
                  size="sm"
                  variant="default"
                  className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  onClick={() => setIsPublishModalOpen(true)}
                  data-testid="inspector-mark-published-button"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Mark as Published</span>
                </Button>
              )}

              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1.5 text-xs"
                onClick={() => {
                  setReschedulePub(selectedPub);
                  setRescheduleDate(
                    new Date(selectedPub.scheduledFor).toISOString().slice(0, 16)
                  );
                }}
                data-testid="inspector-reschedule-button"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reschedule Slot</span>
              </Button>

              {selectedPub.status === "published" && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full gap-1.5 text-xs"
                  onClick={() => setIsMetricsModalOpen(true)}
                  data-testid="inspector-log-metrics-button"
                >
                  <BarChart2 className="h-3.5 w-3.5" />
                  <span>Log Performance Metrics</span>
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Unscheduled Drafts Tray */}
        <div className="bg-card p-4 rounded-xl border border-border space-y-3" data-testid="unscheduled-drawer">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span>Unscheduled Drafts ({unscheduled.length})</span>
            </h3>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {unscheduled.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                All drafts are scheduled or published!
              </p>
            ) : (
              unscheduled.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-lg border border-border bg-background/50 hover:bg-background space-y-2 text-xs"
                  data-testid={`unscheduled-item-${item.id}`}
                >
                  <div className="font-semibold text-foreground line-clamp-1">
                    {item.title}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="capitalize">{item.contentType}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2 gap-1"
                      onClick={() => {
                        setScheduleItem(item);
                        setScheduleDate(new Date().toISOString().slice(0, 16));
                        setSchedulePlatform(item.targetChannels[0] || "twitter");
                      }}
                      data-testid={`schedule-btn-${item.id}`}
                    >
                      <CalendarIcon className="h-2.5 w-2.5" />
                      <span>Schedule</span>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Schedule Modal for Unscheduled Items */}
      {scheduleItem && (
        <Modal
          isOpen={Boolean(scheduleItem)}
          onClose={() => setScheduleItem(null)}
          title="Schedule Publication"
          description={`Select date, time, and channel for "${scheduleItem.title}".`}
          className="max-w-md"
        >
          <form onSubmit={handleScheduleSubmit} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Target Platform
              </label>
              <select
                value={schedulePlatform}
                onChange={(e) => setSchedulePlatform(e.target.value as ContentPlatform)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs"
                data-testid="schedule-platform-select"
              >
                <option value="twitter">Twitter / X</option>
                <option value="linkedin">LinkedIn</option>
                <option value="blog">Blog Article</option>
                <option value="newsletter">Newsletter</option>
                <option value="youtube">YouTube</option>
                <option value="instagram">Instagram</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Scheduled Date & Time
              </label>
              <Input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="text-xs"
                required
                data-testid="schedule-datetime-input"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setScheduleItem(null)}
                disabled={isScheduling}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isScheduling}
                data-testid="confirm-schedule-button"
              >
                {isScheduling ? "Scheduling..." : "Confirm Schedule"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reschedule Modal */}
      {reschedulePub && (
        <Modal
          isOpen={Boolean(reschedulePub)}
          onClose={() => setReschedulePub(null)}
          title="Reschedule Publication"
          description={`Select new date and time for "${reschedulePub.contentTitle || "Draft"}".`}
          className="max-w-md"
        >
          <form onSubmit={handleRescheduleSubmit} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                New Date & Time
              </label>
              <Input
                type="datetime-local"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="text-xs"
                required
                data-testid="reschedule-datetime-input"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReschedulePub(null)}
                disabled={isRescheduling}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isRescheduling}
                data-testid="confirm-reschedule-button"
              >
                {isRescheduling ? "Updating..." : "Update Schedule"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Mark Published Modal */}
      <MarkPublishedModal
        publication={selectedPub}
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        onSuccess={() => {
          setSelectedPub(null);
          fetchCalendarData();
        }}
      />

      {/* Metrics Modal */}
      <MetricsModal
        publication={selectedPub}
        isOpen={isMetricsModalOpen}
        onClose={() => setIsMetricsModalOpen(false)}
        onSuccess={() => {
          fetchCalendarData();
        }}
      />
    </div>
  );
}
