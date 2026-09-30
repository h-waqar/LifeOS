import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
} from "@/server/auth/guard";
import { getAISettings, getDecryptedAIKeys } from "@/server/ai/settings-service";
import {
  getSupportedModelsList,
  getConfiguredProviders,
} from "@/server/ai/providers/registry";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

/**
 * GET /api/ai/models
 * Returns available models, active default provider/model, and configuration readiness.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);

    const [settings, userKeys] = await Promise.all([
      getAISettings(user.id),
      getDecryptedAIKeys(user.id),
    ]);

    const configuredProviders = getConfiguredProviders(userKeys);
    const models = getSupportedModelsList();

    return NextResponse.json(
      {
        models,
        defaultProvider: settings.defaultProvider,
        defaultModel: settings.defaultModel,
        configuredProviders,
      },
      { status: 200, headers: SECURITY_CACHE_HEADERS }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }
    console.error("GET /api/ai/models error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
