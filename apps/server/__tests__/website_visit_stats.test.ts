import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWebsiteVisitStats } from "../services/website_visit_stats";

const input = {
  sourceWebsiteId: "website-source-1",
  startTime: 1_786_060_800_000,
  endTime: 1_786_665_600_000
};

function gatewayResponse(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    code: 0,
    message: "ok",
    data: {
      website_id: input.sourceWebsiteId,
      date_range: { mode: "timestamp" },
      pv: 12,
      uv: 9,
      avg_visit_depth: 1.75,
      avg_duration_seconds: 42.5,
      regions: [{ name: "US", count: 7 }],
      devices: [{ name: "desktop", count: 8 }],
      ...overrides
    }
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

describe("website visit stats service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    ["Gateway base URL", "", "opaque-token"],
    ["API token", "https://gateway.example.com", ""]
  ])("does not call Gateway when %s is missing", async (_label, baseUrl, token) => {
    vi.stubEnv("SKYWORK_GATEWAY_BASE_URL", baseUrl);
    vi.stubEnv("SKYWORK_API_TOKEN", token);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWebsiteVisitStats(input)).resolves.toEqual({
      available: false,
      sourceWebsiteId: input.sourceWebsiteId,
      reason: "not_configured"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["https://gateway.example.com/", "https://gateway.example.com/gateway/api/website/visit/stats"],
    ["https://gateway.example.com/gateway/", "https://gateway.example.com/gateway/api/website/visit/stats"]
  ])("normalizes Gateway base %s", async (baseUrl, expectedUrl) => {
    vi.stubEnv("SKYWORK_GATEWAY_BASE_URL", baseUrl);
    vi.stubEnv("SKYWORK_API_TOKEN", "opaque-token");
    const fetchMock = vi.fn(async () => gatewayResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWebsiteVisitStats(input)).resolves.toEqual({
      available: true,
      sourceWebsiteId: input.sourceWebsiteId,
      metrics: {
        pv: 12,
        uv: 9,
        avgVisitDepth: 1.75,
        avgDurationSeconds: 42.5
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expect.objectContaining({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Skywork-Api-Token": "opaque-token"
      },
      body: JSON.stringify({
        website_id: input.sourceWebsiteId,
        start_time: input.startTime,
        end_time: input.endTime
      })
    }));
  });

  it("preserves a successful all-zero response and drops unsupported dimensions", async () => {
    vi.stubEnv("SKYWORK_GATEWAY_BASE_URL", "https://gateway.example.com/gateway");
    vi.stubEnv("SKYWORK_API_TOKEN", "opaque-token");
    vi.stubGlobal("fetch", vi.fn(async () => gatewayResponse({
      pv: 0,
      uv: 0,
      avg_visit_depth: 0,
      avg_duration_seconds: 0,
      regions: [],
      devices: []
    })));

    await expect(fetchWebsiteVisitStats(input)).resolves.toEqual({
      available: true,
      sourceWebsiteId: input.sourceWebsiteId,
      metrics: {
        pv: 0,
        uv: 0,
        avgVisitDepth: 0,
        avgDurationSeconds: 0
      }
    });
  });

  it.each([
    ["HTTP error", async () => new Response("not found", { status: 404 })],
    ["Gateway error", async () => new Response(JSON.stringify({ code: 500, data: {} }), { status: 200 })],
    ["invalid JSON", async () => new Response("not-json", { status: 200 })],
    ["invalid metrics", async () => gatewayResponse({ pv: "12" })],
    ["Website ID mismatch", async () => gatewayResponse({ website_id: "website-source-2" })],
    ["network error", async () => { throw new Error("offline"); }]
  ])("fails open for %s without retrying", async (_label, responseFactory) => {
    vi.stubEnv("SKYWORK_GATEWAY_BASE_URL", "https://gateway.example.com");
    vi.stubEnv("SKYWORK_API_TOKEN", "opaque-token");
    const fetchMock = vi.fn(responseFactory);
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWebsiteVisitStats(input)).resolves.toEqual({
      available: false,
      sourceWebsiteId: input.sourceWebsiteId,
      reason: "upstream_unavailable"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails open after the three-second timeout without retrying", async () => {
    vi.stubEnv("SKYWORK_GATEWAY_BASE_URL", "https://gateway.example.com");
    vi.stubEnv("SKYWORK_API_TOKEN", "opaque-token");
    const controller = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = fetchWebsiteVisitStats(input);
    controller.abort();

    await expect(result).resolves.toEqual({
      available: false,
      sourceWebsiteId: input.sourceWebsiteId,
      reason: "upstream_unavailable"
    });
    expect(timeoutSpy).toHaveBeenCalledWith(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
