import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { githubService } from "@/server/integrations/github/service";

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(req);
    await githubService.disconnect(user.id, user.id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const status = err.status || 500;
    return NextResponse.json(
      { error: err.message || "Failed to disconnect GitHub account" },
      { status }
    );
  }
}
