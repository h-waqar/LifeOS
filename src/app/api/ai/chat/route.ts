import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import {
  requireAuthenticatedUser,
  AuthenticationError,
} from "@/server/auth/guard";
import {
  createConversation,
  getConversation,
  createMessage,
} from "@/server/ai/conversation-service";
import { assembleContext } from "@/server/ai/context/engine";
import { resolveLanguageModel } from "@/server/ai/providers/registry";
import { getAISettings, getDecryptedAIKeys } from "@/server/ai/settings-service";
import { toAiSdkTools } from "@/server/ai/tools/registry";
import { retrievePersonalContext } from "@/server/ai/rag/retrieval-service";
import { type AIProviderName } from "@/server/ai/types";
import { checkRateLimit } from "@/server/ai/rate-limiter";
import type { CoreMessage } from "ai";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

/**
 * POST /api/ai/chat
 * Real-time streaming conversational assistant endpoint.
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { user } = await requireAuthenticatedUser(req);

    // Rate limiting check
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Maximum 20 requests per minute.",
          code: "RATE_LIMIT_EXCEEDED",
        },
        { status: 429, headers: SECURITY_CACHE_HEADERS }
      );
    }

    const body = await req.json();
    const {
      messages = [],
      conversationId: providedConvId,
      modelProvider,
      modelId,
    } = body;

    // 1. Resolve or create active conversation
    let conversationId = providedConvId;
    if (conversationId) {
      try {
        await getConversation(user.id, conversationId);
      } catch {
        conversationId = undefined;
      }
    }

    if (!conversationId) {
      const newConv = await createConversation(user.id, {
        title: "New Conversation",
        provider: (modelProvider as AIProviderName) ?? undefined,
        model: modelId ?? undefined,
      });
      conversationId = newConv.id;
    }

    // 2. Persist the incoming latest user message
    const lastUserMsg = messages
      .slice()
      .reverse()
      .find((m: any) => m.role === "user");

    if (lastUserMsg && lastUserMsg.content) {
      await createMessage(user.id, conversationId, {
        role: "user",
        content: lastUserMsg.content,
      });
    }

    // 3. Optional RAG context retrieval
    let retrievedXml: string | undefined;
    if (lastUserMsg?.content) {
      try {
        const ragResult = await retrievePersonalContext(user.id, lastUserMsg.content);
        if (ragResult.formattedXml) {
          retrievedXml = ragResult.formattedXml;
        }
      } catch (err) {
        console.error("RAG retrieval failed gracefully:", err);
      }
    }

    // 4. Assemble dynamic context (system prompt, temporal grounding, RAG retrieval, history)
    const assembled = await assembleContext({
      userId: user.id,
      conversationId,
      retrievedContextXml: retrievedXml,
    });

    // 5. Resolve AI model credentials
    const userSettings = await getAISettings(user.id);
    const userKeys = await getDecryptedAIKeys(user.id);
    const targetProvider = (modelProvider as AIProviderName) || userSettings.defaultProvider;
    const targetModel = modelId || userSettings.defaultModel;

    const model = resolveLanguageModel(
      {
        provider: targetProvider,
        model: targetModel,
      },
      userKeys
    );

    // 6. Build executable tools with authenticated context and confirmation gating
    const tools = toAiSdkTools({
      userId: user.id,
      conversationId,
    });

    // 7. Invoke streaming text generation
    const stream = streamText({
      model,
      system: assembled.systemPrompt,
      messages: assembled.messages as CoreMessage[],
      tools,
      maxSteps: 5,
      onFinish: async ({ text, usage }) => {
        if (text && text.trim().length > 0) {
          try {
            await createMessage(user.id, conversationId, {
              role: "assistant",
              content: text,
              tokenCount: usage?.totalTokens,
            });
          } catch (e) {
            console.error("Failed to save assistant stream completion:", e);
          }
        }
      },
    });

    const response = stream.toDataStreamResponse();
    response.headers.set("X-Conversation-Id", conversationId);
    return response;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }

    console.error("POST /api/ai/chat error:", error);
    return NextResponse.json(
      {
        error: (error as Error)?.message || "Failed to process AI chat stream",
        code: "CHAT_STREAM_ERROR",
      },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
