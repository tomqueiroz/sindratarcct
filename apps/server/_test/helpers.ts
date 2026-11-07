// Shared test helpers for the server test suite. All tests in
// _test/infra/* and __tests__/* should use these instead of touching
// _core/db.ts or @libsql/client directly.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { executeSql } from "../_core/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

// Apply every migration in lexicographic order, then enable foreign keys
// (libsql-server runs with foreign_keys=ON by default; :memory: defaults to
// OFF, which would hide ON DELETE CASCADE bugs from the test suite). Safe to
// call from beforeAll(): all CREATE statements use IF NOT EXISTS.
export async function applyMigrations(): Promise<void> {
  await executeSql("PRAGMA foreign_keys = ON");

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    for (const stmt of splitSqlStatements(sql)) {
      await executeSql(stmt);
    }
  }
}

// libsql's execute() takes ONE statement at a time; multi-statement strings
// throw "extra characters after statement". Strip `--` line comments first,
// then split on `;` followed by newline / EOF.
function splitSqlStatements(sql: string): string[] {
  const noComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return noComments
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Wipe all per-user data so each test starts clean. Delete in dependency
// order (child tables first) so ON DELETE CASCADE doesn't fire mid-loop.
// Auth tables are reset too so signUp can be called repeatedly with a fresh
// email and not collide on UNIQUE(email).
export async function resetDatabase(): Promise<void> {
  await executeSql("DELETE FROM todos");
  await executeSql("DELETE FROM session");
  await executeSql("DELETE FROM account");
  await executeSql("DELETE FROM verification");
  await executeSql("DELETE FROM user");
}

let signupCounter = 0;

export type SignedUpUser = {
  token: string;
  email: string;
  password: string;
  userId?: string;
};

// Sign up via the real Hono app at POST /api/auth/sign-up/email. Better Auth's
// bearer() plugin returns the session token in the `set-auth-token` response
// header — that's what subsequent requests need as `Authorization: Bearer X`.
// A monotonic counter + timestamp ensures emails are unique across calls in
// the same test process.
export async function signUpAndGetToken(
  app: { fetch: (req: Request) => Promise<Response> },
  overrides: { email?: string; password?: string; name?: string } = {}
): Promise<SignedUpUser> {
  signupCounter += 1;
  const email = overrides.email ?? `test-${Date.now()}-${signupCounter}@example.com`;
  const password = overrides.password ?? "password1234";
  const name = overrides.name ?? "Test User";

  const res = await app.fetch(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000"
      },
      body: JSON.stringify({ email, password, name })
    })
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`signUp failed: ${res.status} ${body}`);
  }

  const token = res.headers.get("set-auth-token");
  if (!token) {
    throw new Error(
      "signUp returned no set-auth-token header — bearer() plugin missing in _core/auth.ts?"
    );
  }

  const body = (await res.json()) as { user?: { id?: string } };
  return { token, email, password, userId: body.user?.id };
}

// Sign in an existing account (used when a test needs to prove that the
// session-issuance path works for both signUp and signIn).
export async function signInAndGetToken(
  app: { fetch: (req: Request) => Promise<Response> },
  email: string,
  password: string
): Promise<string> {
  const res = await app.fetch(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000"
      },
      body: JSON.stringify({ email, password })
    })
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`signIn failed: ${res.status} ${body}`);
  }

  const token = res.headers.get("set-auth-token");
  if (!token) {
    throw new Error("signIn returned no set-auth-token header");
  }
  return token;
}

// Attach Bearer auth + sensible defaults so tests don't repeat header setup.
// JSON content-type is set automatically when a body is provided and no
// explicit content-type is given.
export async function fetchWithAuth(
  app: { fetch: (req: Request) => Promise<Response> },
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers }));
}
