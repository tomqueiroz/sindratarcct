import type { MiddlewareHandler } from "hono";
import { apiFailure } from "@repo/shared/http";
import type { AuthUser } from "./auth";

declare module "hono" {
  interface ContextVariableMap {
    currentUser: AuthUser;
  }
}

export const publicRoute: MiddlewareHandler = async (_c, next) => {
  await next();
};

export const protectedRoute: MiddlewareHandler = async (c, next) => {
  const user = c.var.user;
  if (!user) {
    return c.json(apiFailure("UNAUTHORIZED", "Unauthorized"), 401);
  }

  c.set("currentUser", user);
  await next();
};

export const adminRoute: MiddlewareHandler = async (c, next) => {
  const user = c.var.user;
  if (!user) {
    return c.json(apiFailure("UNAUTHORIZED", "Unauthorized"), 401);
  }

  if (user.role !== "admin") {
    return c.json(apiFailure("FORBIDDEN", "Forbidden"), 403);
  }

  c.set("currentUser", user);
  await next();
};
