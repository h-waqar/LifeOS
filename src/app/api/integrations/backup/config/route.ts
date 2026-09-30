import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import { backupService } from "@/server/integrations/backup/service";
import { backupConfigSchema } from "@/server/integrations/backup/types";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const config = await backupService.getConfig(user.id);
    return NextResponse.json({ config });
  } catch (err: any) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const status = err.status || 500;
    return NextResponse.json(
      { error: err.message || "Failed to fetch backup configuration" },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const body = await req.json();
    const validated = backupConfigSchema.parse(body);

    const config = await backupService.configure(user.id, validated, user.id);
    return NextResponse.json({ success: true, config });
  } catch (err: any) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const status = err.status || (err.name === "ZodError" ? 400 : 500);
    return NextResponse.json(
      { error: err.message || "Failed to update backup configuration" },
      { status }
    );
  }
}
