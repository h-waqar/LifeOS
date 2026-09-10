import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react() as any],
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["scripts/tests/**/*.test.ts", "scripts/tests/**/*.test.tsx"],
    exclude: ["**/*.integration.test.ts", "node_modules/**"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://lifeos:lifeos_password@localhost:5432/lifeos",
      BETTER_AUTH_SECRET: "test_secret_at_least_32_characters_long_for_auth_testing",
      BETTER_AUTH_URL: "http://localhost:3000",
      LIFEOS_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
  },
});
