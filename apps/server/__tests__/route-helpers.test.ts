import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { apiSuccess } from "@repo/shared/http";
import type { AuthUser } from "../_core/auth";
import { adminRoute, protectedRoute, publicRoute } from "../_core/route-helpers";

function fakeUser(role: AuthUser["role"]): AuthUser {
  return {
    id: `${role}-1`,
    name: `${role} user`,
    email: `${role}@example.com`,
    emailVerified: true,
    role
  };
}

function createTestApp() {
  const app = new Hono();

  app.get("/public", publicRoute, (c) => c.json(apiSuccess({ ok: true })));
  app.get("/protected", protectedRoute, (c) => c.json(apiSuccess({ userId: c.var.currentUser.id })));
  app.get("/admin", adminRoute, (c) => c.json(apiSuccess({ role: c.var.currentUser.role })));

  app.use("/as-user/*", async (c, next) => {
    c.set("user", fakeUser("user"));
    await next();
  });
  app.get("/as-user/protected", protectedRoute, (c) => c.json(apiSuccess({ userId: c.var.currentUser.id })));
  app.get("/as-user/admin", adminRoute, (c) => c.json(apiSuccess({ role: c.var.currentUser.role })));

  app.use("/as-admin/*", async (c, next) => {
    c.set("user", fakeUser("admin"));
    await next();
  });
  app.get("/as-admin/admin", adminRoute, (c) => c.json(apiSuccess({ role: c.var.currentUser.role })));

  return app;
}

describe("route helpers", () => {
  it("publicRoute allows anonymous requests", async () => {
    const app = createTestApp();
    const res = await app.fetch(new Request("http://localhost/public"));
    expect(res.status).toBe(200);
  });

  it("protectedRoute returns 401 when c.var.user is missing", async () => {
    const app = createTestApp();
    const res = await app.fetch(new Request("http://localhost/protected"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("UNAUTHORIZED");
  });

  it("protectedRoute passes the authenticated user to the handler", async () => {
    const app = createTestApp();
    const res = await app.fetch(new Request("http://localhost/as-user/protected"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data?: { userId?: string } };
    expect(body.data?.userId).toBe("user-1");
  });

  it("adminRoute returns 401 when c.var.user is missing", async () => {
    const app = createTestApp();
    const res = await app.fetch(new Request("http://localhost/admin"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("UNAUTHORIZED");
  });

  it("adminRoute returns 403 for a non-admin user", async () => {
    const app = createTestApp();
    const res = await app.fetch(new Request("http://localhost/as-user/admin"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("FORBIDDEN");
  });

  it("adminRoute passes an admin user to the handler", async () => {
    const app = createTestApp();
    const res = await app.fetch(new Request("http://localhost/as-admin/admin"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data?: { role?: string } };
    expect(body.data?.role).toBe("admin");
  });
});
