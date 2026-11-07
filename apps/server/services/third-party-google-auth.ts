import { createAuthSessionRecord, upsertThirdPartyUser } from "../_core/db";
import { env } from "../_core/env";

const THIRD_PARTY_PROVIDER_ID = "skywork-google";
const LOGIN_TOKEN_PARAM = "login_token";
const LOGIN_SIGNATURE_PARAM = "sig";
const LOGIN_TIMESTAMP_PARAM = "ts";
const SESSION_DAYS = 7;
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

export type GoogleUser = {
  sub?: unknown;
  id?: unknown;
  email?: unknown;
  email_verified?: unknown;
  emailVerified?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
  picture?: unknown;
  avatar_url?: unknown;
  [key: string]: unknown;
};

type GoogleStartEnvelope = {
  code: number;
  message: string;
  data?: {
    auth_url?: string;
    state?: string;
  } | null;
  trace_id?: string;
};

export class ThirdPartyGoogleAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 500
  ) {
    super(message);
    this.name = "ThirdPartyGoogleAuthError";
  }
}

export function isThirdPartyGoogleAuthConfigured() {
  return Boolean(env.SKYWORK_GATEWAY_BASE_URL && env.SKYWORK_API_TOKEN);
}

export async function startThirdPartyGoogleAuth(origin: string, returnPath: string) {
  if (!isThirdPartyGoogleAuthConfigured()) {
    throw new ThirdPartyGoogleAuthError(
      "THIRD_PARTY_GOOGLE_AUTH_CONFIG_MISSING",
      "Third-party Google auth config missing: set SKYWORK_GATEWAY_BASE_URL and SKYWORK_API_TOKEN",
      503
    );
  }

  // return_path is a backend callback path; gateway will join it with the website API host.
  const resp = await fetch(gatewayUrl("/gateway/api/website/auth/google_start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin,
      return_path: returnPath
    })
  });

  if (!resp.ok) {
    const message = await resp.text().catch(() => resp.statusText);
    throw new ThirdPartyGoogleAuthError(
      "THIRD_PARTY_GOOGLE_AUTH_START_FAILED",
      `Third-party Google auth start failed (${resp.status}): ${message}`,
      502
    );
  }

  const envelope = (await resp.json()) as GoogleStartEnvelope;
  if (envelope.code !== 0 || !envelope.data?.auth_url) {
    throw new ThirdPartyGoogleAuthError(
      "THIRD_PARTY_GOOGLE_AUTH_START_FAILED",
      `Third-party Google auth start failed: ${envelope.message || "missing auth_url"}`,
      502
    );
  }

  return {
    authUrl: envelope.data.auth_url,
    state: envelope.data.state ?? "",
    traceId: envelope.trace_id
  };
}

export async function completeThirdPartyGoogleAuth(googleUser: GoogleUser, token: string, landingPath = "/") {
  if (!env.SKYWORK_API_TOKEN || token !== env.SKYWORK_API_TOKEN) {
    throw new ThirdPartyGoogleAuthError("THIRD_PARTY_GOOGLE_AUTH_UNAUTHORIZED", "Invalid third-party auth token", 401);
  }

  const normalizedUser = normalizeGoogleUser(googleUser);
  const dbUser = await upsertThirdPartyUser({
    providerId: THIRD_PARTY_PROVIDER_ID,
    ...normalizedUser
  });
  const authSession = await createAuthSession(dbUser.id);
  const signedLandingPath = await signLandingPath(landingPath, authSession.token);

  return {
    landingPath: signedLandingPath,
    token: authSession.token,
    user: dbUser
  };
}

export async function verifySignedLoginToken(pathname: string, token: string, ts: string, signature: string) {
  const timestamp = Number(ts);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > SIGNATURE_MAX_AGE_MS) {
    return false;
  }

  const expected = await createSignature(pathname, token, ts);
  return timingSafeEqual(signature, expected);
}

function normalizeGoogleUser(googleUser: GoogleUser) {
  const email = typeof googleUser.email === "string" ? googleUser.email.trim().toLowerCase() : "";
  if (!email) {
    throw new ThirdPartyGoogleAuthError("THIRD_PARTY_GOOGLE_AUTH_INVALID_USER", "Google user is missing email", 400);
  }

  const providerAccountId = stringValue(googleUser.sub) || stringValue(googleUser.id) || email;
  const name =
    stringValue(googleUser.name) ||
    [stringValue(googleUser.given_name), stringValue(googleUser.family_name)].filter(Boolean).join(" ") ||
    email.split("@")[0];

  return {
    providerAccountId,
    email,
    emailVerified: booleanValue(googleUser.email_verified) ?? booleanValue(googleUser.emailVerified) ?? true,
    name,
    image: stringValue(googleUser.picture) || stringValue(googleUser.avatar_url) || null
  };
}

async function createAuthSession(userId: string) {
  const now = new Date();
  return createAuthSessionRecord(
    userId,
    randomToken(),
    new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  );
}

async function signLandingPath(rawLandingPath: string, token: string) {
  const landingUrl = new URL(rawLandingPath || "/", "https://app.local");
  const ts = Date.now().toString();

  landingUrl.searchParams.set(LOGIN_TOKEN_PARAM, token);
  landingUrl.searchParams.set(LOGIN_TIMESTAMP_PARAM, ts);
  landingUrl.searchParams.set(LOGIN_SIGNATURE_PARAM, await createSignature(landingUrl.pathname, token, ts));

  return `${landingUrl.pathname}${landingUrl.search}${landingUrl.hash}`;
}

async function createSignature(pathname: string, token: string, ts: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.BETTER_AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(`${pathname}.${token}.${ts}`));
  return base64UrlEncode(new Uint8Array(bytes));
}

function gatewayUrl(path: string) {
  const base = env.SKYWORK_GATEWAY_BASE_URL.replace(/\/+$/, "").replace(/\/gateway$/, "");
  return new URL(path, `${base}/`).toString();
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value === "true";
  }
  return undefined;
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < aBytes.length; index += 1) {
    diff |= aBytes[index] ^ bBytes[index];
  }
  return diff === 0;
}
