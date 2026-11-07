/// <reference types="vite/client" />
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import type { Hono } from "hono";

/**
 * Auto-discovery route registry.
 *
 * Every `apps/server/routes/<name>.route.ts` is discovered at build time and
 * mounted at `/api/<name>` (see `create-app.ts`). Nothing here, in
 * `create-app.ts`, or in `with-session.ts` needs editing to add a route — drop
 * a new `*.route.ts` file into `routes/` and it is wired automatically. This is
 * what lets feature overlays (e.g. Shopify's `commerce.route.ts`) light up with
 * zero manual wiring.
 *
 * Conventions a route module may follow:
 *   - Export the Hono router (any export name, or `default`). The first export
 *     that looks like a Hono instance is used.
 *   - `export const isPublic = true` to opt the route's `/api/<name>` prefix out
 *     of session auth (consumed by `with-session.ts`).
 */

type RouteModule = {
  default?: unknown;
  isPublic?: boolean;
  [key: string]: unknown;
};

export type RouteEntry = {
  /** Route base name derived from the file name, e.g. "auth-config". */
  name: string;
  /** Mount path, e.g. "/api/auth-config". */
  path: string;
  router: Hono;
  /** True when the module opted out of session auth via `isPublic`. */
  isPublic: boolean;
};

/**
 * Better-auth's handler lives inline in `create-app.ts` (it is not a route
 * module), so its prefix is always public and is seeded here.
 */
const ALWAYS_PUBLIC_PREFIXES = ["/api/auth"];

/**
 * Structural Hono check. A structural test (rather than `instanceof Hono`) keeps
 * discovery robust across the dual server builds and any duplicated Hono copies.
 */
function isHono(value: unknown): value is Hono {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { fetch?: unknown }).fetch === "function" &&
    typeof (value as { route?: unknown }).route === "function" &&
    typeof (value as { use?: unknown }).use === "function"
  );
}

function pickRouter(mod: RouteModule): Hono | null {
  if (isHono(mod.default)) {
    return mod.default;
  }
  for (const value of Object.values(mod)) {
    if (isHono(value)) {
      return value;
    }
  }
  return null;
}

function routeNameFromPath(filePath: string): string {
  return filePath.replace(/^.*\/routes\//, "").replace(/\.route\.[tj]s$/, "");
}

let modules: Record<string, RouteModule>;

try {
  modules = import.meta.glob<RouteModule>("../routes/*.route.ts", { eager: true });
} catch {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const routesDir = resolve(__dirname, "../routes");
  const req = createRequire(import.meta.url);
  const files = readdirSync(routesDir).filter((f) => f.endsWith(".route.ts") || f.endsWith(".route.js"));
  modules = Object.fromEntries(files.map((f) => [f, req(resolve(routesDir, f))]));
}

/**
 * Discovered routes, sorted by name for deterministic mount order across builds.
 */
export const routeEntries: RouteEntry[] = Object.entries(modules)
  .map(([filePath, mod]) => {
    const router = pickRouter(mod);
    if (!router) {
      return null;
    }
    const name = routeNameFromPath(filePath);
    return { name, path: `/api/${name}`, router, isPublic: mod.isPublic === true } satisfies RouteEntry;
  })
  .filter((entry): entry is RouteEntry => entry !== null)
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Prefixes that bypass session auth: better-auth's own prefix plus every route
 * module that declared `isPublic = true`.
 */
export const publicApiPrefixes: string[] = [
  ...ALWAYS_PUBLIC_PREFIXES,
  ...routeEntries.filter((entry) => entry.isPublic).map((entry) => entry.path)
];
