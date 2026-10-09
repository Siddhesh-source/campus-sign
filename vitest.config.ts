import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside a React Server environment.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    // Integration tests share one database.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://campusign:campusign@localhost:54329/campusign_test",
      SIGNING_KEK: "dGVzdC1rZWstMzItYnl0ZXMtZm9yLWNhbXB1c2lnbiE=",
      STORAGE_DIR: "./.test-storage",
      BETTER_AUTH_URL: "https://campussign.test",
    },
  },
});
