// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { probeDatabase, type ProbeResult } from "../../phase-01/plan-02/db-probe";
import { db, closeDatabase } from "@/server/db";
import { user } from "@/server/db/schema/auth";
import { userAISettings } from "@/server/db/schema/ai";
import { auth } from "@/server/auth";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import {
  getAISettings,
  getDecryptedAIKeys,
  updateAISettings,
} from "@/server/ai/settings-service";
import { GET as modelsGet } from "@/app/api/ai/models/route";
import { GET as settingsGet, POST as settingsPost } from "@/app/api/ai/settings/route";

describe("Phase 6 Plan 06-01: AI Settings & Multi-Tenant Credential Storage (Integration)", () => {
  let probe: ProbeResult;

  const userA = {
    email: "p06_plan01_user_a@example.com",
    password: "Plan06UserAPassword123!",
    name: "User A",
  };

  const foreignUserId = crypto.randomUUID();

  let userAId: string;
  let userACookie: string;

  function createAuthRequest(url: string, cookie: string, init?: RequestInit): NextRequest {
    const headers = new Headers(init?.headers);
    headers.set("cookie", cookie);
    return new NextRequest(url, { ...init, headers } as any);
  }

  function createUnauthRequest(url: string, init?: RequestInit): NextRequest {
    return new NextRequest(url, init as any);
  }

  beforeAll(async () => {
    probe = await probeDatabase();
    if (!probe.isAvailable) return;

    // Clean up test data
    await db.delete(user);

    // Create User A
    const resA = await auth.api.signUpEmail({
      body: userA,
      asResponse: true,
    });
    expect(resA.status).toBe(200);
    const matchA = resA.headers.get("set-cookie")!.match(/better-auth\.session_token=([^;]+)/);
    userACookie = `better-auth.session_token=${matchA![1]}`;

    const [dbUserA] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, userA.email));
    userAId = dbUserA.id;
  });

  afterAll(async () => {
    if (probe?.isAvailable) {
      await db.delete(user);
      await closeDatabase();
    }
  });

  it("1. Unauthenticated requests to /api/ai/models fail closed with 401", async () => {
    if (!probe.isAvailable) return;

    const req = createUnauthRequest("http://localhost:3000/api/ai/models");
    const res = await modelsGet(req);
    expect(res.status).toBe(401);
  });

  it("2. Unauthenticated requests to /api/ai/settings fail closed with 401", async () => {
    if (!probe.isAvailable) return;

    const req = createUnauthRequest("http://localhost:3000/api/ai/settings");
    const res = await settingsGet(req);
    expect(res.status).toBe(401);
  });

  it("3. Authenticated user can save encrypted credentials to database", async () => {
    if (!probe.isAvailable) return;

    const rawKey = "AIzaSySuperSecretGeminiKey123456789";
    const updated = await updateAISettings(userAId, {
      defaultProvider: "google",
      defaultModel: "gemini-2.5-pro",
      geminiKey: rawKey,
      temperature: 0.85,
    });

    // Masked returned object
    expect(updated.defaultProvider).toBe("google");
    expect(updated.defaultModel).toBe("gemini-2.5-pro");
    expect(updated.hasGeminiKey).toBe(true);
    expect(updated.maskedGeminiKey).toBe("AIza...6789");
    expect(updated.maskedGeminiKey).not.toContain("SuperSecretGeminiKey");

    // Inspect database row directly: must be encrypted at rest with v1 AES-256-GCM format
    const [row] = await db
      .select()
      .from(userAISettings)
      .where(eq(userAISettings.userId, userAId));

    expect(row).toBeDefined();
    expect(row.encryptedGeminiKey).toBeTruthy();
    expect(row.encryptedGeminiKey).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+/);
    expect(row.encryptedGeminiKey).not.toContain(rawKey);

    // Internal server decryption recovers original key accurately
    const decryptedKeys = await getDecryptedAIKeys(userAId);
    expect(decryptedKeys.geminiKey).toBe(rawKey);
  });

  it("4. Multi-Tenant Isolation: Foreign user cannot access or read User A's encrypted keys", async () => {
    if (!probe.isAvailable) return;

    // Check User A settings (configured in previous test)
    const userASettings = await getAISettings(userAId);
    expect(userASettings.hasGeminiKey).toBe(true);
    expect(userASettings.maskedGeminiKey).toBe("AIza...6789");

    // Check foreign user settings: must be unconfigured defaults with zero leaked keys
    const foreignSettings = await getAISettings(foreignUserId);
    expect(foreignSettings.hasGeminiKey).toBe(false);
    expect(foreignSettings.maskedGeminiKey).toBeNull();
    expect(foreignSettings.hasAnthropicKey).toBe(false);
    expect(foreignSettings.maskedAnthropicKey).toBeNull();
    expect(foreignSettings.hasOpenAIKey).toBe(false);
    expect(foreignSettings.maskedOpenAIKey).toBeNull();

    // Server-level decrypted keys isolation: foreign user has strictly null keys
    const foreignKeys = await getDecryptedAIKeys(foreignUserId);
    expect(foreignKeys.geminiKey).toBeNull();
    expect(foreignKeys.anthropicKey).toBeNull();
    expect(foreignKeys.openaiKey).toBeNull();

    // User A's decrypted keys remain intact
    const userAKeys = await getDecryptedAIKeys(userAId);
    expect(userAKeys.geminiKey).toBe("AIzaSySuperSecretGeminiKey123456789");
  });

  it("5. Endpoint /api/ai/models returns supported models and active provider state", async () => {
    if (!probe.isAvailable) return;

    const req = createAuthRequest("http://localhost:3000/api/ai/models", userACookie);
    const res = await modelsGet(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.models).toBeInstanceOf(Array);
    expect(body.models.length).toBeGreaterThanOrEqual(9);
    expect(body.defaultProvider).toBe("google");
    expect(body.defaultModel).toBe("gemini-2.5-pro");
    expect(body.configuredProviders.google).toBe(true);
  });

  it("6. Endpoint /api/ai/settings GET and POST operate with session authentication", async () => {
    if (!probe.isAvailable) return;

    // GET settings for User A
    const getReq = createAuthRequest("http://localhost:3000/api/ai/settings", userACookie);
    const getRes = await settingsGet(getReq);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.data.defaultProvider).toBe("google");
    expect(getBody.data.maskedGeminiKey).toBe("AIza...6789");

    // POST update settings for User A to configure Anthropic
    const postReq = createAuthRequest("http://localhost:3000/api/ai/settings", userACookie, {
      method: "POST",
      body: JSON.stringify({
        defaultProvider: "anthropic",
        defaultModel: "claude-3-7-sonnet",
        anthropicKey: "sk-ant-userA-secret-key-123456789",
      }),
    });
    const postRes = await settingsPost(postReq);
    expect(postRes.status).toBe(200);

    const postBody = await postRes.json();
    expect(postBody.data.defaultProvider).toBe("anthropic");
    expect(postBody.data.defaultModel).toBe("claude-3-7-sonnet");
    expect(postBody.data.hasAnthropicKey).toBe(true);
    expect(postBody.data.maskedAnthropicKey).toBe("sk-a...6789");

    // Verify key was masked and plaintext never leaks in API response
    expect(JSON.stringify(postBody)).not.toContain("secret-key");
  });
});
