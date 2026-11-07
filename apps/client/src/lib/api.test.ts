// Unit tests for the third-party Google sign-in client entry points in
// lib/api.ts — the ONLY production Google login path (see AGENTS.md Hard
// Boundaries):
//
//   startThirdPartyGoogleAuth()  → asks the backend for the gateway auth_url
//                                  and navigates the browser there
//   syncAuthTokenFromUrl()       → on landing, verifies login_token/ts/sig,
//                                  stores the bearer token, scrubs the URL
//
// The backend is mocked at the global-fetch boundary; token storage and URL
// handling run for real against happy-dom.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  callPlatformAI,
  generatePlatformAIImage,
  startThirdPartyGoogleAuth,
  streamPlatformAI,
  syncAuthTokenFromUrl
} from "@/lib/api";
import { notifyApiError } from "@/lib/api-error";
import { clearAuthToken, getAuthToken, setAuthToken } from "@/lib/auth";

vi.mock("@/lib/api-error", () => ({
  notifyApiError: vi.fn(async () => undefined)
}));

function stubFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  clearAuthToken();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(notifyApiError).mockReset();
});

describe("apiFetch error presentation", () => {
  it("keeps global error notification enabled by default", async () => {
    const response = Response.json({ ok: false }, { status: 503 });
    const mock = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal("fetch", mock);

    await expect(apiFetch("/health")).resolves.toBe(response);

    expect(notifyApiError).toHaveBeenCalledWith(response);
  });

  it("allows an internal best-effort request to suppress error UI", async () => {
    const response = Response.json({ ok: false }, { status: 503 });
    const mock = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal("fetch", mock);

    await expect(apiFetch("/crm-runtime-context", { silent: true })).resolves.toBe(response);

    expect(notifyApiError).not.toHaveBeenCalled();
  });
});

describe("syncAuthTokenFromUrl", () => {
  it("verifies the signed params, stores the token, and scrubs the URL", async () => {
    window.history.replaceState(
      null,
      "",
      "/admin?login_token=tok-1&ts=1700000000000&sig=abc&keep=me"
    );
    const mock = stubFetch(200, { ok: true, data: { ok: true } });

    await expect(syncAuthTokenFromUrl()).resolves.toBe(true);

    // Verify call carries the exact landing path + signed triple.
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/api/third-party-google-auth/verify");
    expect(JSON.parse(String(init.body))).toEqual({
      path: "/admin",
      token: "tok-1",
      ts: "1700000000000",
      sig: "abc"
    });

    expect(getAuthToken()).toBe("tok-1");

    // login_token/ts/sig are removed; unrelated params survive.
    const search = new URLSearchParams(window.location.search);
    expect(search.get("login_token")).toBeNull();
    expect(search.get("ts")).toBeNull();
    expect(search.get("sig")).toBeNull();
    expect(search.get("keep")).toBe("me");
    expect(window.location.pathname).toBe("/admin");
  });

  it("does not store a token when verification fails", async () => {
    window.history.replaceState(null, "", "/admin?login_token=tok-x&ts=1&sig=forged");
    stubFetch(401, { ok: false, error: { code: "INVALID_LOGIN_TOKEN", message: "Invalid" } });

    await expect(syncAuthTokenFromUrl()).resolves.toBe(false);
    expect(getAuthToken()).toBe("");
  });

  it("returns false without calling the backend when the params are absent", async () => {
    window.history.replaceState(null, "", "/admin?foo=bar");
    const mock = stubFetch(200, { ok: true, data: { ok: true } });

    await expect(syncAuthTokenFromUrl()).resolves.toBe(false);
    expect(mock).not.toHaveBeenCalled();
    expect(getAuthToken()).toBe("");
  });
});

