import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV1 } from "ai";

export interface AnthropicAdapterOptions {
  apiKey: string;
  baseURL?: string;
}

export function createAnthropicModel(
  modelId: string,
  options: AnthropicAdapterOptions
): LanguageModelV1 {
  const anthropic = createAnthropic({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
  });
  return anthropic(modelId);
}
