import { spawnSync } from "node:child_process";

const steps = [
  ["sitemap-routes", ["node", "scripts/generate-sitemap-routes.mjs"]],
  ["prerender", ["node", "scripts/prerender.mjs"]],
];

for (const [name, command] of steps) {
  const [bin, ...args] = command;
  const result = spawnSync(bin, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });

  if (result.status !== 0) {
    const exitCode = result.status ?? "unknown";
    console.warn(`[postbuild] ${name} skipped or failed with exit code ${exitCode}`);
    break;
  }
}
