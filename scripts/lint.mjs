import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("..", import.meta.url);
const cacheDir = process.env.OMA_LINT_CACHE_DIR || `${fileURLToPath(projectRoot)}/.cache/lint`;
const crmTemplateAssetsRoot = fileURLToPath(
  new URL("../.skywork/business-template-assets/crm", import.meta.url)
);
const crmTemplateChecks = existsSync(crmTemplateAssetsRoot)
  ? [
      {
        name: "crm-template-assets",
        args: ["exec", "node", "scripts/check-crm-template-assets.mjs"]
      },
      {
        name: "crm-state-inspector",
        args: [
          "exec",
          "node",
          ".skywork/business-template-assets/crm/validation/inspect-crm-state.test.mjs"
        ]
      }
    ]
  : [];

const checks = [
  {
    name: "agents-contract",
    args: ["run", "check:contract"]
  },
  ...crmTemplateChecks,
  {
    name: "client-eslint",
    args: ["--filter", "client", "exec", "eslint", ".", "--cache", "--cache-location", `${cacheDir}/client-eslintcache`]
  },
  {
    name: "server-eslint",
    args: ["--filter", "server", "exec", "eslint", ".", "--cache", "--cache-location", `${cacheDir}/server-eslintcache`]
  },
  {
    name: "client-types",
    captureOutput: true,
    args: [
      "exec",
      "tsc",
      "-p",
      "apps/client/tsconfig.app.json",
      "--noEmit",
      "--incremental",
      "--tsBuildInfoFile",
      `${cacheDir}/client.tsbuildinfo`
    ]
  },
  {
    name: "server-types",
    args: [
      "exec",
      "tsc",
      "-p",
      "apps/server/tsconfig.json",
      "--noEmit",
      "--incremental",
      "--tsBuildInfoFile",
      `${cacheDir}/server.tsbuildinfo`
    ]
  }
];

function runCheck(check) {
  return new Promise((resolve) => {
    console.log(`\n> lint:${check.name}`);

    const captureOutput = check.captureOutput === true;
    const chunks = [];
    const child = spawn("pnpm", check.args, {
      cwd: projectRoot,
      shell: process.platform === "win32",
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit"
    });

    if (captureOutput) {
      child.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
        chunks.push(Buffer.from(chunk));
      });
      child.stderr.on("data", (chunk) => {
        process.stderr.write(chunk);
        chunks.push(Buffer.from(chunk));
      });
    }

    child.on("close", (code) => {
      const output = Buffer.concat(chunks).toString("utf8");
      if (check.name === "client-types" && code !== 0 && output.includes("TS7031")) {
        console.error("[lint:client-types] skywork-ts7031-hint: v1");
        console.error("[lint:client-types] TS7031 means a destructured callback parameter is implicitly any under strict/noImplicitAny.");
        console.error("[lint:client-types] Add an explicit parameter annotation wherever contextual typing is missing, e.g. ({ isActive }: { isActive: boolean }) => ... or ({ item }: { item: Product }) => ....");
      }
      resolve(code ?? 1);
    });

    child.on("error", (error) => {
      console.error(`[lint:${check.name}] ${error.message}`);
      resolve(1);
    });
  });
}

const results = [];

await mkdir(cacheDir, { recursive: true });

for (const check of checks) {
  const code = await runCheck(check);
  results.push({ ...check, code });
}

const failed = results.filter((result) => result.code !== 0);

if (failed.length > 0) {
  console.error(`\nLint failed: ${failed.map((result) => result.name).join(", ")}`);
  process.exit(1);
}

console.log("\nLint passed.");
