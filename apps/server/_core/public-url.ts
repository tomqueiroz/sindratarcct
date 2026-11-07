import { env } from "./env";

/**
 * The backend's own public base URL — for building absolute callback / webhook
 * URLs in server-to-third-party flows (e.g. a payment provider's webhook
 * endpoint or a server-built return URL).
 *
 * SECURITY — this returns ONLY the deploy-injected `PUBLIC_BACKEND_URL`, a value
 * our deploy pipeline controls. It deliberately does NOT fall back to the
 * request's `Host` / `X-Forwarded-Host`: those are client-influenced, and a
 * syntactically valid but attacker-chosen host (e.g. `evil.example`) must never
 * end up in a payment / webhook callback URL (host-header poisoning). Character
 * sanitisation cannot fix that — it is a trust-boundary problem, so the
 * untrusted source is simply not used here.
 *
 * Returns "" when `PUBLIC_BACKEND_URL` is not set (no reserve deploy, or local
 * dev). Callers MUST treat "" as "no trusted backend URL available" and NOT
 * register a webhook or build a trusted callback: allocate the URL first with
 * the `reserve_backend_url` tool, or use the redirect-confirm flow (frontend
 * `success_url` + a Hono route that retrieves the Checkout Session), which needs
 * no backend domain at all.
 */
export function getPublicBaseUrl(): string {
  return env.PUBLIC_BACKEND_URL ? env.PUBLIC_BACKEND_URL.replace(/\/+$/, "") : "";
}
