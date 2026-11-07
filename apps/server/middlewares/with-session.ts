import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { apiFailure } from "@repo/shared/http";
import { getAuth, toAuthSession, toAuthUser, type AuthSession, type AuthUser } from "../_core/auth";
import { DatabaseError, getDb } from "../_core/db";
import { publicApiPrefixes } from "../_core/route-registry";
import { user as userTable } from "../db/schema";

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser | null;
    session: AuthSession | null;
  }
}

// Public prefixes are computed from the route registry: better-auth's prefix
// plus every route module that declared `isPublic = true`. A route opts itself
// out of session auth — nothing to maintain here.
export const PUBLIC_API_PREFIXES = publicApiPrefixes;

function isPublicApiPath(pathname: string) {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export const withSession: MiddlewareHandler = async (c, next) => {
  if (isPublicApiPath(new URL(c.req.url).pathname)) {
    c.set("user", null);
    c.set("session", null);
    await next();
    return;
  }

  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    c.set("user", null);
    c.set("session", null);
    await next();
    return;
  }

  let authUser: AuthUser | null;
  let authSession: AuthSession | null;
  try {
    const betterAuthSession = await getAuth().api.getSession({
      headers: new Headers({
        Authorization: authorization
      })
    });
    authUser = await hydrateUserFromDatabase(toAuthUser(betterAuthSession));
    authSession = toAuthSession(betterAuthSession);
  } catch (error) {
    if (error instanceof DatabaseError) {
      return c.json(apiFailure(error.code, error.message), error.status === 503 ? 503 : 502);
    }

    throw error;
  }

  c.set("user", authUser);
  c.set("session", authSession);

  await next();
};

async function hydrateUserFromDatabase(authUser: AuthUser | null): Promise<AuthUser | null> {
  if (!authUser) {
    return null;
  }

  const rows = await getDb()
    .select({
      role: userTable.role,
      emailVerified: userTable.emailVerified,
      username: userTable.username
    })
    .from(userTable)
    .where(eq(userTable.id, authUser.id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return authUser;
  }

  return {
    ...authUser,
    emailVerified: Boolean(row.emailVerified),
    role: row.role === "admin" ? "admin" : "user",
    username: row.username ?? undefined
  };
}
