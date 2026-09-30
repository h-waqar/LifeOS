import { z } from "zod";

export type RiskTier =
  | "tier1_readonly"
  | "tier2_low"
  | "tier3_consequential"
  | "tier4_destructive";

export interface ToolContext {
  userId: string;
  conversationId?: string;
  messageId?: string;
  source?: "web_chat" | "command_palette" | "quick_capture" | "automation";
  skipHITL?: boolean;
}

export interface ActionPreview {
  summary: string;
  affectedEntities?: Array<{ domain: string; id?: string; name: string }>;
  diff?: Record<string, { before?: unknown; after?: unknown }>;
  warning?: string;
}

export interface LifeOSTool<TInput extends z.ZodTypeAny = any, TOutput = any> {
  id: string;
  name: string;
  description: string;
  category:
    | "tasks"
    | "calendar"
    | "goals"
    | "projects"
    | "habits"
    | "notes"
    | "finance"
    | "content"
    | "people";
  riskTier: RiskTier;
  schema: TInput;
  execute: (ctx: ToolContext, args: z.infer<TInput>) => Promise<TOutput>;
  previewAction?: (args: z.infer<TInput>) => ActionPreview;
}

export function requiresConfirmation(riskTier: RiskTier): boolean {
  return riskTier === "tier3_consequential" || riskTier === "tier4_destructive";
}
