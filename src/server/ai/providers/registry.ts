import type { LanguageModelV1 } from "ai";
import { generateText } from "ai";
import {
  type AIModelConfig,
  type AIProviderName,
  type ModelMetadata,
  type UserAIKeys,
  ProviderConfigurationError,
  SUPPORTED_MODELS,
} from "../types";
import { createGeminiModel } from "./gemini";
import { createAnthropicModel } from "./anthropic";
import { createOpenAIModel } from "./openai";
import { createOllamaModel } from "./ollama";

/**
 * Resolves an AI language model instance based on configuration and credential hierarchy:
 * 1. Explicit config.apiKey
 * 2. User-provided encrypted/decrypted key from userAISettings
 * 3. System environment fallback (GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY)
 * 4. Throws ProviderConfigurationError if unconfigured
 */
export function resolveLanguageModel(
  config: AIModelConfig,
  userKeys?: UserAIKeys
): LanguageModelV1 {
  const provider = config.provider;

  switch (provider) {
    case "google": {
      const apiKey =
        config.apiKey || userKeys?.geminiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new ProviderConfigurationError("google");
      }
      return createGeminiModel(config.model, {
        apiKey,
        baseURL: config.baseURL,
      });
    }

    case "anthropic": {
      const apiKey =
        config.apiKey ||
        userKeys?.anthropicKey ||
        process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new ProviderConfigurationError("anthropic");
      }
      return createAnthropicModel(config.model, {
        apiKey,
        baseURL: config.baseURL,
      });
    }

    case "openai": {
      const apiKey =
        config.apiKey || userKeys?.openaiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new ProviderConfigurationError("openai");
      }
      return createOpenAIModel(config.model, {
        apiKey,
        baseURL: config.baseURL,
      });
    }

    case "ollama": {
      const baseURL =
        config.baseURL ||
        userKeys?.ollamaBaseUrl ||
        process.env.OLLAMA_BASE_URL ||
        "http://localhost:11434/v1";
      return createOllamaModel(config.model, { baseURL });
    }

    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported AI provider: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Tests connection to a given provider by dispatching a lightweight prompt.
 */
export async function verifyProviderConnection(
  provider: AIProviderName,
  model: string,
  apiKey?: string,
  baseURL?: string
): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const languageModel = resolveLanguageModel(
      { provider, model, apiKey, baseURL },
      undefined
    );

    await generateText({
      model: languageModel,
      prompt: "ping",
      maxTokens: 5,
    });

    const latencyMs = Date.now() - start;
    return { success: true, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, latencyMs, error: errorMsg };
  }
}

/**
 * Returns configuration readiness for all supported providers given user keys and environment.
 */
export function getConfiguredProviders(
  userKeys?: UserAIKeys
): Record<AIProviderName, boolean> {
  return {
    google: Boolean(userKeys?.geminiKey || process.env.GEMINI_API_KEY),
    anthropic: Boolean(
      userKeys?.anthropicKey || process.env.ANTHROPIC_API_KEY
    ),
    openai: Boolean(userKeys?.openaiKey || process.env.OPENAI_API_KEY),
    ollama: true, // Local compute is always potentially reachable
  };
}

/**
 * Returns metadata for all supported models.
 */
export function getSupportedModelsList(): ModelMetadata[] {
  return Object.values(SUPPORTED_MODELS);
}
