import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { backupService } from "@/server/integrations/backup/service";
import { createBackupSchema } from "@/server/integrations/backup/types";

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(req);
    let body = {};
    try {
      body = await req.json();
    } catch {
      // Empty body allowed
    }
    const validated = createBackupSchema.parse(body);

    const backup = await backupService.createBackup(user.id, validated, user.id);
    return NextResponse.json({ success: true, backup });
  } catch (err: any) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const status = err.status || (err.name === "ZodError" ? 400 : 500);
    return NextResponse.json(
      { error: err.message || "Failed to create backup" },
      { status }
    );
  }
}
