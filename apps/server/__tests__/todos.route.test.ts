// Sample integration test for a feature route. Agents adding new business
// routes should copy this file's shape:
//
//   1. import the live Hono app (not a route in isolation) so the test
//      exercises the same withSession + cors stack production uses.
//   2. beforeAll(applyMigrations) once; beforeEach(resetDatabase) for
//      mutation-heavy tests.
//   3. Each it() covers a discrete behavior — happy path, auth boundary,
//      validation boundary. Avoid mega-tests; small failures = sharp
//      diagnostics.
//
// Note for agents: do NOT modify files under `_test/infra/`. Those are the
// scaffold-owned T4-infra layer the build_and_deploy gate depends on. Add
// your tests here (`__tests__/`), one file per route.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../_core/create-app";
import { applyMigrations, fetchWithAuth, resetDatabase, signUpAndGetToken } from "../_test/helpers";

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("todos.route: auth boundary", () => {
  it("GET /api/todos without Authorization → 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/todos"));
    expect(res.status).toBe(401);
  });

  it("GET /api/todos/ without Authorization → 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/todos/"));
    expect(res.status).toBe(401);
  });

  it("POST /api/todos without Authorization → 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "first" })
      })
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/todos/ without Authorization → 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/todos/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "first" })
      })
    );
    expect(res.status).toBe(401);
  });
});

describe("todos.route: happy path", () => {
  it("serves collection-root GET and POST with and without a trailing slash", async () => {
    const { token } = await signUpAndGetToken(app);

    const createWithoutSlash = await fetchWithAuth(app, token, "/api/todos", {
      method: "POST",
      body: JSON.stringify({ title: "without slash" })
    });
    expect(createWithoutSlash.status).toBe(200);

    const createWithSlash = await fetchWithAuth(app, token, "/api/todos/", {
      method: "POST",
      body: JSON.stringify({ title: "with slash" })
    });
    expect(createWithSlash.status).toBe(200);

    const listWithoutSlash = await fetchWithAuth(app, token, "/api/todos");
    expect(listWithoutSlash.status).toBe(200);
    const withoutSlashBody = (await listWithoutSlash.json()) as {
      data?: { todos?: Array<{ title: string }> };
    };
    expect(withoutSlashBody.data?.todos?.map((todo) => todo.title).sort()).toEqual([
      "with slash",
      "without slash"
    ]);

    const listWithSlash = await fetchWithAuth(app, token, "/api/todos/");
    expect(listWithSlash.status).toBe(200);
    const withSlashBody = (await listWithSlash.json()) as {
      data?: { todos?: Array<{ title: string }> };
    };
    expect(withSlashBody.data?.todos?.length).toBe(2);
  });

  it("a user can create, list, update, and delete their own todo", async () => {
    const { token } = await signUpAndGetToken(app);

    // CREATE
    const createRes = await fetchWithAuth(app, token, "/api/todos", {
      method: "POST",
      body: JSON.stringify({ title: "buy milk" })
    });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as {
      data?: { todo?: { id: string; title: string; done: boolean } };
    };
    const todo = created.data?.todo;
    expect(todo?.title).toBe("buy milk");
    expect(todo?.done).toBe(false);

    // LIST
    const listRes = await fetchWithAuth(app, token, "/api/todos");
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as {
      data?: { todos?: Array<{ id: string }> };
    };
    expect(listed.data?.todos?.length).toBe(1);
    expect(listed.data?.todos?.[0]?.id).toBe(todo?.id);

    // UPDATE
    const updateRes = await fetchWithAuth(app, token, `/api/todos/${todo?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ done: true })
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as {
      data?: { todo?: { done: boolean } };
    };
    expect(updated.data?.todo?.done).toBe(true);

    // DELETE
    const deleteRes = await fetchWithAuth(app, token, `/api/todos/${todo?.id}`, {
      method: "DELETE"
    });
    expect(deleteRes.status).toBe(200);

    // LIST is now empty again
    const finalListRes = await fetchWithAuth(app, token, "/api/todos");
    const finalList = (await finalListRes.json()) as {
      data?: { todos?: unknown[] };
    };
    expect(finalList.data?.todos?.length).toBe(0);
  });
});

describe("todos.route: isolation between users", () => {
  it("user A cannot see user B's todos", async () => {
    const userA = await signUpAndGetToken(app);
    const userB = await signUpAndGetToken(app);

    await fetchWithAuth(app, userA.token, "/api/todos", {
      method: "POST",
      body: JSON.stringify({ title: "A's task" })
    });

    const bList = await fetchWithAuth(app, userB.token, "/api/todos");
    const body = (await bList.json()) as { data?: { todos?: unknown[] } };
    expect(body.data?.todos?.length).toBe(0);
  });
});

describe("todos.route: input validation", () => {
  it("POST with empty title → 400", async () => {
    const { token } = await signUpAndGetToken(app);
    const res = await fetchWithAuth(app, token, "/api/todos", {
      method: "POST",
      body: JSON.stringify({ title: "" })
    });
    expect(res.status).toBe(400);
  });

  it("PATCH with no fields → 400", async () => {
    const { token } = await signUpAndGetToken(app);
    const create = await fetchWithAuth(app, token, "/api/todos", {
      method: "POST",
      body: JSON.stringify({ title: "to update" })
    });
    const todo = ((await create.json()) as { data?: { todo?: { id: string } } }).data?.todo;

    const res = await fetchWithAuth(app, token, `/api/todos/${todo?.id}`, {
      method: "PATCH",
      body: JSON.stringify({})
    });
    expect(res.status).toBe(400);
  });
});
