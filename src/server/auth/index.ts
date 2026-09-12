import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passkey } from "@better-auth/passkey";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import * as authSchema from "@/server/db/schema/auth";
import { userPreferences } from "@/server/db/schema/preferences";
import { env, getAuthConfig } from "@/lib/env";
import { createAuditLog } from "@/server/audit";

// Server-only runtime protection: auth secrets & adapter must never be initialized in the browser
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Authentication service cannot be initialized in the browser."
  );
}

const authConfig = getAuthConfig();

/**
 * Better Auth Server Instance for LifeOS
 * Configured with Drizzle ORM adapter on existing database pool,
 * 30-day sliding session policy, single-user registration auto-lock,
 * passkey plugin, and secure HTTP-only cookies.
 */
export const auth = betterAuth({
  appName: "LifeOS",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  session: {
    expiresIn: 30 * 24 * 60 * 60, // 30 days in seconds
    updateAge: 24 * 60 * 60, // Sliding window: renew session if older than 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes cache
    },
  },
  plugins: [
    passkey({
      rpID: authConfig.rpID,
      origin: authConfig.origin,
      rpName: "LifeOS",
    }),
  ],
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Decision D-01: Single-user auto-lock
      // The first registered user claims ownership of LifeOS.
      // Subsequent sign-up requests are rejected immediately with 403 Forbidden.
      if (ctx.path.startsWith("/sign-up")) {
        const existing = await db
          .select({ id: authSchema.user.id })
          .from(authSchema.user)
          .limit(1);

        if (existing.length > 0) {
          throw new APIError("FORBIDDEN", {
            message: "Registration is closed. LifeOS is configured for single-user mode.",
          });
        }
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          // Defense-in-depth: database-level check for single-user auto-lock
          const existing = await db
            .select({ id: authSchema.user.id })
            .from(authSchema.user)
            .limit(1);

          if (existing.length > 0) {
            throw new APIError("FORBIDDEN", {
              message: "Registration is closed. LifeOS is configured for single-user mode.",
            });
          }
          return { data: newUser };
        },
        after: async (createdUser) => {
          // Automatically initialize default preferences for the new owner
          try {
            await db
              .insert(userPreferences)
              .values({
                userId: createdUser.id,
                theme: "dark",
                dateFormat: "YYYY-MM-DD",
                timeFormat: "24h",
                workingHoursStart: "09:00",
                workingHoursEnd: "18:00",
              })
              .onConflictDoNothing();
          } catch (err) {
            console.error("Failed to initialize user preferences upon registration:", err);
          }

          // Record registration in audit log
          await createAuditLog({
            userId: createdUser.id,
            category: "auth",
            action: "user.registered",
            status: "success",
            actor: `user:${createdUser.id}`,
            details: { email: createdUser.email },
          });
        },
      },
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
