import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveLanguageModel,
  getConfiguredProviders,
  getSupportedModelsList,
} from "@/server/ai/providers/registry";
import {
  ProviderConfigurationError,
  calculateTokenCost,
  maskApiKey,
  SUPPORTED_MODELS,
} from "@/server/ai/types";

describe("Phase 6 Plan 06-01: AI Provider Registry & Model Resolution (Unit)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear AI env vars before each test to ensure test isolation
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OLLAMA_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("1. Resolves Google Gemini model instance with user-provided key", () => {
    const model = resolveLanguageModel(
      { provider: "google", model: "gemini-2.5-flash" },
      { geminiKey: "AIzaSy_fake_test_key_12345" }
    );
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gemini-2.5-flash");
    expect(model.provider).toBe("google.generative-ai");
  });

  it("2. Resolves Anthropic Claude model instance with user-provided key", () => {
    const model = resolveLanguageModel(
      { provider: "anthropic", model: "claude-3-7-sonnet" },
      { anthropicKey: "sk-ant-fake_test_key_12345" }
    );
    expect(model).toBeDefined();
    expect(model.modelId).toBe("claude-3-7-sonnet");
    expect(model.provider).toBe("anthropic.messages");
  });

  it("3. Resolves OpenAI model instance with user-provided key", () => {
    const model = resolveLanguageModel(
      { provider: "openai", model: "gpt-4o" },
      { openaiKey: "sk-openai_fake_test_key_12345" }
    );
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gpt-4o");
    expect(model.provider).toBe("openai.chat");
  });

  it("4. Resolves local Ollama model instance using OpenAI-compatible client", () => {
    const model = resolveLanguageModel(
      { provider: "ollama", model: "llama3.3" },
      { ollamaBaseUrl: "http://localhost:11434/v1" }
    );
    expect(model).toBeDefined();
    expect(model.modelId).toBe("llama3.3");
    expect(model.provider).toBe("openai.chat");
  });

  it("5. Throws typed ProviderConfigurationError when credentials are completely missing", () => {
    expect(() =>
      resolveLanguageModel(
        { provider: "google", model: "gemini-2.5-flash" },
        {}
      )
    ).toThrow(ProviderConfigurationError);

    expect(() =>
      resolveLanguageModel(
        { provider: "anthropic", model: "claude-3-7-sonnet" },
        {}
      )
    ).toThrow(ProviderConfigurationError);

    expect(() =>
      resolveLanguageModel({ provider: "openai", model: "gpt-4o" }, {})
    ).toThrow(ProviderConfigurationError);
  });

  it("6. Falls back gracefully from missing user key to system environment variable", () => {
    process.env.GEMINI_API_KEY = "env_gemini_fallback_key_999";
    const model = resolveLanguageModel(
      { provider: "google", model: "gemini-2.5-flash" },
      { geminiKey: null }
    );
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gemini-2.5-flash");
  });

  it("7. Precedence: explicit config.apiKey overrides userKeys and env vars", () => {
    process.env.OPENAI_API_KEY = "env_key";
    const model = resolveLanguageModel(
      {
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "override_config_key",
      },
      { openaiKey: "user_setting_key" }
    );
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gpt-4o-mini");
  });

  it("8. Precedence: userKeys overrides environment variable", () => {
    process.env.ANTHROPIC_API_KEY = "env_key";
    const model = resolveLanguageModel(
      { provider: "anthropic", model: "claude-3-5-haiku" },
      { anthropicKey: "user_preferred_key" }
    );
    expect(model).toBeDefined();
    expect(model.modelId).toBe("claude-3-5-haiku");
  });

  it("9. Key Masking: masks credentials safely without leaking secrets", () => {
    expect(maskApiKey(null)).toBeNull();
    expect(maskApiKey(undefined)).toBeNull();
    expect(maskApiKey("short")).toBe("••••••••");
    expect(maskApiKey("sk-ant-api03-abcdefghijklmnop1234")).toBe(
      "sk-a...1234"
    );
    expect(maskApiKey("AIzaSyTestApiKey4567890")).toBe("AIza...7890");
  });

  it("10. Token Usage Cost Calculator: deterministically scores costs", () => {
    // gemini-2.5-flash: $0.15/1M in, $0.60/1M out
    const flashCost = calculateTokenCost("gemini-2.5-flash", 1_000_000, 1_000_000);
    expect(flashCost).toBe(0.75);

    // claude-3-7-sonnet: $3.00/1M in, $15.00/1M out
    const sonnetCost = calculateTokenCost("claude-3-7-sonnet", 100_000, 10_000);
    // (100k/1M)*3 + (10k/1M)*15 = 0.3 + 0.15 = 0.45
    expect(sonnetCost).toBe(0.45);

    // ollama: $0.00
    const ollamaCost = calculateTokenCost("llama3.3", 500_000, 500_000);
    expect(ollamaCost).toBe(0);

    // unknown model: $0.00
    const unknownCost = calculateTokenCost("unknown-model", 100, 100);
    expect(unknownCost).toBe(0);
  });

  it("11. Supported Models Catalog: returns complete catalog with valid metadata", () => {
    const list = getSupportedModelsList();
    expect(list.length).toBeGreaterThanOrEqual(9);

    const modelIds = list.map((m) => m.id);
    expect(modelIds).toContain("gemini-2.5-flash");
    expect(modelIds).toContain("gemini-2.5-pro");
    expect(modelIds).toContain("claude-3-7-sonnet");
    expect(modelIds).toContain("claude-3-5-haiku");
    expect(modelIds).toContain("gpt-4o");
    expect(modelIds).toContain("gpt-4o-mini");
    expect(modelIds).toContain("llama3.3");
    expect(modelIds).toContain("qwen2.5");
    expect(modelIds).toContain("mistral");
  });

  it("12. Provider Configuration Status: accurately tracks readiness", () => {
    // Completely empty
    const unconfigured = getConfiguredProviders({});
    expect(unconfigured.google).toBe(false);
    expect(unconfigured.anthropic).toBe(false);
    expect(unconfigured.openai).toBe(false);
    expect(unconfigured.ollama).toBe(true);

    // With user keys
    const configured = getConfiguredProviders({
      geminiKey: "key1",
      anthropicKey: "key2",
    });
    expect(configured.google).toBe(true);
    expect(configured.anthropic).toBe(true);
    expect(configured.openai).toBe(false);
  });
});
