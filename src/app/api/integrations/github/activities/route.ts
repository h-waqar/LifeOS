import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { githubActivityService } from "@/server/integrations/github/activity-service";
import { queryActivitiesSchema } from "@/server/integrations/github/types";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const url = new URL(req.url);
    const searchParamsObj = Object.fromEntries(url.searchParams.entries());
    const validated = queryActivitiesSchema.parse(searchParamsObj);

    const activities = await githubActivityService.listActivities(user.id, validated);
    return NextResponse.json({ activities });
  } catch (err: any) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const status = err.status || (err.name === "ZodError" ? 400 : 500);
    return NextResponse.json(
      { error: err.message || "Failed to query GitHub activities" },
      { status }
    );
  }
}
