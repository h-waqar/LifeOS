"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { GoalRiskBadge } from "./goal-risk-badge";
import {
  Calendar,
  Clock,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  RefreshCw,
  Layers,
  Activity,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import type { GoalRiskForecastDTO } from "@/types";

interface GoalForecastDialogProps {
  goalId: string;
  goalTitle: string;
  isOpen: boolean;
  onClose: () => void;
  initialForecast?: GoalRiskForecastDTO | null;
}

export function GoalForecastDialog({
  goalId,
  goalTitle,
  isOpen,
  onClose,
  initialForecast,
}: GoalForecastDialogProps) {
  const [forecast, setForecast] = React.useState<GoalRiskForecastDTO | null>(
    initialForecast || null
  );
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchForecast = React.useCallback(async () => {
    if (!goalId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/goals/${goalId}/forecast`);
      if (!res.ok) {
        throw new Error("Failed to load goal risk forecast");
      }
      const json = await res.json();
      setForecast(json.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading forecast");
    } finally {
      setIsLoading(false);
    }
  }, [goalId]);

  React.useEffect(() => {
    if (isOpen) {
      if (!initialForecast) {
        fetchForecast();
      } else {
        setForecast(initialForecast);
      }
    }
  }, [isOpen, initialForecast, fetchForecast]);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "None";
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Goal Trajectory & Risk Forecast"
      description="Deterministic predictive modeling based on historical velocity, deadlines, and task completion signals."
      className="max-w-2xl max-h-[85vh] overflow-y-auto"
    >
      <div className="space-y-5" data-testid="goal-forecast-dialog-content">
        {/* Header Summary */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-border">
          <div>
            <h3 className="font-semibold text-base text-foreground leading-tight">
              {goalTitle}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>Progress: {forecast?.currentProgress ?? 0}%</span>
              <span>•</span>
              <span>Target: {formatDate(forecast?.targetDate)}</span>
            </div>
          </div>
          {forecast && (
            <div className="flex items-center gap-2">
              <GoalRiskBadge
                riskLevel={forecast.riskLevel}
                riskScore={forecast.riskScore}
                showScore={true}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 rounded-lg"
                onClick={fetchForecast}
                disabled={isLoading}
                title="Recalculate forecast"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          )}
        </div>

        {isLoading && !forecast && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            Calculating trajectory signals and risk score...
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
            {error}
          </div>
        )}

        {forecast && (
          <>
            {/* Projections & Velocity Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-card border border-border">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Projected Finish</span>
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="text-base font-bold text-foreground">
                  {forecast.riskLevel === "completed"
                    ? "Completed"
                    : forecast.projectedCompletionDate
                    ? formatDate(forecast.projectedCompletionDate)
                    : "Unknown / Stalled"}
                </div>
                {forecast.projectedCompletionWindow && (
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">
                    Range: {formatDate(forecast.projectedCompletionWindow.earliestDate)} -{" "}
                    {formatDate(forecast.projectedCompletionWindow.latestDate)}
                  </span>
                )}
              </div>

              <div className="p-3 rounded-xl bg-card border border-border">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Velocity Pace</span>
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                </div>
                <div className="text-base font-bold text-foreground">
                  {forecast.currentVelocityPerDay}%{" "}
                  <span className="text-xs font-normal text-muted-foreground">/ day</span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 block">
                  {forecast.requiredVelocityPerDay !== null
                    ? `Required: ${forecast.requiredVelocityPerDay}% / day`
                    : "No deadline constraint"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Risk Score</span>
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                </div>
                <div className="text-base font-bold text-foreground">
                  {forecast.riskScore}{" "}
                  <span className="text-xs font-normal text-muted-foreground">/ 100</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 mt-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      forecast.riskScore >= 75
                        ? "bg-rose-500"
                        : forecast.riskScore >= 50
                        ? "bg-amber-500"
                        : forecast.riskScore >= 25
                        ? "bg-blue-500"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(5, forecast.riskScore))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Contributing Risk Factors */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contributing Risk Factors
              </h4>
              {forecast.contributingFactors.length === 0 ? (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  No critical risk factors detected. Trajectory aligns with target deadline.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {forecast.contributingFactors.map((factor, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-card border border-border text-xs flex items-start gap-2.5"
                    >
                      <AlertTriangle
                        className={`h-4 w-4 shrink-0 mt-0.5 ${
                          factor.severity === "critical"
                            ? "text-rose-500"
                            : factor.severity === "high"
                            ? "text-orange-500"
                            : factor.severity === "medium"
                            ? "text-amber-500"
                            : "text-blue-500"
                        }`}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-foreground">{factor.factor}</div>
                        {factor.observedMetric && (
                          <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                            Observed: {factor.observedMetric}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actionable Recommendations */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Actionable Recommendations
              </h4>
              <div className="space-y-1.5">
                {forecast.actionableRecommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-primary/5 border border-primary/15 text-xs flex items-start gap-2.5"
                  >
                    <Lightbulb className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <span className="text-foreground leading-relaxed">{rec}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Data Sufficiency Indicator */}
            <div className="p-2.5 rounded-lg bg-muted/50 border border-border/60 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{forecast.sufficiencyExplanation}</span>
              </div>
              <span className="text-[10px] font-mono uppercase bg-background px-2 py-0.5 rounded border border-border">
                {forecast.dataSufficiency}
              </span>
            </div>
          </>
        )}

        <div className="flex justify-end pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
