import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations, resetDatabase, signUpAndGetToken } from "../helpers";
import { executeSql } from "../../_core/db";

const sendEmailVerificationCode = vi.fn(async () => ({ id: "email_1" }));
type ApiErrorBody = { error: { code: string } };

vi.mock("../../services/message", () => ({
  sendEmailVerificationCode
}));

let app: typeof import("../../_core/create-app").default;

beforeAll(async () => {
  await applyMigrations();
  app = (await import("../../_core/create-app")).default;
});

beforeEach(async () => {
  sendEmailVerificationCode.mockClear();
  await resetDatabase();
});

describe("email verification routes", () => {
  async function getStoredCode(email: string) {
    const stored = await executeSql("SELECT value FROM verification WHERE identifier = ?", [
      `email-verification:${email}`
    ]);
    const raw = String(stored.rows[0]?.value ?? "");
    return String(JSON.parse(raw).code);
  }

  it("sends a 6-digit verification code to the signed-in user's email", async () => {
    const { token, email } = await signUpAndGetToken(app);

    const res = await app.fetch(
      new Request("http://localhost/api/email-verification/send-code", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Accept-Language": "zh, en;q=0.8"
        }
      })
    );

    expect(res.status).toBe(200);
    expect(sendEmailVerificationCode).toHaveBeenCalledWith({
      email,
      code: expect.stringMatching(/^\d{6}$/),
      expiresInMinutes: 10,
      siteName: "Website",
      locale: "zh"
    });

    const stored = await executeSql("SELECT value FROM verification WHERE identifier = ?", [
      `email-verification:${email}`
    ]);
    expect(JSON.parse(String(stored.rows[0]?.value)).code).toMatch(/^\d{6}$/);
  });

  it("rate limits repeated verification code sends for the same user", async () => {
    const { token } = await signUpAndGetToken(app);

    const first = await app.fetch(
      new Request("http://localhost/api/email-verification/send-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
    );
    const second = await app.fetch(
      new Request("http://localhost/api/email-verification/send-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(sendEmailVerificationCode).toHaveBeenCalledTimes(1);
    const body = await second.json();
    expect(body.error.code).toBe("VERIFICATION_EMAIL_RATE_LIMITED");
    expect(body.data.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("marks the signed-in user's email as verified with the correct code", async () => {
    const { token, email, userId } = await signUpAndGetToken(app);
    await app.fetch(
      new Request("http://localhost/api/email-verification/send-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
    );
    const code = await getStoredCode(email);

    const res = await app.fetch(
      new Request("http://localhost/api/email-verification/verify-code", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ code })
      })
    );

    expect(res.status).toBe(200);
    const user = await executeSql("SELECT emailVerified FROM user WHERE id = ?", [userId!]);
    expect(Number(user.rows[0]?.emailVerified)).toBe(1);
  });

  it("does not allow replaying a verification code after success", async () => {
    const { token, email } = await signUpAndGetToken(app);
    await app.fetch(
      new Request("http://localhost/api/email-verification/send-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
    );
    const code = await getStoredCode(email);

    const first = await app.fetch(
      new Request("http://localhost/api/email-verification/verify-code", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ code })
      })
    );
    const replay = await app.fetch(
      new Request("http://localhost/api/email-verification/verify-code", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ code })
      })
    );

    expect(first.status).toBe(200);
    expect(replay.status).toBe(400);
    const body = await replay.json();
    expect(body.error.code).toBe("CODE_NOT_FOUND");
  });

  it("rejects an invalid verification code", async () => {
    const { token } = await signUpAndGetToken(app);
    await app.fetch(
      new Request("http://localhost/api/email-verification/send-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
    );

    const res = await app.fetch(
      new Request("http://localhost/api/email-verification/verify-code", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ code: "000000" })
      })
    );

    expect(res.status).toBe(400);
  });

  it("expires stale verification codes and deletes them", async () => {
    const { token, email } = await signUpAndGetToken(app);
    await app.fetch(
      new Request("http://localhost/api/email-verification/send-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
    );
    const code = await getStoredCode(email);
    await executeSql("UPDATE verification SET expiresAt = ? WHERE identifier = ?", [
      Math.floor((Date.now() - 1000) / 1000),
      `email-verification:${email}`
    ]);

    const res = await app.fetch(
      new Request("http://localhost/api/email-verification/verify-code", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ code })
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("CODE_EXPIRED");
    const stored = await executeSql("SELECT value FROM verification WHERE identifier = ?", [
      `email-verification:${email}`
    ]);
    expect(stored.rows).toHaveLength(0);
  });

  it("locks and deletes a verification code after too many invalid attempts", async () => {
    const { token, email } = await signUpAndGetToken(app);
    await app.fetch(
      new Request("http://localhost/api/email-verification/send-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
    );

    let lastStatus = 0;
    let lastBody: ApiErrorBody | null = null;
    for (let index = 0; index < 5; index += 1) {
      const res = await app.fetch(
        new Request("http://localhost/api/email-verification/verify-code", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ code: "000000" })
        })
      );
      lastStatus = res.status;
      lastBody = await res.json();
    }

    expect(lastStatus).toBe(429);
    expect(lastBody?.error.code).toBe("CODE_ATTEMPTS_EXCEEDED");
    const stored = await executeSql("SELECT value FROM verification WHERE identifier = ?", [
      `email-verification:${email}`
    ]);
    expect(stored.rows).toHaveLength(0);
  });

  it("does not send another code for an already verified user", async () => {
    const { token, userId } = await signUpAndGetToken(app);
    await executeSql("UPDATE user SET emailVerified = 1 WHERE id = ?", [userId!]);

    const res = await app.fetch(
      new Request("http://localhost/api/email-verification/send-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ sent: false, alreadyVerified: true });
    expect(sendEmailVerificationCode).not.toHaveBeenCalled();
  });
});
