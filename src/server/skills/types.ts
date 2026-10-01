/**
 * LifeOS Procedural Skills Registry Types & Schemas
 *
 * Implements SKILL-02 strict Zod schema validation for skill frontmatter,
 * metadata structures, summary projections, and intent matching interfaces.
 */

import { z } from "zod";

export const SkillFrontmatterSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Skill name must be lowercase alphanumeric with hyphens"),
  description: z.string().min(10, "Description must be at least 10 characters").max(300, "Description cannot exceed 300 characters"),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "Version must follow semver format (e.g. 1.0.0)"),
  trigger_when: z
    .array(z.string().min(3))
    .min(1, "At least one trigger condition is required"),
  allowed_operations: z
    .array(z.string().min(1))
    .min(1, "At least one allowed operation is required"),
  required_context: z.array(z.string().min(1)).default([]),
  verification_requirements: z
    .array(z.string().min(3))
    .min(1, "At least one verification requirement is required"),
  tags: z.array(z.string()).default([]),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

export interface SkillDetail extends SkillFrontmatter {
  path: string;
  body: string;
  rawContent: string;
}

export type SkillSummary = Omit<
  SkillFrontmatter,
  "allowed_operations" | "required_context" | "verification_requirements"
> & {
  path: string;
};

export interface SkillFilterOptions {
  tag?: string;
  query?: string;
}

export interface SkillMatchResult {
  skill: SkillSummary;
  score: number;
  matchedTriggers: string[];
}
