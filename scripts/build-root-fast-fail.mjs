#!/usr/bin/env node
console.error("Root build is intentionally disabled for the self-host website template.");
console.error("Do not run `npm build`, `npm run build`, or `pnpm build` at the repository root.");
console.error("Use `pnpm lint`, focused workspace checks, and the platform website validate/deploy flow instead.");
process.exitCode = 1;
