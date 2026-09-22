import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requireAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth/guard";
import {
  createCategory,
  listCategories,
} from "@/server/finance/category-service";

export const dynamic = "force-dynamic";

const SECURITY_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
} as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);

    const typeParam = searchParams.get("type");
    const categoryType =
      typeParam === "income" || typeParam === "expense"
        ? (typeParam as "income" | "expense")
        : undefined;
    const includeArchived = searchParams.get("includeArchived") === "true";

    const categories = await listCategories(user.id, {
      type: categoryType,
      includeArchived,
    });

    return NextResponse.json(
      { categories, data: categories },
      { status: 200, headers: SECURITY_CACHE_HEADERS }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403, headers: SECURITY_CACHE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser(req);
    const body = await req.json();

    const category = await createCategory(user.id, body);

    return NextResponse.json(
      { category, data: category },
      { status: 201, headers: SECURITY_CACHE_HEADERS }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403, headers: SECURITY_CACHE_HEADERS }
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400, headers: SECURITY_CACHE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: SECURITY_CACHE_HEADERS }
    );
  }
}
