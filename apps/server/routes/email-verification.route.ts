import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { getDb } from "../_core/db";
import { protectedRoute } from "../_core/route-helpers";
import { user as userTable, verification } from "../db/schema";
import { sendEmailVerificationCode } from "../services/message";

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFY_ATTEMPTS = 5;
const VERIFICATION_PREFIX = "email-verification:";

const VerifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/)
});

export const emailVerificationRouter = new Hono();

function identifierFor(email: string) {
  return `${VERIFICATION_PREFIX}${email.toLowerCase()}`;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function requestLocale(c: { req: { header: (name: string) => string | undefined } }) {
  return c.req.header("Accept-Language")?.split(",", 1)[0]?.trim() || undefined;
}

type VerificationValue = {
  code: string;
  attempts: number;
};

function encodeVerificationValue(value: VerificationValue) {
  return JSON.stringify(value);
}

function decodeVerificationValue(raw: string): VerificationValue {
  try {
    const parsed = JSON.parse(raw) as Partial<VerificationValue>;
    if (typeof parsed.code === "string") {
      const attempts = parsed.attempts;
      return {
        code: parsed.code,
        attempts: typeof attempts === "number" && Number.isInteger(attempts) && attempts >= 0 ? attempts : 0
      };
    }
  } catch {
    // Existing verification rows may contain only the raw 6-digit code.
  }

  return { code: raw, attempts: 0 };
}

emailVerificationRouter.post("/send-code", protectedRoute, async (c) => {
  const user = c.var.currentUser;

  if (user.emailVerified) {
    return c.json(apiSuccess({ sent: false, alreadyVerified: true }), 200);
  }

  const code = generateCode();
  const now = Date.now();
  const expiresAt = now + CODE_TTL_MINUTES * 60 * 1000;
  const identifier = identifierFor(user.email);
  const existing = (
    await getDb().select().from(verification).where(eq(verification.identifier, identifier)).limit(1)
  )[0];
  const lastSentAt = Number(existing?.createdAt?.getTime() ?? existing?.updatedAt?.getTime() ?? 0);
  const retryAfterSeconds = Math.ceil((lastSentAt + RESEND_COOLDOWN_SECONDS * 1000 - now) / 1000);

  if (retryAfterSeconds > 0) {
    return c.json(
      {
        ...apiFailure("VERIFICATION_EMAIL_RATE_LIMITED", "Please wait before requesting another code"),
        data: { retryAfterSeconds }
      },
      429
    );
  }

  await getDb().delete(verification).where(eq(verification.identifier, identifier));
  await getDb().insert(verification).values({
    id: crypto.randomUUID(),
    identifier,
    value: encodeVerificationValue({ code, attempts: 0 }),
    expiresAt: new Date(expiresAt),
    createdAt: new Date(now),
    updatedAt: new Date(now)
  });

  try {
    await sendEmailVerificationCode({
      email: user.email,
      code,
      expiresInMinutes: CODE_TTL_MINUTES,
      siteName: "Website",
      locale: requestLocale(c)
    });
  } catch (error) {
    await getDb().delete(verification).where(eq(verification.identifier, identifier));
    throw error;
  }

  return c.json(apiSuccess({ sent: true, expiresInMinutes: CODE_TTL_MINUTES }), 200);
});

emailVerificationRouter.post("/verify-code", protectedRoute, async (c) => {
  const user = c.var.currentUser;

  const parsed = VerifyCodeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(apiFailure("INVALID_CODE", "Enter the 6-digit verification code"), 400);
  }

  const identifier = identifierFor(user.email);
  const row = (
    await getDb().select().from(verification).where(eq(verification.identifier, identifier)).limit(1)
  )[0];
  if (!row) {
    return c.json(apiFailure("CODE_NOT_FOUND", "Request a new verification code"), 400);
  }

  const stored = decodeVerificationValue(row.value);
  const expiresAt = row.expiresAt.getTime();
  if (Date.now() > expiresAt) {
    await getDb().delete(verification).where(eq(verification.identifier, identifier));
    return c.json(apiFailure("CODE_EXPIRED", "Verification code has expired"), 400);
  }

  if (stored.code !== parsed.data.code) {
    const attempts = stored.attempts + 1;
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      await getDb().delete(verification).where(eq(verification.identifier, identifier));
      return c.json(apiFailure("CODE_ATTEMPTS_EXCEEDED", "Request a new verification code"), 429);
    }

    await getDb()
      .update(verification)
      .set({
        value: encodeVerificationValue({ code: stored.code, attempts }),
        updatedAt: new Date()
      })
      .where(eq(verification.identifier, identifier));
    return c.json(apiFailure("CODE_INVALID", "Invalid verification code"), 400);
  }

  await getDb()
    .update(userTable)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(userTable.id, user.id));
  await getDb().delete(verification).where(eq(verification.identifier, identifier));

  return c.json(apiSuccess({ verified: true }), 200);
});
