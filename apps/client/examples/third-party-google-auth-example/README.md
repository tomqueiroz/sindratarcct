# Third-Party Google Auth Example

This is THE way to add "Sign in with Google" on deployed sites: Skywork
Gateway owns the Google OAuth client and the OAuth state; this app never
touches Google credentials. Copy and adapt these patterns — do not import this
file directly.

Do NOT use Better Auth `socialProviders` (`GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET`) for a deployed site, and never ask the site owner for
Google Cloud credentials: in production the client site and this API are on
different registrable domains, so Better Auth's OAuth state cookie is dropped
on Google's redirect back and every login fails with `state_mismatch`. The
`socialProviders` path is a local-dev convenience only.

This app still keeps the normal Better Auth endpoints at `/api/auth/*`
(email + password); the third-party flow adds Google sign-in on top of them.

Backend routes:

```text
GET  /api/third-party-google-auth/config      reports whether gateway auth is enabled
POST /api/third-party-google-auth/start       asks gateway for Google's auth_url
POST /api/third-party-google-auth/callback    gateway-only callback; registers/logs in user
POST /api/third-party-google-auth/verify      verifies signed landing token
```

Required env:

```bash
SKYWORK_GATEWAY_BASE_URL=https://api-test.skywork.ai
SKYWORK_API_TOKEN=replace-with-shared-callback-token
BETTER_AUTH_SECRET=replace-with-a-stable-secret
```

`SKYWORK_GATEWAY_BASE_URL` may include or omit `/gateway`; the backend
normalizes it before calling `/gateway/api/website/auth/google_start`.

---

## 1. Frontend button

Use the helper in `@/lib/api`. It calls the app backend, receives the gateway
`auth_url`, then navigates the browser there.

```tsx
import { useState } from "react";
import { startThirdPartyGoogleAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function GatewayGoogleButton() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    try {
      await startThirdPartyGoogleAuth("/");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" onClick={signIn} disabled={loading}>
      {loading ? "Redirecting..." : "Continue with Google"}
    </Button>
  );
}
```

If you need to return to the current page after login:

```tsx
await startThirdPartyGoogleAuth(window.location.pathname + window.location.search);
```

---

## 2. What `/start` sends to the gateway

The backend calls:

```text
POST {SKYWORK_GATEWAY_BASE_URL}/gateway/api/website/auth/google_start
```

Request body:

```json
{
  "origin": "https://your-frontend.example.com",
  "return_path": "/api/third-party-google-auth/callback?landing_path=%2F"
}
```

`return_path` is the backend callback path. Gateway appends it to the deployed
backend/API host for this website. It is not the final frontend landing page.

Expected gateway response:

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
    "state": "3149cf53-d98a-477a-a0e7-02d3006abebb"
  },
  "trace_id": "4412d03f85ebff19ce2372dab11f44c9"
}
```

The frontend never sees the Google client secret.

---

## 3. What the gateway sends back

After Google auth succeeds, the gateway calls the callback path from
`return_path` against the deployed API base URL it has for this website:

```text
POST /api/third-party-google-auth/callback?landing_path=%2F
```

Request body:

```json
{
  "user": {
    "sub": "google-user-id",
    "email": "user@example.com",
    "email_verified": true,
    "name": "Example User",
    "picture": "https://example.com/avatar.png"
  },
  "token": "same-value-as-SKYWORK_API_TOKEN",
  "session_id": "gateway-session-id"
}
```

The callback verifies `token`, creates or updates the Better Auth user, creates
a Better Auth session, signs the requested `landing_path`, and returns:

```json
{
  "ok": true,
  "data": {
    "landing_path": "/?login_token=...&ts=...&sig=...",
    "path": "/?login_token=...&ts=...&sig=..."
  }
}
```

`landing_path` is the frontend landing path. Gateway appends it to the frontend
host/origin and redirects the browser there. `path` is returned only for
temporary compatibility with gateway versions that still read `data.path`.

---

## 4. How the landing token becomes a session

`apps/client/src/main.tsx` calls `syncAuthTokenFromUrl()` before rendering React.
That helper:

1. Reads `login_token`, `ts`, and `sig` from the URL.
2. Calls `/api/third-party-google-auth/verify` with `auth: false`.
3. Stores the token through `setAuthToken()`.
4. Removes the auth params from the address bar.

After this, `authClient.useSession()` works exactly like email/password login or
native Better Auth Google login, because every client request uses the same
Bearer token storage in `apps/client/src/lib/auth.ts`.

---

## Notes

- Keep native Google OAuth by setting `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET`; it remains exposed as `socialProviders: ["google"]`.
- Gateway Google auth is exposed separately as
  `thirdPartySocialProviders: ["google"]` from `/api/auth-config`.
- Do not call `fetch`, `window.fetch`, `XMLHttpRequest`, or `axios` from app
  business code. Use `apiFetch` or the helper from `@/lib/api`.
- The gateway callback route is public by route registration, but it is
  protected by the shared `SKYWORK_API_TOKEN`.
