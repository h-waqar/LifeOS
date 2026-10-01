/**
 * Planning Graph Inspector
 *
 * Implements SKILL-04 / T-12-06: Direct access to planning state,
 * milestone architectural decisions, phase summaries, and pending roadmap.
 */

import fs from "node:fs";
import path from "node:path";
import { NotFoundError } from "@/cli/errors";
import { parseYamlFrontmatter } from "@/server/skills/parser";
import type {
  PlanningStateDTO,
  MilestoneDecisionDTO,
  PhaseSummaryDTO,
  PendingRoadmapDTO,
} from "./types";

export class PlanningInspector {
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = path.resolve(projectRoot);
  }

  /**
   * Reads and parses current planning state from .planning/STATE.md and state.json.
   */
  public async getCurrentPlanningState(): Promise<PlanningStateDTO> {
    const stateMdPath = path.join(this.projectRoot, ".planning/STATE.md");
    const stateJsonPath = path.join(this.projectRoot, ".planning/state.json");

    let frontmatter: Record<string, unknown> = {};
    let content = "";

    if (fs.existsSync(stateMdPath)) {
      content = await fs.promises.readFile(stateMdPath, "utf-8");
      const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
      if (match) {
        try {
          frontmatter = parseYamlFrontmatter(match[1]);
        } catch {
          // Fallback to empty frontmatter
        }
      }
    }

    let jsonState: Record<string, unknown> = {};
    if (fs.existsSync(stateJsonPath)) {
      try {
        const rawJson = await fs.promises.readFile(stateJsonPath, "utf-8");
        jsonState = JSON.parse(rawJson);
      } catch {
        // Fallback
      }
    }

    const milestone = String(
      frontmatter.milestone ?? jsonState.milestone ?? "v2.0"
    );
    const currentPhase = String(
      frontmatter.current_phase ?? jsonState.current_phase ?? "12"
    );
    const currentPhaseName = String(
      frontmatter.current_phase_name ??
        jsonState.current_phase_name ??
        "Skills Engine & Contextual Documentation Retrieval"
    );
    const status = String(frontmatter.status ?? jsonState.status ?? "in_progress");
    const stoppedAt = frontmatter.stopped_at ? String(frontmatter.stopped_at) : undefined;
    const recentTrend = frontmatter.recent_trend ? String(frontmatter.recent_trend) : undefined;

    // Extract next steps if mentioned in body
    const nextSteps: string[] = [];
    const nextMatch = content.match(/Next actionable work:\s*([^\r\n]+)/i);
    if (nextMatch) {
      nextSteps.push(nextMatch[1].trim());
    }

    return {
      milestone,
      current_phase: currentPhase,
      current_phase_name: currentPhaseName,
      status,
      stopped_at: stoppedAt,
      progress: frontmatter.progress ? JSON.stringify(frontmatter.progress) : undefined,
      recent_trend: recentTrend,
      next_steps: nextSteps,
      raw: { ...jsonState, ...frontmatter },
    };
  }

  /**
   * Parses the Key Decisions table from .planning/PROJECT.md.
   */
  public async getMilestoneDecisions(): Promise<MilestoneDecisionDTO[]> {
    const projectMdPath = path.join(this.projectRoot, ".planning/PROJECT.md");
    if (!fs.existsSync(projectMdPath)) {
      return [];
    }

    const content = await fs.promises.readFile(projectMdPath, "utf-8");
    const decisionsIdx = content.indexOf("## Key Decisions");
    if (decisionsIdx === -1) {
      return [];
    }

    const sub = content.slice(decisionsIdx);
    const nextHeadingIdx = sub.indexOf("\n## ", 10);
    const decisionsBlock = nextHeadingIdx !== -1 ? sub.slice(0, nextHeadingIdx) : sub;

    const lines = decisionsBlock.split(/\r?\n/);
    const decisions: MilestoneDecisionDTO[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Match markdown table row: | Decision | Rationale | Outcome |
      if (
        !trimmed.startsWith("|") ||
        trimmed.includes("---") ||
        trimmed.toLowerCase().includes("| decision |")
      ) {
        continue;
      }

      const columns = trimmed
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());

      if (columns.length >= 2) {
        decisions.push({
          decision: columns[0],
          rationale: columns[1],
          outcome: columns[2] || undefined,
        });
      }
    }

    return decisions;
  }

  /**
   * Locates and extracts summary content for a specified phase.
   */
  public async getPhaseSummary(phaseIdentifier: string): Promise<PhaseSummaryDTO> {
    if (!phaseIdentifier || !phaseIdentifier.trim()) {
      throw new NotFoundError("Phase identifier is required.");
    }

    const cleanId = phaseIdentifier.trim().toLowerCase().replace(/^phase-?/i, "");
    const paddedId = cleanId.padStart(2, "0");

    const searchDirs = [
      path.join(this.projectRoot, ".planning/phases"),
      path.join(this.projectRoot, ".planning/milestones/v1.0-phases"),
    ];

    let matchedFile: string | null = null;
    let phaseName = "";

    for (const searchDir of searchDirs) {
      if (!fs.existsSync(searchDir)) continue;

      const entries = await fs.promises.readdir(searchDir, { withFileTypes: true });
      for (const entry of entries) {
        const entryLower = entry.name.toLowerCase();

        // Check if directory matches: e.g. "11-lifeos-model-context-protocol-mcp-server" or "04-personal-finance"
        if (
          entry.isDirectory() &&
          (entryLower.startsWith(`${cleanId}-`) ||
            entryLower.startsWith(`${paddedId}-`) ||
            entryLower === cleanId ||
            entryLower === paddedId)
        ) {
          phaseName = entry.name;
          const subDir = path.join(searchDir, entry.name);
          const subFiles = await fs.promises.readdir(subDir);
          // Look for SUMMARY files (e.g. 11-04-SUMMARY.md or 04-SUMMARY.md or SUMMARY.md)
          const summaryFiles = subFiles
            .filter((f) => f.toUpperCase().endsWith("SUMMARY.MD"))
            .sort()
            .reverse();

          if (summaryFiles.length > 0) {
            matchedFile = path.join(subDir, summaryFiles[0]);
            break;
          }
        }
      }
      if (matchedFile) break;
    }

    if (!matchedFile) {
      throw new NotFoundError(
        `No summary found for phase '${phaseIdentifier}'. Ensure the phase has been planned and executed.`
      );
    }

    const rawContent = await fs.promises.readFile(matchedFile, "utf-8");
    const relPath = path.relative(this.projectRoot, matchedFile).replace(/\\/g, "/");

    let frontmatter: Record<string, unknown> | undefined;
    let summaryBody = rawContent;

    const fMatch = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fMatch) {
      try {
        frontmatter = parseYamlFrontmatter(fMatch[1]);
      } catch {
        // Fallback
      }
      summaryBody = fMatch[2].trim();
    }

    return {
      phase: cleanId,
      name: phaseName || `Phase ${cleanId}`,
      path: relPath,
      summary: summaryBody,
      frontmatter,
    };
  }

  /**
   * Extracts upcoming roadmap phases and remaining requirements.
   */
  public async getPendingRoadmap(): Promise<PendingRoadmapDTO> {
    const roadmapPath = path.join(this.projectRoot, ".planning/ROADMAP.md");
    const reqsPath = path.join(this.projectRoot, ".planning/REQUIREMENTS.md");

    const phases: PendingRoadmapDTO["phases"] = [];

    if (fs.existsSync(roadmapPath)) {
      const content = await fs.promises.readFile(roadmapPath, "utf-8");
      const lines = content.split(/\r?\n/);

      for (const line of lines) {
        // e.g. - [x] **Phase 10: Shared Application Services & Headless CLI** - description
        // e.g. - [ ] **Phase 12: Skills Engine & Contextual Documentation Retrieval** - description
        const match = line.match(/^\s*-\s*\[([ xX])\]\s*\*\*Phase\s*(\d+):\s*([^*]+)\*\*(?:\s*-\s*(.*))?$/);
        if (match) {
          const isDone = match[1].toLowerCase() === "x";
          phases.push({
            phase: match[2],
            name: match[3].trim(),
            status: isDone ? "complete" : "pending",
            goal: match[4]?.trim(),
          });
        }
      }
    }

    let pendingRequirementsCount = 0;
    if (fs.existsSync(reqsPath)) {
      const content = await fs.promises.readFile(reqsPath, "utf-8");
      // Count unchecked boxes: [ ]
      const matches = content.match(/- \[ \] \*\*[A-Z0-9_-]+\*\*/g);
      if (matches) {
        pendingRequirementsCount = matches.length;
      }
    }

    return {
      phases,
      pendingRequirementsCount,
    };
  }
}

export const planningInspector = new PlanningInspector();
