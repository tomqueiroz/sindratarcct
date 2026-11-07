// T4-infra: CORS contract
//
// The client and the FC backend live on different registrable domains by
// design (see comments in _core/create-app.ts), so the cors() middleware
// reflects the caller's origin and exposes `set-auth-token` so the bearer
// plugin can hand session tokens to the browser. If anyone tightens cors()
// (e.g. swaps the reflected origin for a static allow-list, or drops the
// exposed header) the browser quietly loses login and these tests catch it.

import { describe, expect, it } from "vitest";
import app from "../../_core/create-app";

const ORIGIN = "https://client.example.com";

describe("cors: preflight", () => {
  it("OPTIONS /api/todos reflects the request Origin", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/todos", {
        method: "OPTIONS",
        headers: {
          origin: ORIGIN,
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization,content-type"
        }
      })
    );

    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("OPTIONS /api/todos allows POST/PUT/PATCH/DELETE/GET", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/todos", {
        method: "OPTIONS",
        headers: {
          origin: ORIGIN,
          "access-control-request-method": "POST"
        }
      })
    );

    const allowed = (res.headers.get("access-control-allow-methods") ?? "").toUpperCase();
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      expect(allowed).toContain(method);
    }
  });
});

describe("cors: credentials + expose-headers", () => {
  it("credentials are allowed (so cookies / Authorization can ride)", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/todos", {
        method: "OPTIONS",
        headers: {
          origin: ORIGIN,
          "access-control-request-method": "GET"
        }
      })
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("set-auth-token is in access-control-expose-headers", async () => {
    // Hono's cors() emits expose-headers on actual responses (not preflight).
    const res = await app.fetch(
      new Request("http://localhost/api/health", {
        headers: { origin: ORIGIN }
      })
    );

    const exposed = (res.headers.get("access-control-expose-headers") ?? "").toLowerCase();
    expect(exposed).toContain("set-auth-token");
  });
});
