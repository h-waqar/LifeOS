import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { githubService } from "@/server/integrations/github/service";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const connection = await githubService.getConnection(user.id);
    return NextResponse.json(connection);
  } catch (err: any) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const status = err.status || 500;
    return NextResponse.json(
      { error: err.message || "Failed to fetch GitHub connection status" },
      { status }
    );
  }
}
