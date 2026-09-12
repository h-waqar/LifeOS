import { auth } from "@/server/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Auth route handlers cannot be executed in the browser."
  );
}

/**
 * Better Auth Route Handlers
 * Exposes core auth endpoints (/api/auth/sign-in/email, /api/auth/sign-up/email,
 * /api/auth/sign-out, /api/auth/session, passkey endpoints, etc.)
 */
export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler(auth.handler);
