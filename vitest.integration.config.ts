import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react() as any],
  test: {
    environment: "node",
    globals: true,
    include: ["scripts/tests/**/*.integration.test.ts"],
    testTimeout: 30000,
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.DATABASE_URL ||
        "postgresql://lifeos:lifeos_password@localhost:5432/lifeos",
      BETTER_AUTH_SECRET:
        "test_secret_at_least_32_characters_long_for_auth_testing",
      BETTER_AUTH_URL: "http://localhost:3000",
      LIFEOS_ENCRYPTION_KEY:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
  },
});
