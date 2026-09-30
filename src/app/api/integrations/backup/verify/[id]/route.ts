import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { backupService } from "@/server/integrations/backup/service";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const params = await props.params;
    const backupId = params.id;

    const result = await backupService.verifyBackup(user.id, backupId);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const status = err.status || 500;
    return NextResponse.json(
      { error: err.message || "Failed to verify backup" },
      { status }
    );
  }
}
