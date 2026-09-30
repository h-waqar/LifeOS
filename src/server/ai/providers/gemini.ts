import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModelV1 } from "ai";

export interface GeminiAdapterOptions {
  apiKey: string;
  baseURL?: string;
}

export function createGeminiModel(
  modelId: string,
  options: GeminiAdapterOptions
): LanguageModelV1 {
  const google = createGoogleGenerativeAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
  });
  return google(modelId);
}
