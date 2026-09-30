import { eq } from "drizzle-orm";
import { db } from "../db";
import { userAISettings } from "../db/schema/ai";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import {
  type AIProviderName,
  type MaskedAISettings,
  type UpdateAISettingsInput,
  type UserAIKeys,
  maskApiKey,
  updateAISettingsSchema,
} from "./types";

/**
 * Retrieves masked AI settings for the client browser. Plaintext keys are NEVER returned.
 */
export async function getAISettings(userId: string): Promise<MaskedAISettings> {
  const [row] = await db
    .select()
    .from(userAISettings)
    .where(eq(userAISettings.userId, userId))
    .limit(1);

  if (!row) {
    return {
      defaultProvider: "google",
      defaultModel: "gemini-2.5-flash",
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
      maskedGeminiKey: null,
      maskedAnthropicKey: null,
      maskedOpenAIKey: null,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || null,
      temperature: 0.7,
    };
  }

  let decryptedGemini: string | null = null;
  let decryptedAnthropic: string | null = null;
  let decryptedOpenAI: string | null = null;

  if (row.encryptedGeminiKey) {
    try {
      decryptedGemini = decryptSecret(row.encryptedGeminiKey);
    } catch {
      decryptedGemini = null;
    }
  }

  if (row.encryptedAnthropicKey) {
    try {
      decryptedAnthropic = decryptSecret(row.encryptedAnthropicKey);
    } catch {
      decryptedAnthropic = null;
    }
  }

  if (row.encryptedOpenAIKey) {
    try {
      decryptedOpenAI = decryptSecret(row.encryptedOpenAIKey);
    } catch {
      decryptedOpenAI = null;
    }
  }

  return {
    defaultProvider: row.defaultProvider as AIProviderName,
    defaultModel: row.defaultModel,
    hasGeminiKey: Boolean(row.encryptedGeminiKey || process.env.GEMINI_API_KEY),
    hasAnthropicKey: Boolean(
      row.encryptedAnthropicKey || process.env.ANTHROPIC_API_KEY
    ),
    hasOpenAIKey: Boolean(
      row.encryptedOpenAIKey || process.env.OPENAI_API_KEY
    ),
    maskedGeminiKey: maskApiKey(decryptedGemini),
    maskedAnthropicKey: maskApiKey(decryptedAnthropic),
    maskedOpenAIKey: maskApiKey(decryptedOpenAI),
    ollamaBaseUrl: row.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || null,
    temperature: row.temperature ? Number(row.temperature) : 0.7,
  };
}

/**
 * Retrieves decrypted API keys for server-side LLM instantiation only.
 */
export async function getDecryptedAIKeys(userId: string): Promise<UserAIKeys> {
  const [row] = await db
    .select()
    .from(userAISettings)
    .where(eq(userAISettings.userId, userId))
    .limit(1);

  if (!row) {
    return {
      geminiKey: null,
      anthropicKey: null,
      openaiKey: null,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || null,
    };
  }

  let geminiKey: string | null = null;
  let anthropicKey: string | null = null;
  let openaiKey: string | null = null;

  if (row.encryptedGeminiKey) {
    try {
      geminiKey = decryptSecret(row.encryptedGeminiKey);
    } catch (e) {
      console.error("[AI Settings] Failed to decrypt Gemini key", e);
    }
  }

  if (row.encryptedAnthropicKey) {
    try {
      anthropicKey = decryptSecret(row.encryptedAnthropicKey);
    } catch (e) {
      console.error("[AI Settings] Failed to decrypt Anthropic key", e);
    }
  }

  if (row.encryptedOpenAIKey) {
    try {
      openaiKey = decryptSecret(row.encryptedOpenAIKey);
    } catch (e) {
      console.error("[AI Settings] Failed to decrypt OpenAI key", e);
    }
  }

  return {
    geminiKey,
    anthropicKey,
    openaiKey,
    ollamaBaseUrl: row.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || null,
  };
}

/**
 * Updates AI settings and encrypts any provided credentials at rest.
 */
export async function updateAISettings(
  userId: string,
  rawInput: UpdateAISettingsInput
): Promise<MaskedAISettings> {
  const input = updateAISettingsSchema.parse(rawInput);

  const [existing] = await db
    .select()
    .from(userAISettings)
    .where(eq(userAISettings.userId, userId))
    .limit(1);

  const updates: Partial<typeof userAISettings.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.defaultProvider !== undefined) {
    updates.defaultProvider = input.defaultProvider;
  }
  if (input.defaultModel !== undefined) {
    updates.defaultModel = input.defaultModel;
  }
  if (input.temperature !== undefined) {
    updates.temperature = input.temperature.toFixed(2);
  }
  if (input.ollamaBaseUrl !== undefined) {
    updates.ollamaBaseUrl = input.ollamaBaseUrl;
  }

  if (input.geminiKey !== undefined) {
    updates.encryptedGeminiKey =
      input.geminiKey && input.geminiKey.trim().length > 0
        ? encryptSecret(input.geminiKey.trim())
        : null;
  }

  if (input.anthropicKey !== undefined) {
    updates.encryptedAnthropicKey =
      input.anthropicKey && input.anthropicKey.trim().length > 0
        ? encryptSecret(input.anthropicKey.trim())
        : null;
  }

  if (input.openaiKey !== undefined) {
    updates.encryptedOpenAIKey =
      input.openaiKey && input.openaiKey.trim().length > 0
        ? encryptSecret(input.openaiKey.trim())
        : null;
  }

  if (existing) {
    await db
      .update(userAISettings)
      .set(updates)
      .where(eq(userAISettings.userId, userId));
  } else {
    await db.insert(userAISettings).values({
      userId,
      defaultProvider: input.defaultProvider || "google",
      defaultModel: input.defaultModel || "gemini-2.5-flash",
      temperature: input.temperature ? input.temperature.toFixed(2) : "0.70",
      ollamaBaseUrl: input.ollamaBaseUrl || null,
      encryptedGeminiKey: updates.encryptedGeminiKey ?? null,
      encryptedAnthropicKey: updates.encryptedAnthropicKey ?? null,
      encryptedOpenAIKey: updates.encryptedOpenAIKey ?? null,
    });
  }

  return getAISettings(userId);
}
