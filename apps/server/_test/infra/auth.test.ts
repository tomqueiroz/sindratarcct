// T4-infra: Better Auth happy path
//
// Walks the auth flow end-to-end against the real Hono app: sign up an email
// account, exchange the resulting bearer token for a /api/todos request, and
// confirm that protected routes 401 without auth. If signUp ever stops
// returning `set-auth-token` (bearer plugin removed, route mounting changed,
// or the auth migration drifts from the better-auth version), the failure
// surfaces here before any agent-generated business test runs.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { apiSuccess } from "@repo/shared/http";
import { applyMigrations, resetDatabase, signUpAndGetToken, signInAndGetToken, fetchWithAuth } from "../helpers";
import app from "../../_core/create-app";
import { adminRoute } from "../../_core/route-helpers";
import { withSession } from "../../middlewares/with-session";

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("auth: sign up", () => {
  it("POST /api/auth/sign-up/email returns a bearer token", async () => {
    const { token, userId } = await signUpAndGetToken(app);
    expect(token).toBeTypeOf("string");
    expect(token.length).toBeGreaterThan(10);
    expect(userId).toBeTypeOf("string");
  });

  it("signed-up user appears in the user table", async () => {
    const { email, userId } = await signUpAndGetToken(app);
    expect(userId).toBeTypeOf("string");

    const { executeSql } = await import("../../_core/db");
    const res = await executeSql("SELECT email FROM user WHERE id = ?", [userId!]);
    expect(res.rows[0]?.email).toBe(email);
  });
});

describe("auth: sign in", () => {
  it("an existing account can sign in and receive a token", async () => {
    const { email, password } = await signUpAndGetToken(app);
    const token = await signInAndGetToken(app, email, password);
    expect(token).toBeTypeOf("string");
    expect(token.length).toBeGreaterThan(10);
  });
});

describe("auth: protected routes", () => {
  it("GET /api/todos without Authorization → 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/todos"));
    expect(res.status).toBe(401);
  });

  it("GET /api/todos with a malformed bearer → 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/todos", {
        headers: { Authorization: "Bearer not-a-real-token" }
      })
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/todos with a valid bearer → 200 + empty list for a fresh user", async () => {
    const { token } = await signUpAndGetToken(app);
    const res = await fetchWithAuth(app, token, "/api/todos");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data?: { todos?: unknown[] }; todos?: unknown[] };
    // apiSuccess wraps in `data` per @repo/shared/http; tolerate either shape
    // until contract is locked.
    const todos = body.data?.todos ?? body.todos ?? [];
    expect(Array.isArray(todos)).toBe(true);
    expect(todos.length).toBe(0);
  });
});

describe("auth: role hydration", () => {
  it("hydrates role/emailVerified from the user table instead of trusting the session payload", async () => {
    const { token, userId } = await signUpAndGetToken(app);
    expect(userId).toBeTypeOf("string");

    const { executeSql } = await import("../../_core/db");
    await executeSql("UPDATE user SET role = ?, emailVerified = 1 WHERE id = ?", ["admin", userId!]);

    const profileRes = await fetchWithAuth(app, token, "/api/me/profile");
    expect(profileRes.status).toBe(200);
    const profileBody = (await profileRes.json()) as {
      data?: { profile?: { role?: string; emailVerified?: boolean } };
    };
    expect(profileBody.data?.profile?.role).toBe("admin");
    expect(profileBody.data?.profile?.emailVerified).toBe(true);

    const adminApp = new Hono();
    adminApp.use("/api/*", withSession);
    adminApp.get("/api/admin-check", adminRoute, (c) => c.json(apiSuccess({ role: c.var.currentUser.role })));

    const adminRes = await fetchWithAuth(adminApp, token, "/api/admin-check");
    expect(adminRes.status).toBe(200);
    const adminBody = (await adminRes.json()) as { data?: { role?: string } };
    expect(adminBody.data?.role).toBe("admin");
  });
});
