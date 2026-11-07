import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: "server",
    environment: "node",
    setupFiles: ["./_test/setup.ts"],
    include: ["_test/infra/**/*.test.ts", "__tests__/**/*.test.ts"],
    // T4-infra and integration tests share the in-memory libsql DB cached in
    // _core/db.ts — running them in the same worker keeps that cache hot and
    // avoids "each file applies migrations again" churn. Each *.test.ts file
    // still runs in a fresh Vitest worker (default isolate=true), which gives
    // us a fresh module load and a fresh :memory: DB between files.
    pool: "forks",
    // 10s per test is enough for libsql in-memory; signUp/signIn round-trips
    // are sub-100ms. Anything slower is a real bug.
    testTimeout: 10000
  },
  resolve: {
    // Resolve `@repo/shared` and `@repo/shared/http` to the package source.
    // Mirror packages/shared/package.json "exports" so deep-path imports
    // (`@repo/shared/http`) work without a build step.
    alias: [
      {
        find: /^@repo\/shared\/http$/,
        replacement: path.resolve(__dirname, "../../packages/shared/src/http.ts")
      },
      {
        find: /^@repo\/shared\/crm-activity$/,
        replacement: path.resolve(__dirname, "../../packages/shared/src/crm-activity.ts")
      },
      {
        find: /^@repo\/shared$/,
        replacement: path.resolve(__dirname, "../../packages/shared/src/index.ts")
      }
    ]
  }
});
