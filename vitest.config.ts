// Root vitest config — registers the workspace projects. Vitest 4.x replaced
// the standalone vitest.workspace.ts file with `test.projects` inside the
// root config. Each entry points at a workspace-local vitest.config.ts which
// owns its own environment + include patterns.
//
// Run all:        `pnpm test`
// Filter project: `pnpm vitest run --project=server`  /  `--project=client`
// Filter path:    `pnpm vitest run apps/server/_test/infra`
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "./apps/client/vitest.config.ts",
      "./apps/server/vitest.config.ts"
    ]
  }
});
