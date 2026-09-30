import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { githubService } from "@/server/integrations/github/service";
import { connectGitHubSchema } from "@/server/integrations/github/types";

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const body = await req.json();
    const validated = connectGitHubSchema.parse(body);

    const connection = await githubService.connectWithToken(user.id, validated, user.id);
    return NextResponse.json({ success: true, connection });
  } catch (err: any) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const status = err.status || (err.name === "ZodError" ? 400 : 500);
    return NextResponse.json(
      { error: err.message || "Failed to connect GitHub account" },
      { status }
    );
  }
}
