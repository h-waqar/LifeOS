/**
 * Authoritative Procedural Skills Registry Service
 *
 * Implements SKILL-01 & SKILL-02: Discovers, caches, parses, and searches
 * curated procedural skills from skills/lifeos/[skill-name]/SKILL.md.
 */

import fs from "node:fs";
import path from "node:path";
import { NotFoundError } from "@/cli/errors";
import { parseSkillMarkdown } from "./parser";
import type {
  SkillDetail,
  SkillSummary,
  SkillFilterOptions,
  SkillMatchResult,
} from "./types";

interface CacheEntry {
  mtime: number;
  skill: SkillDetail;
}

export class SkillsRegistry {
  private baseDir: string;
  private cache = new Map<string, CacheEntry>();

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.resolve(process.cwd(), "skills/lifeos");
  }

  /**
   * Refreshes in-memory cache against filesystem state.
   */
  private async loadSkills(): Promise<Map<string, SkillDetail>> {
    const currentSkills = new Map<string, SkillDetail>();

    if (!fs.existsSync(this.baseDir)) {
      return currentSkills;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(this.baseDir, { withFileTypes: true });
    } catch {
      return currentSkills;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = path.join(this.baseDir, entry.name, "SKILL.md");
      if (!fs.existsSync(skillPath)) continue;

      try {
        const stat = await fs.promises.stat(skillPath);
        const cached = this.cache.get(skillPath);

        if (cached && cached.mtime === stat.mtimeMs) {
          currentSkills.set(cached.skill.name.toLowerCase(), cached.skill);
          continue;
        }

        const rawContent = await fs.promises.readFile(skillPath, "utf-8");
        const parsed = parseSkillMarkdown(rawContent, skillPath);

        this.cache.set(skillPath, {
          mtime: stat.mtimeMs,
          skill: parsed,
        });

        currentSkills.set(parsed.name.toLowerCase(), parsed);
      } catch (err) {
        // Log diagnostic to stderr without crashing the entire registry
        process.stderr.write("[skills-registry] Failed to load skill at " + skillPath + ": " + String(err) + "\n");
      }
    }

    return currentSkills;
  }

  /**
   * Lists all available skills as summaries, sorted alphabetically by name.
   */
  public async listSkills(filter?: SkillFilterOptions): Promise<SkillSummary[]> {
    const skillsMap = await this.loadSkills();
    let skills = Array.from(skillsMap.values()).map(
      ({ allowed_operations, required_context, verification_requirements, ...summary }) => summary
    );

    // Apply tag filter
    if (filter?.tag && filter.tag.trim()) {
      const tagLower = filter.tag.trim().toLowerCase();
      skills = skills.filter((s) => s.tags.some((t) => t.toLowerCase() === tagLower));
    }

    // Apply text search query
    if (filter?.query && filter.query.trim()) {
      const qLower = filter.query.trim().toLowerCase();
      skills = skills.filter(
        (s) =>
          s.name.toLowerCase().includes(qLower) ||
          s.description.toLowerCase().includes(qLower) ||
          s.tags.some((t) => t.toLowerCase().includes(qLower)) ||
          s.trigger_when.some((t) => t.toLowerCase().includes(qLower))
      );
    }

    // Deterministic alphabetical sort
    return skills.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Retrieves full skill metadata and markdown guidance by name.
   */
  public async getSkill(name: string): Promise<SkillDetail> {
    if (!name || typeof name !== "string") {
      throw new NotFoundError("Skill name cannot be empty.");
    }

    const skillsMap = await this.loadSkills();
    const skill = skillsMap.get(name.trim().toLowerCase());

    if (!skill) {
      throw new NotFoundError(
        `Skill not found: '${name}'. Run 'lifeos skills list' to view available procedural skills.`
      );
    }

    return skill;
  }

  /**
   * Computes relevance scores for an intent string against triggers, tags, and descriptions.
   */
  public async matchSkillsForIntent(query: string): Promise<SkillMatchResult[]> {
    if (!query || typeof query !== "string" || !query.trim()) {
      return [];
    }

    const skillsMap = await this.loadSkills();
    const queryTokens = query
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .filter((t) => t.length > 2);

    if (queryTokens.length === 0) {
      return [];
    }

    const results: SkillMatchResult[] = [];

    for (const skill of skillsMap.values()) {
      let score = 0;
      const matchedTriggers: string[] = [];

      const nameLower = skill.name.toLowerCase();
      const descLower = skill.description.toLowerCase();
      const tagsLower = skill.tags.map((t) => t.toLowerCase());

      // Exact phrase match in description or name
      const fullQueryLower = query.toLowerCase().trim();
      if (nameLower === fullQueryLower) {
        score += 15.0;
      } else if (nameLower.includes(fullQueryLower)) {
        score += 8.0;
      }

      // Check trigger conditions
      for (const trigger of skill.trigger_when) {
        const triggerLower = trigger.toLowerCase();
        let triggerMatched = false;

        if (triggerLower.includes(fullQueryLower)) {
          score += 6.0;
          triggerMatched = true;
        } else {
          for (const token of queryTokens) {
            if (triggerLower.includes(token)) {
              score += 3.0;
              triggerMatched = true;
            }
          }
        }

        if (triggerMatched) {
          matchedTriggers.push(trigger);
        }
      }

      // Check tags
      for (const tag of tagsLower) {
        for (const token of queryTokens) {
          if (tag === token) {
            score += 4.0;
          } else if (tag.includes(token)) {
            score += 2.0;
          }
        }
      }

      // Check description tokens
      for (const token of queryTokens) {
        if (descLower.includes(token)) {
          score += 1.0;
        }
        if (nameLower.includes(token)) {
          score += 3.0;
        }
      }

      if (score > 0) {
        const { allowed_operations, required_context, verification_requirements, ...summary } =
          skill;
        results.push({
          skill: summary,
          score: Math.round(score * 10) / 10,
          matchedTriggers,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
  }
}

export const skillsRegistry = new SkillsRegistry();
