import { env } from "../_core/env";

const CHAT_COMPLETIONS_PATH = "/skycowork_llm/v1/proxy/chat/completions";
const IMAGE_GENERATIONS_PATH = "/skycowork_llm/v1/proxy/images/generations";
const REQUEST_TIMEOUT_MS = 60_000;
const IMAGE_REQUEST_TIMEOUT_MS = 120_000;

export type PlatformAIMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

export type PlatformAIChatInput = {
  sceneKey: string;
  messages: PlatformAIMessage[];
};

export type PlatformAIImageInput = {
  sceneKey: string;
  prompt: string;
  n?: 1;
  size?: string;
};

export type PlatformAIErrorCode =
  | "PLATFORM_AI_NOT_CONFIGURED"
  | "PLATFORM_AI_UPSTREAM_ERROR"
  | "PLATFORM_AI_REQUEST_FAILED"
  | "PLATFORM_AI_INVALID_RESPONSE";

export class PlatformAIError extends Error {
  constructor(
    readonly code: PlatformAIErrorCode,
    message: string,
    readonly status: 500 | 502
  ) {
    super(message);
    this.name = "PlatformAIError";
  }
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

type ImageGenerationResponse = {
  data?: Array<{
    url?: unknown;
  }>;
};

function platformAIUrl(path: string) {
  const baseUrl = env.SKYWORK_AI_BASE_URL.trim().replace(/\/+$/, "");
  if (!baseUrl || !env.SKYWORK_API_TOKEN) {
    throw new PlatformAIError("PLATFORM_AI_NOT_CONFIGURED", "Platform AI is not configured", 500);
  }

  return `${baseUrl}${path}`;
}

async function readUpstreamErrorMessage(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw.trim()) return "";

  try {
    const payload = JSON.parse(raw) as {
      error?: { message?: unknown } | string;
      message?: unknown;
    };
    if (typeof payload.error === "object" && typeof payload.error?.message === "string") {
      return payload.error.message;
    }
    if (typeof payload.message === "string") return payload.message;
    if (typeof payload.error === "string") return payload.error;
  } catch {
    return raw.trim();
  }

  return raw.trim();
}

async function requestPlatformAIResponse(input: PlatformAIChatInput, stream: boolean) {
  const url = platformAIUrl(CHAT_COMPLETIONS_PATH);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Skywork-Api-Token": env.SKYWORK_API_TOKEN,
        "x-skywork-billing-source": "skybot",
        "X-Skywork-Scene": input.sceneKey
      },
      body: JSON.stringify({
        messages: input.messages,
        stream,
        max_tokens: 2048
      }),
      signal: stream ? undefined : AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch {
    throw new PlatformAIError("PLATFORM_AI_REQUEST_FAILED", "AI request failed", 502);
  }

  if (!response.ok) {
    const upstreamMessage = await readUpstreamErrorMessage(response);
    throw new PlatformAIError(
      "PLATFORM_AI_UPSTREAM_ERROR",
      `AI upstream error: ${response.status}${upstreamMessage ? `: ${upstreamMessage}` : ""}`,
      502
    );
  }

  return response;
}

export async function requestPlatformAIChat(input: PlatformAIChatInput) {
  const response = await requestPlatformAIResponse(input, false);

  let data: ChatCompletionResponse;
  try {
    data = (await response.json()) as ChatCompletionResponse;
  } catch {
    throw new PlatformAIError("PLATFORM_AI_INVALID_RESPONSE", "AI response was invalid", 502);
  }

  const reply = data.choices?.[0]?.message?.content;
  return { reply: typeof reply === "string" ? reply : "" };
}

export async function requestPlatformAIChatStream(input: PlatformAIChatInput) {
  const response = await requestPlatformAIResponse(input, true);
  if (!response.body) {
    throw new PlatformAIError("PLATFORM_AI_INVALID_RESPONSE", "AI response was invalid", 502);
  }
  return response;
}

export async function requestPlatformAIImage(input: PlatformAIImageInput) {
  const url = platformAIUrl(IMAGE_GENERATIONS_PATH);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Skywork-Api-Token": env.SKYWORK_API_TOKEN,
        "x-skywork-billing-source": "skybot",
        "X-Skywork-Scene": input.sceneKey
      },
      body: JSON.stringify({
        prompt: input.prompt,
        n: input.n ?? 1,
        size: input.size ?? "1024x1024"
      }),
      signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS)
    });
  } catch {
    throw new PlatformAIError("PLATFORM_AI_REQUEST_FAILED", "AI image request failed", 502);
  }

  if (!response.ok) {
    const upstreamMessage = await readUpstreamErrorMessage(response);
    throw new PlatformAIError(
      "PLATFORM_AI_UPSTREAM_ERROR",
      `AI image upstream error: ${response.status}${upstreamMessage ? `: ${upstreamMessage}` : ""}`,
      502
    );
  }

  let data: ImageGenerationResponse;
  try {
    data = (await response.json()) as ImageGenerationResponse;
  } catch {
    throw new PlatformAIError("PLATFORM_AI_INVALID_RESPONSE", "AI image response was invalid", 502);
  }

  const urlValue = data.data?.[0]?.url;
  if (typeof urlValue !== "string" || !urlValue.trim()) {
    throw new PlatformAIError("PLATFORM_AI_INVALID_RESPONSE", "AI image response was invalid", 502);
  }

  return { url: urlValue };
}
