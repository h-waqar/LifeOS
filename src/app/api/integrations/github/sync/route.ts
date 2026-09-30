import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { githubSyncEngine } from "@/server/integrations/github/sync-engine";
import { syncGitHubSchema } from "@/server/integrations/github/types";

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(req);
    let body = {};
    try {
      body = await req.json();
    } catch {
      // Empty body allowed
    }
    const validated = syncGitHubSchema.parse(body);

    const result = await githubSyncEngine.sync(user.id, validated);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const status = err.status || (err.name === "ZodError" ? 400 : 500);
    return NextResponse.json(
      { error: err.message || "Failed to synchronize GitHub activity" },
      { status }
    );
  }
}
