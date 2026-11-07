import { z } from "zod";

const WEBSITE_VISIT_STATS_PATH = "/api/website/visit/stats";
const WEBSITE_VISIT_STATS_TIMEOUT_MS = 3_000;

const GatewayWebsiteVisitStatsSchema = z.object({
  code: z.number(),
  data: z.object({
    website_id: z.string(),
    pv: z.number().int().nonnegative(),
    uv: z.number().int().nonnegative(),
    avg_visit_depth: z.number().finite().nonnegative(),
    avg_duration_seconds: z.number().finite().nonnegative()
  })
});

export type WebsiteVisitStatsInput = {
  sourceWebsiteId: string;
  startTime: number;
  endTime: number;
};

export type WebsiteVisitStatsMetrics = {
  pv: number;
  uv: number;
  avgVisitDepth: number;
  avgDurationSeconds: number;
};

export type WebsiteVisitStatsResult =
  | {
      available: true;
      sourceWebsiteId: string;
      metrics: WebsiteVisitStatsMetrics;
    }
  | {
      available: false;
      sourceWebsiteId: string;
      reason: "not_configured" | "upstream_unavailable";
    };

function unavailable(
  sourceWebsiteId: string,
  reason: "not_configured" | "upstream_unavailable"
): WebsiteVisitStatsResult {
  return { available: false, sourceWebsiteId, reason };
}

function resolveWebsiteVisitStatsUrl(rawGatewayBaseUrl: string) {
  try {
    const url = new URL(rawGatewayBaseUrl);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname || url.username || url.password) {
      return null;
    }

    const basePath = url.pathname.replace(/\/+$/, "");
    url.pathname = basePath.endsWith("/gateway")
      ? `${basePath}${WEBSITE_VISIT_STATS_PATH}`
      : `${basePath}/gateway${WEBSITE_VISIT_STATS_PATH}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export async function fetchWebsiteVisitStats(
  input: WebsiteVisitStatsInput
): Promise<WebsiteVisitStatsResult> {
  const gatewayBaseUrl = process.env.SKYWORK_GATEWAY_BASE_URL?.trim();
  const apiToken = process.env.SKYWORK_API_TOKEN?.trim();
  if (!gatewayBaseUrl || !apiToken) {
    return unavailable(input.sourceWebsiteId, "not_configured");
  }

  const url = resolveWebsiteVisitStatsUrl(gatewayBaseUrl);
  if (!url) {
    return unavailable(input.sourceWebsiteId, "not_configured");
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Skywork-Api-Token": apiToken
      },
      body: JSON.stringify({
        website_id: input.sourceWebsiteId,
        start_time: input.startTime,
        end_time: input.endTime
      }),
      signal: AbortSignal.timeout(WEBSITE_VISIT_STATS_TIMEOUT_MS)
    });
    if (!response.ok) {
      return unavailable(input.sourceWebsiteId, "upstream_unavailable");
    }

    const payload = await response.json().catch(() => null);
    const parsed = GatewayWebsiteVisitStatsSchema.safeParse(payload);
    if (!parsed.success || parsed.data.code !== 0 || parsed.data.data.website_id !== input.sourceWebsiteId) {
      return unavailable(input.sourceWebsiteId, "upstream_unavailable");
    }

    const stats = parsed.data.data;
    return {
      available: true,
      sourceWebsiteId: input.sourceWebsiteId,
      metrics: {
        pv: stats.pv,
        uv: stats.uv,
        avgVisitDepth: stats.avg_visit_depth,
        avgDurationSeconds: stats.avg_duration_seconds
      }
    };
  } catch {
    return unavailable(input.sourceWebsiteId, "upstream_unavailable");
  }
}
