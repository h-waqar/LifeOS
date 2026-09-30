import { z } from "zod";

export type AIProviderName = "google" | "anthropic" | "openai" | "ollama";

export interface ModelMetadata {
  id: string;
  name: string;
  provider: AIProviderName;
  description: string;
  contextWindow: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  isReasoning?: boolean;
}

export interface AIModelConfig {
  provider: AIProviderName;
  model: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  baseURL?: string;
}

export interface ProviderTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface UserAIKeys {
  geminiKey?: string | null;
  anthropicKey?: string | null;
  openaiKey?: string | null;
  ollamaBaseUrl?: string | null;
}

export interface MaskedAISettings {
  defaultProvider: AIProviderName;
  defaultModel: string;
  hasGeminiKey: boolean;
  hasAnthropicKey: boolean;
  hasOpenAIKey: boolean;
  maskedGeminiKey: string | null;
  maskedAnthropicKey: string | null;
  maskedOpenAIKey: string | null;
  ollamaBaseUrl: string | null;
  temperature: number;
}

export function getEnvVarNameForProvider(provider: AIProviderName): string {
  switch (provider) {
    case "google":
      return "GEMINI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
    case "ollama":
      return "OLLAMA_BASE_URL";
  }
}

export class ProviderConfigurationError extends Error {
  public readonly provider: AIProviderName;
  public readonly remediation: string;

  constructor(provider: AIProviderName, message?: string, remediation?: string) {
    const defaultMsg = `Missing API credentials for AI provider '${provider}'. Please configure your API key in Settings or set the system environment variable.`;
    super(message || defaultMsg);
    this.name = "ProviderConfigurationError";
    this.provider = provider;
    this.remediation =
      remediation ||
      `Add your ${provider.toUpperCase()} API key in Settings > AI Assistant or set ${getEnvVarNameForProvider(provider)} in your server environment.`;
  }
}

export const SUPPORTED_MODELS: Record<string, ModelMetadata> = {
  // Google Gemini
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    description: "Ultra-fast daily triage, contextual synthesis, and task execution",
    contextWindow: 1048576,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  "gemini-2.5-pro": {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    description: "Advanced reasoning for complex planning and multifaceted synthesis",
    contextWindow: 2097152,
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.0,
    isReasoning: true,
  },
  // Anthropic Claude
  "claude-3-7-sonnet": {
    id: "claude-3-7-sonnet",
    name: "Claude 3.7 Sonnet",
    provider: "anthropic",
    description: "Deep reasoning, strategic reflection, and nuanced long-form output",
    contextWindow: 200000,
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    isReasoning: true,
  },
  "claude-3-5-haiku": {
    id: "claude-3-5-haiku",
    name: "Claude 3.5 Haiku",
    provider: "anthropic",
    description: "Fast, responsive queries and natural language command parsing",
    contextWindow: 200000,
    inputCostPer1M: 0.8,
    outputCostPer1M: 4.0,
  },
  // OpenAI
  "gpt-4o": {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "Flagship versatile multimodal and structured tool execution model",
    contextWindow: 128000,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
  },
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Affordable fast intelligence for quick capture and classification",
    contextWindow: 128000,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  // Ollama (Local Compute)
  "llama3.3": {
    id: "llama3.3",
    name: "Llama 3.3 (Local)",
    provider: "ollama",
    description: "Local private execution running on your machine via Ollama",
    contextWindow: 131072,
    inputCostPer1M: 0.0,
    outputCostPer1M: 0.0,
  },
  "qwen2.5": {
    id: "qwen2.5",
    name: "Qwen 2.5 (Local)",
    provider: "ollama",
    description: "Local high-performance code and reasoning model via Ollama",
    contextWindow: 131072,
    inputCostPer1M: 0.0,
    outputCostPer1M: 0.0,
  },
  "mistral": {
    id: "mistral",
    name: "Mistral 7B (Local)",
    provider: "ollama",
    description: "Compact local model for fast offline command processing",
    contextWindow: 32768,
    inputCostPer1M: 0.0,
    outputCostPer1M: 0.0,
  },
};

export function calculateTokenCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number {
  const model = SUPPORTED_MODELS[modelId];
  if (!model || (model.inputCostPer1M === 0 && model.outputCostPer1M === 0)) {
    return 0;
  }
  const inputCost = (promptTokens / 1_000_000) * model.inputCostPer1M;
  const outputCost = (completionTokens / 1_000_000) * model.outputCostPer1M;
  return Number((inputCost + outputCost).toFixed(6));
}

export function maskApiKey(key?: string | null): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "••••••••";
  const start = trimmed.slice(0, 4);
  const end = trimmed.slice(-4);
  return `${start}...${end}`;
}

export const updateAISettingsSchema = z.object({
  defaultProvider: z.enum(["google", "anthropic", "openai", "ollama"]).optional(),
  defaultModel: z.string().min(1).optional(),
  geminiKey: z.string().nullable().optional(),
  anthropicKey: z.string().nullable().optional(),
  openaiKey: z.string().nullable().optional(),
  ollamaBaseUrl: z.string().url().nullable().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export type UpdateAISettingsInput = z.infer<typeof updateAISettingsSchema>;
