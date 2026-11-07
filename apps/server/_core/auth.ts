import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, openAPI, username } from "better-auth/plugins";
import * as schema from "../db/schema";
import { getDb } from "./db";
import { env } from "./env";
import { isThirdPartyGoogleAuthConfigured } from "../services/third-party-google-auth";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: "user" | "admin";
  username?: string;
};

export type AuthSession = {
  id: string;
  token: string;
  userId: string;
};

const socialProviders =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET
        }
      }
    : {};

export const enabledSocialProviders = Object.keys(socialProviders);
export const enabledThirdPartySocialProviders = isThirdPartyGoogleAuthConfigured() ? ["google"] : [];

// Better Auth runs its own origin allow-list on top of the Hono CORS
// middleware: non-GET auth requests whose Origin header (or callbackURL)
// doesn't match are rejected with 403 INVALID_ORIGIN. The client site and
// this backend live on different registrable domains by design, and the
// backend's own origin (the FC subdomain) is only assigned during deploy, so
// no static allow-list can be complete. Auth transport is bearer-token (the
// browser never attaches it automatically), so origin checks add no CSRF
// protection here — trust the caller's origin and the serving host at
// request time, mirroring the open CORS policy in create-app.ts.
function trustedOrigins(request?: Request) {
  const callerOrigin = request?.headers.get("origin");
  const ownHost = request?.headers.get("x-forwarded-host") ?? request?.headers.get("host");
  return [
    ...env.ALLOWED_ORIGINS,
    callerOrigin,
    ...(ownHost ? [`https://${ownHost}`, `http://${ownHost}`] : [])
  ];
}

function createAuth() {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(getDb(), {
      provider: "sqlite",
      schema,
      camelCase: true
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false
    },
    emailVerification: {
      sendVerificationEmail: ({ user, url }) => {
        // TODO(selfhost-auth): replace with Resend/SMS gateway integration when
        // email verification is enabled for production templates. Use:
        // void sendEmail({ to: user.email, subject: "...", html: "..." });
        console.info("[better-auth] mock verification email", { email: user.email, url });
        return Promise.resolve();
      }
    },
    socialProviders,
    plugins: [username(), bearer(), openAPI()]
  });
}

let authInstance: ReturnType<typeof createAuth> | null = null;

export function getAuth() {
  authInstance ??= createAuth();
  return authInstance;
}

type BetterAuthSession = NonNullable<Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>>>;

export function toAuthUser(session: BetterAuthSession | null): AuthUser | null {
  if (!session?.user) {
    return null;
  }

  const user = session.user as BetterAuthSession["user"] & {
    role?: "user" | "admin";
    username?: string;
  };

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    role: user.role ?? "user",
    username: user.username
  };
}

export function toAuthSession(session: BetterAuthSession | null): AuthSession | null {
  if (!session?.session) {
    return null;
  }

  return {
    id: session.session.id,
    token: session.session.token,
    userId: session.session.userId
  };
}
