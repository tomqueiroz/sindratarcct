import { defineConfig } from "vitest/config";
import path from "node:path";

// Client-side test config. happy-dom (already in devDeps) is preferred over
// jsdom: smaller install footprint, ~3x faster startup, and the smoke / unit
// tests we run here don't depend on jsdom-only behavior.
//
// Includes the existing `lib/api-base.test.ts` plus any `src/__tests__/**`
// the agent (or scaffold) adds later. T2 (frontend smoke) lives under
// `src/__tests__/app.smoke.test.tsx`.
export default defineConfig({
  define: {
    __ROUTE_MESSAGING_ENABLED__: "true"
  },
  test: {
    name: "client",
    environment: "happy-dom",
    include: ["lib/**/*.test.ts", "src/**/*.test.{ts,tsx}", "src/__tests__/**/*.test.{ts,tsx}"],
    globals: false
  },
  resolve: {
    alias: [
      {
        find: /^@repo\/shared\/crm-activity$/,
        replacement: path.resolve(__dirname, "../../packages/shared/src/crm-activity.ts")
      },
      {
        find: /^@repo\/shared$/,
        replacement: path.resolve(__dirname, "../../packages/shared/src/index.ts")
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src")
      },
      {
        find: "react-router-dom",
        replacement: path.resolve(__dirname, "./src/lib/react-router-dom-proxy.tsx")
      },
      {
        find: "react-router-dom-original",
        replacement: "react-router-dom"
      }
    ]
  }
});
