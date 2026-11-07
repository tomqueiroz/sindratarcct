import { apiUrl } from "@/lib/api-base";
import { notifyApiError } from "@/lib/api-error";
import { getAuthToken, setAuthToken } from "@/lib/auth";
import type { ApiResponse } from "@repo/shared/http";

export type ApiFetchInit = RequestInit & {
  auth?: boolean;
  // Internal best-effort requests may opt out of global error UI. Business
  // mutations keep the default false so their server failures remain visible.
  silent?: boolean;
};

export async function apiFetch(path: string, init?: ApiFetchInit) {
  const { auth = true, silent = false, ...requestInit } = init ?? {};
  const token = auth ? getAuthToken() : "";

  const response = await fetch(apiUrl(path), {
    ...requestInit,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...requestInit.headers
    }
  });

  if (!response.ok && !silent) {
    await notifyApiError(response);
  }

  return response;
}

export type PlatformAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: PlatformAIMessageContent;
};

// Upload local images through /storage and use file.downloadUrl as image_url.url.
export type PlatformAIMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export type PlatformAIChatInput = {
  scene_key: string;
  messages: PlatformAIChatMessage[];
};

export type PlatformAIImageInput = {
  scene_key: string;
  prompt: string;
  n?: 1;
  size?: string;
};

type PlatformAIStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
  }>;
};

// Prefer streamPlatformAI unless the complete reply is required at once.
export async function callPlatformAI(input: PlatformAIChatInput) {
  const response = await apiFetch("/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  const payload = (await response.json()) as ApiResponse<{ reply: string }>;
  if (!response.ok || !payload.ok) {
    throw new Error("AI request failed");
  }

  return payload.data.reply;
}

export async function generatePlatformAIImage(input: PlatformAIImageInput) {
  const response = await apiFetch("/ai/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  const payload = (await response.json()) as ApiResponse<{ url: string }>;
  if (!response.ok || !payload.ok || !payload.data.url) {
    throw new Error("AI image request failed");
  }

  return payload.data.url;
}

function extractSseData(event: string) {
  return event
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
}

function extractPlatformAIContent(data: string) {
  if (!data || data === "[DONE]") return [];

  let chunk: PlatformAIStreamChunk;
  try {
    chunk = JSON.parse(data) as PlatformAIStreamChunk;
  } catch {
    return [];
  }

  return (chunk.choices ?? [])
    .map((choice) => choice.delta?.content)
    .filter((content): content is string => typeof content === "string" && content.length > 0);
}

export async function* streamPlatformAI(input: PlatformAIChatInput): AsyncGenerator<string> {
  const response = await apiFetch("/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, stream: true })
  });

  if (!response.ok || !response.body) {
    throw new Error("AI stream request failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consumeEvent = function* (event: string) {
    const data = extractSseData(event);
    if (data === "[DONE]") return true;
    yield* extractPlatformAIContent(data);
    return false;
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let separator = buffer.match(/\r?\n\r?\n/);
    while (separator?.index !== undefined) {
      const event = buffer.slice(0, separator.index);
      buffer = buffer.slice(separator.index + separator[0].length);
      const iterator = consumeEvent(event);
      let item = iterator.next();
      while (!item.done) {
        yield item.value;
        item = iterator.next();
      }
      if (item.value) return;
      separator = buffer.match(/\r?\n\r?\n/);
    }

    if (done) break;
  }

  if (buffer.trim()) {
    const iterator = consumeEvent(buffer);
    let item = iterator.next();
    while (!item.done) {
      yield item.value;
      item = iterator.next();
    }
  }
}

export async function startThirdPartyGoogleAuth(landingPath = window.location.pathname) {
  const response = await apiFetch("/third-party-google-auth/start", {
    method: "POST",
    auth: false,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: window.location.origin,
      landing_path: landingPath
    })
  });
  const payload = (await response.json()) as {
    ok: boolean;
    data?: { authUrl?: string; auth_url?: string };
  };
  const authUrl = payload.data?.authUrl ?? payload.data?.auth_url;

  if (!response.ok || !authUrl) {
    throw new Error("Third-party Google auth start failed");
  }

  window.location.assign(authUrl);
}

export async function syncAuthTokenFromUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("login_token");
  const ts = url.searchParams.get("ts");
  const sig = url.searchParams.get("sig");

  if (!token || !ts || !sig) {
    return false;
  }

  const response = await apiFetch("/third-party-google-auth/verify", {
    method: "POST",
    auth: false,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: url.pathname, token, ts, sig })
  }).catch(() => null);

  if (!response?.ok) {
    return false;
  }

  setAuthToken(token);
  url.searchParams.delete("login_token");
  url.searchParams.delete("ts");
  url.searchParams.delete("sig");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}
