import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Boots an isolated embedded PostgreSQL (test DB only) before any test.
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup-env.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Services import "server-only" (a Next.js bundler guard) — stub it.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
