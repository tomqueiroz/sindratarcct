// Integration tests for the third-party (gateway-owned) Google sign-in flow —
// the ONLY production Google login path (see AGENTS.md Hard Boundaries).
// Covers the three routes end-to-end through the live Hono app:
//
//   POST /start     → asks the gateway for Google's auth_url
//   POST /callback  → gateway-only: upserts the Google user, issues a session,
//                     returns a signed landing path
//   POST /verify    → validates the signed login token from the landing URL
//
// The gateway itself is mocked at the global-fetch boundary; everything else
// (env wiring, route auto-discovery, DB upsert, HMAC signing) runs for real.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations, resetDatabase } from "../_test/helpers";
import { executeSql } from "../_core/db";

// _core/env.ts reads these at module load, and the static imports above pull
// it in transitively (db.ts → env.ts) — vi.hoisted runs before those imports
// evaluate, so the values are in place when env.ts snapshots process.env.
vi.hoisted(() => {
  process.env.SKYWORK_GATEWAY_BASE_URL = "https://gateway.test";
  process.env.SKYWORK_API_TOKEN = "test-gateway-callback-token";
});

const GATEWAY_TOKEN = "test-gateway-callback-token";

let app: typeof import("../_core/create-app").default;

beforeAll(async () => {
  await applyMigrations();
  app = (await import("../_core/create-app")).default;
});

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function stubGatewayStart(
  response: { status?: number; body?: unknown } = {}
): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async () =>
    Response.json(
      response.body ?? {
        code: 0,
        message: "ok",
        data: { auth_url: "https://accounts.google.com/o/oauth2/v2/auth?state=st-1", state: "st-1" },
        trace_id: "trace-1"
      },
      { status: response.status ?? 200 }
    )
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

const GOOGLE_USER = {
  sub: "google-sub-123",
  email: "Portal.Owner@Example.com",
  email_verified: true,
  name: "Portal Owner",
  picture: "https://lh3.example/avatar.png"
};

async function completeCallback(landingPath = "/admin") {
  const res = await app.fetch(
    jsonRequest("/api/third-party-google-auth/callback", {
      user: GOOGLE_USER,
      token: GATEWAY_TOKEN,
      landing_path: landingPath
    })
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { data?: { landing_path?: string } };
  const landing = body.data?.landing_path ?? "";
  const url = new URL(landing, "https://app.local");
  return {
    landing,
    path: url.pathname,
    token: url.searchParams.get("login_token") ?? "",
    ts: url.searchParams.get("ts") ?? "",
    sig: url.searchParams.get("sig") ?? ""
  };
}

describe("third-party-google-auth: config", () => {
  it("reports enabled when gateway env is present", async () => {
    const res = await app.fetch(new Request("http://localhost/api/third-party-google-auth/config"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { enabled: true } });
  });
});

describe("third-party-google-auth: start", () => {
  it("asks the gateway for auth_url and echoes it with the callback return_path", async () => {
    const gateway = stubGatewayStart();

    const res = await app.fetch(
      jsonRequest("/api/third-party-google-auth/start", {
        origin: "https://site.example",
        landing_path: "/admin"
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data?: { authUrl?: string; state?: string } };
    expect(body.data?.authUrl).toBe("https://accounts.google.com/o/oauth2/v2/auth?state=st-1");
    expect(body.data?.state).toBe("st-1");

    expect(gateway).toHaveBeenCalledTimes(1);
    const [url, init] = gateway.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gateway.test/gateway/api/website/auth/google_start");
    const sent = JSON.parse(String(init.body)) as { origin: string; return_path: string };
    expect(sent.origin).toBe("https://site.example");
    expect(sent.return_path).toBe("/api/third-party-google-auth/callback?landing_path=%2Fadmin");
  });

  it("maps a gateway failure to 502 without leaking the flow", async () => {
    stubGatewayStart({ status: 500, body: { code: 1, message: "boom" } });

    const res = await app.fetch(
      jsonRequest("/api/third-party-google-auth/start", { landing_path: "/" })
    );

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("THIRD_PARTY_GOOGLE_AUTH_START_FAILED");
  });
});

describe("third-party-google-auth: callback", () => {
  it("creates the Google user, issues a session, and returns a signed landing path", async () => {
    const { path, token, ts, sig } = await completeCallback("/admin");

    expect(path).toBe("/admin");
    expect(token).not.toBe("");
    expect(ts).toMatch(/^\d+$/);
    expect(sig).not.toBe("");

    // Email is normalized to lowercase; the account row links the provider id.
    const users = await executeSql("SELECT id, email FROM user WHERE email = ?", [
      "portal.owner@example.com"
    ]);
    expect(users.rows.length).toBe(1);

    const sessions = await executeSql("SELECT token FROM session WHERE userId = ?", [
      String(users.rows[0].id)
    ]);
    expect(sessions.rows.map((r) => String(r.token))).toContain(token);
  });

  it("reuses the existing user on repeat sign-in instead of duplicating", async () => {
    await completeCallback();
    await completeCallback();

    const users = await executeSql("SELECT id FROM user WHERE email = ?", [
      "portal.owner@example.com"
    ]);
    expect(users.rows.length).toBe(1);
  });

  it("rejects a callback whose shared token does not match → 401", async () => {
    const res = await app.fetch(
      jsonRequest("/api/third-party-google-auth/callback", {
        user: GOOGLE_USER,
        token: "wrong-token"
      })
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("THIRD_PARTY_GOOGLE_AUTH_UNAUTHORIZED");
  });

  it("rejects a Google user without an email → 400", async () => {
    const res = await app.fetch(
      jsonRequest("/api/third-party-google-auth/callback", {
        user: { sub: "no-email" },
        token: GATEWAY_TOKEN
      })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("THIRD_PARTY_GOOGLE_AUTH_INVALID_USER");
  });
});

describe("third-party-google-auth: verify", () => {
  it("accepts the untampered signed landing token", async () => {
    const { path, token, ts, sig } = await completeCallback("/admin");

    const res = await app.fetch(
      jsonRequest("/api/third-party-google-auth/verify", { path, token, ts, sig })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { ok: true } });
  });

  it("rejects a tampered signature → 401", async () => {
    const { path, token, ts } = await completeCallback("/admin");

    const res = await app.fetch(
      jsonRequest("/api/third-party-google-auth/verify", {
        path,
        token,
        ts,
        sig: "forged-signature"
      })
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("INVALID_LOGIN_TOKEN");
  });

  it("rejects a token replayed onto a different path → 401", async () => {
    const { token, ts, sig } = await completeCallback("/admin");

    const res = await app.fetch(
      jsonRequest("/api/third-party-google-auth/verify", {
        path: "/other-page",
        token,
        ts,
        sig
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects an expired login token (past the 5-minute signature window) → 401", async () => {
    const { path, token, ts, sig } = await completeCallback("/admin");

    vi.useFakeTimers();
    vi.setSystemTime(Number(ts) + 6 * 60 * 1000);

    const res = await app.fetch(
      jsonRequest("/api/third-party-google-auth/verify", { path, token, ts, sig })
    );

    expect(res.status).toBe(401);
  });
});
