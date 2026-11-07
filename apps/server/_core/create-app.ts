import { Hono } from "hono";
import { cors } from "hono/cors";
import { routeEntries } from "./route-registry";
import { withSession } from "../middlewares/with-session";
import { notFound } from "../middlewares/not-found";
import { onError } from "../middlewares/on-error";
import { getAuth } from "./auth";
import { isDatabaseConfigured } from "./db";
import { apiFailure } from "@repo/shared/http";

const app = new Hono({ strict: false });

// The client site and this backend are deployed on different registrable
// domains by design (skywork.website vs the FC subdomain), so cross-origin is
// the normal case, not the exception. Auth rides the Authorization header
// (bearer token, no cookies), which the browser never attaches automatically
// — an origin allow-list adds no CSRF protection here and only breaks the
// client when the deploy-time ALLOWED_ORIGINS injection is missing or stale.
// Reflect the caller's origin instead of restricting it.
app.use(
  "/api/*",
  cors({
    origin: (origin) => origin || "*",
    exposeHeaders: ["set-auth-token"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  })
);

app.options("/api/auth/*", (c) => c.body(null, 204));
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  if (!isDatabaseConfigured()) {
    return c.json(apiFailure("DATABASE_UNCONFIGURED", "Skybase database runtime env is not configured"), 503);
  }

  return getAuth().handler(c.req.raw);
});
app.use("/api/*", withSession);

// Routes are auto-discovered from apps/server/routes/*.route.ts and mounted at
// /api/<name>. To add an endpoint, add a route file — no edits needed here.
for (const { path, router } of routeEntries) {
  app.route(path, router);
}

app.onError(onError);
app.notFound(notFound);

export default app;
