// T4-infra: /api/health route
//
// The deploy pipeline relies on /api/health for the 120s startup probe (see
// _core/env.ts comment on SKY_FC_SERVER_PORT). If the route stops returning
// 200 with a parseable body, instances get killed and every user request
// answers 412 FunctionNotStarted. Cheap to test, expensive to miss.

import { describe, expect, it } from "vitest";
import app from "../../_core/create-app";

describe("health: /api/health", () => {
  it("GET returns 200", async () => {
    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
  });

  it("GET returns JSON with service + runtime identifiers", async () => {
    const res = await app.fetch(new Request("http://localhost/api/health"));
    const body = (await res.json()) as {
      data?: { service?: string; runtime?: string };
      service?: string;
      runtime?: string;
    };

    // apiSuccess wraps payloads under `data`; tolerate both shapes pending a
    // contract lock.
    const service = body.data?.service ?? body.service;
    const runtime = body.data?.runtime ?? body.runtime;

    expect(service).toBe("server");
    expect(runtime).toBe("hono");
  });

  it("HEAD-ish call (GET with empty body) succeeds without auth", async () => {
    // /api/health is in PUBLIC_API_PREFIXES — withSession should let it
    // through with c.var.user = null and the handler should not require auth.
    const res = await app.fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
  });
});