describe("startThirdPartyGoogleAuth", () => {
  it("posts origin + landing path to /start and navigates to the gateway auth_url", async () => {
    const mock = stubFetch(200, {
      ok: true,
      data: { authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=st-1" }
    });
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);

    await startThirdPartyGoogleAuth("/admin");

    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/api/third-party-google-auth/start");
    expect(JSON.parse(String(init.body))).toEqual({
      origin: window.location.origin,
      landing_path: "/admin"
    });
    expect(assign).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?state=st-1");
  });

  it("throws (and does not navigate) when the backend cannot provide an auth_url", async () => {
    stubFetch(503, {
      ok: false,
      error: { code: "THIRD_PARTY_GOOGLE_AUTH_CONFIG_MISSING", message: "missing" }
    });
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);

    await expect(startThirdPartyGoogleAuth("/admin")).rejects.toThrow(
      "Third-party Google auth start failed"
    );
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("callPlatformAI", () => {
  it("posts messages to the app backend through apiFetch and returns the reply", async () => {
    setAuthToken("client-session-token");
    const mock = stubFetch(200, { ok: true, data: { reply: "Bonjour." } });
    const messages = [{ role: "user" as const, content: "Translate hello." }];

    await expect(callPlatformAI({ scene_key: "translation", messages })).resolves.toBe("Bonjour.");

    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/api/ai");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer client-session-token");
    expect(headers.has("X-Skywork-Api-Token")).toBe(false);
    expect(headers.has("x-skywork-billing-source")).toBe(false);
    expect(headers.has("X-Skywork-Scene")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({ scene_key: "translation", messages });
  });

  it("streams only delta.content and does not depend on the final usage event", async () => {
    setAuthToken("client-session-token");
    const encoder = new TextEncoder();
    const payload = encoder.encode(
      [
        'data: {"choices":[],"prompt_filter_results":[{"prompt_index":0}]}',
        "",
        'data: {"choices":[{"delta":{"content":"","role":"assistant"},"finish_reason":null}]}',
        "",
        'data: {"choices":[{"delta":{"content":"你"},"finish_reason":null}]}',
        "",
        'data: {"choices":[{"delta":{"content":"好"},"finish_reason":null}]}',
        "",
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        "",
        "data: [DONE]",
        ""
      ].join("\n")
    );
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(payload.slice(0, 73));
          controller.enqueue(payload.slice(73, 181));
          controller.enqueue(payload.slice(181));
          controller.close();
        }
      }),
      { headers: { "Content-Type": "text/event-stream" } }
    );
    const mock = vi.fn<typeof fetch>();
    mock.mockResolvedValue(response);
    vi.stubGlobal("fetch", mock);
    const messages = [
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: "请描述这张图片，返回三点。" },
          {
            type: "image_url" as const,
            image_url: { url: "https://storage.test/image.jpg" }
          }
        ]
      }
    ];

    const contents: string[] = [];
    for await (const content of streamPlatformAI({ scene_key: "chat", messages })) {
      contents.push(content);
    }

    expect(contents).toEqual(["你", "好"]);
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toContain("/api/ai");
    expect(JSON.parse(String(init?.body))).toEqual({
      scene_key: "chat",
      messages,
      stream: true
    });
  });
});

describe("generatePlatformAIImage", () => {
  it("posts image input to the app backend and returns data.url", async () => {
    setAuthToken("client-session-token");
    const imageUrl = "https://static-us-img.skywork.ai/w_source/image_gen/example.jpg";
    const mock = stubFetch(200, { ok: true, data: { url: imageUrl } });

    await expect(
      generatePlatformAIImage({
        scene_key: "travel_assistant",
        prompt: "跳舞的火柴人，右下角展示Seedream5.6-pro",
        n: 1,
        size: "1024x1024"
      })
    ).resolves.toBe(imageUrl);

    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/api/ai/images");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer client-session-token");
    expect(headers.has("X-Skywork-Api-Token")).toBe(false);
    expect(headers.has("X-Skywork-Scene")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({
      scene_key: "travel_assistant",
      prompt: "跳舞的火柴人，右下角展示Seedream5.6-pro",
      n: 1,
      size: "1024x1024"
    });
  });
});
