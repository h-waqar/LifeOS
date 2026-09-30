import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";

export interface OpenAIAdapterOptions {
  apiKey: string;
  baseURL?: string;
}

export function createOpenAIModel(
  modelId: string,
  options: OpenAIAdapterOptions
): LanguageModelV1 {
  const openai = createOpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
  });
  return openai(modelId);
}
