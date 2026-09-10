import { z } from "zod";
import dotenv from "dotenv";

// Server-only runtime protection: secrets must never leak to browser clients
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Server-only environment configuration cannot be imported in the browser."
  );
}

// Load .env.local if present, then default .env
dotenv.config({ path: ".env.local" });
dotenv.config();

export const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((val) => {
      try {
        const u = new URL(val);
        const hasValidProtocol =
          u.protocol === "postgresql:" || u.protocol === "postgres:";
        const hasHost = Boolean(u.host && u.host.length > 0);
        return hasValidProtocol && hasHost;
      } catch {
        return false;
      }
    }, "DATABASE_URL must be a valid PostgreSQL connection URL (protocol must be postgresql:// or postgres://)"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters long"),
  BETTER_AUTH_URL: z.string().url("BETTER_AUTH_URL must be a valid URL"),
  LIFEOS_ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      "LIFEOS_ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes)"
    ),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === "production" && !data.BETTER_AUTH_URL.startsWith("https://")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["BETTER_AUTH_URL"],
      message: "BETTER_AUTH_URL must use https in production",
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(data: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(data);
  if (!result.success) {
    console.error(
      "❌ Invalid environment variables:",
      JSON.stringify(result.error.format(), null, 2)
    );
    throw new Error(
      `Invalid environment configuration: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`
    );
  }
  return result.data;
}

export const env = parseEnv(process.env);

export function getAuthConfig() {
  const isProd = env.NODE_ENV === "production";
  const url = new URL(env.BETTER_AUTH_URL);
  return {
    rpID: isProd ? url.hostname : "localhost",
    origin: isProd ? [env.BETTER_AUTH_URL] : ["http://localhost:3000"],
  };
}
