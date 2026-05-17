import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/tests/**/*.test.ts"],
    env: {
      // Test-only stubs so server modules load without throwing.
      // Real values come from .env.local at dev/build time.
      DATABASE_URL: "postgresql://test:test@localhost:5432/test?sslmode=require",
      DIRECT_URL: "postgresql://test:test@localhost:5432/test?sslmode=require",
      AUTH_SECRET: "test-secret-must-be-at-least-thirty-two-chars",
      NEXTAUTH_URL: "http://localhost:3000",
      AUTH_RESEND_KEY: "re_test_stub_key_for_unit_tests_only",
      EMAIL_FROM: "KickNScream <test@example.com>",
      AUTH_GOOGLE_ID: "test-google-id-stub-value",
      AUTH_GOOGLE_SECRET: "test-google-secret-stub-value",
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
