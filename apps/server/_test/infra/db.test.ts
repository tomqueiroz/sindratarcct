// T4-infra: database layer
//
// Asserts that the in-memory libsql instance configured by _test/setup.ts is
// wired correctly: getDb() succeeds, all migration tables exist, foreign keys
// are enforced. These checks act as a canary — if Phase 0's :memory: vs
// libsql-server comparison flags a difference (e.g. WAL, ATTACH, sync()),
// this file is where the alignment PRAGMA / setup tweak lands.

import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../helpers";
import { executeSql, isDatabaseConfigured } from "../../_core/db";

describe("db: configuration", () => {
  it("isDatabaseConfigured() reflects setup.ts env vars", () => {
    expect(isDatabaseConfigured()).toBe(true);
  });

  it("connects and runs a trivial query", async () => {
    const res = await executeSql("SELECT 1 AS ok");
    expect(res.rows[0]?.ok).toBe(1);
  });
});

describe("db: migrations", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  it("PRAGMA foreign_keys is ON", async () => {
    const res = await executeSql("PRAGMA foreign_keys");
    // libsql returns the pragma value as the first column; column name is
    // "foreign_keys".
    expect(Number(res.rows[0]?.foreign_keys)).toBe(1);
  });

  it.each([
    ["user"],
    ["session"],
    ["account"],
    ["verification"],
    ["todos"],
    ["ai_business_scenes"]
  ])("table %s exists", async (name) => {
    const res = await executeSql(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      [name]
    );
    expect(res.rows.length).toBe(1);
  });

  it("idx_todos_userId index exists", async () => {
    const res = await executeSql(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_todos_userId'"
    );
    expect(res.rows.length).toBe(1);
  });

  it("ON DELETE CASCADE is wired: deleting a user removes their sessions", async () => {
    // Insert a user + session by hand so this test doesn't depend on auth.ts.
    const userId = "cascade-test-user";
    await executeSql(
      "INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)",
      [userId, "Cascade User", "cascade@example.com", Date.now(), Date.now()]
    );
    await executeSql(
      "INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)",
      ["s1", Date.now() + 1_000_000, "tkn1", Date.now(), Date.now(), userId]
    );

    await executeSql("DELETE FROM user WHERE id = ?", [userId]);

    const sessions = await executeSql("SELECT * FROM session WHERE userId = ?", [userId]);
    expect(sessions.rows.length).toBe(0);
  });
});
