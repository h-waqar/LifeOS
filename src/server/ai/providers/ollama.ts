import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";

export interface OllamaAdapterOptions {
  baseURL?: string;
}

export function createOllamaModel(
  modelId: string,
  options?: OllamaAdapterOptions
): LanguageModelV1 {
  const baseURL =
    options?.baseURL || process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
  const ollama = createOpenAI({
    baseURL,
    apiKey: "ollama", // Required by OpenAI-compatible endpoint
  });
  return ollama(modelId);
}
