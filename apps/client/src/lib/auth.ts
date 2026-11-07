import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { notifyApiError } from "@/lib/api-error";
import { authUrl } from "@/lib/api-base";

const AUTH_TOKEN_KEY = "better-auth-token";

type AuthResultWithToken = {
  data?: {
    token?: string | null;
    user?: unknown;
  } | null;
} | null;

// In-memory fallback so the Bearer session survives within a tab/preview even
// when localStorage is unavailable — private mode, or partitioned/blocked inside
// a cross-origin preview iframe. localStorage is still used best-effort so the
// session also survives a full page reload wherever storage is writable. Every
// generated app reads/writes the token through these helpers, so this keeps
// login working in both a standalone tab and an embedded preview.
let inMemoryToken = "";

function readStoredToken(): string {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredToken(token: string) {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // storage blocked (private mode / partitioned iframe) — in-memory only
  }
}

function removeStoredToken() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // storage blocked — clearing the in-memory copy below is enough
  }
}

export function getAuthToken() {
  return inMemoryToken || readStoredToken();
}

export function setAuthToken(token: string) {
  inMemoryToken = token;
  writeStoredToken(token);
}

export function clearAuthToken() {
  inMemoryToken = "";
  removeStoredToken();
}

export function syncAuthTokenFromResult(result: AuthResultWithToken) {
  const token = result?.data?.token || getAuthToken();

  if (!token) {
    return { token: "", user: result?.data?.user };
  }

  setAuthToken(token);
  return { token, user: result?.data?.user };
}

export const authClient = createAuthClient({
  baseURL: authUrl(),
  plugins: [usernameClient()],
  fetchOptions: {
    auth: {
      type: "Bearer",
      token: getAuthToken
    },
    onResponse: async (context) => {
      const token = context.response.headers.get("set-auth-token");

      if (token) {
        setAuthToken(token);
      }

      if (!context.response.ok) {
        await notifyApiError(context.response);
      }
    }
  }
});
