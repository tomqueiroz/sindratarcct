import { env } from "../_core/env";

type ForbiddenEmailFields = {
  from?: never;
  fromEmail?: never;
  fromName?: never;
  subject?: never;
  html?: never;
  text?: never;
  content?: never;
  toEmail?: never;
};

export type SendEmailInput = {
  email: string;
  code: string;
  expiresInMinutes: number;
  siteName?: string;
  locale?: string;
} & ForbiddenEmailFields;

export type TemplateEmailInput = {
  templateId: string;
  locale?: string;
  senderMode?: "auto" | "public" | "custom_domain";
  data: Record<string, unknown>;
  recipient?: {
    email?: string;
  };
} & ForbiddenEmailFields;

export class MessageServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number
  ) {
    super(message);
    this.name = "MessageServiceError";
  }
}

// Server-only platform template email bridge. Gateway owns sender identity,
// subject lines, and HTML templates; generated apps pass structured fields only.
function gatewayUrl(path: string) {
  return `${env.SKYWORK_GATEWAY_BASE_URL.replace(/\/+$/, "")}${path}`;
}

async function postMessage(path: string, body: unknown) {
  if (!env.SKYWORK_API_TOKEN) {
    throw new MessageServiceError("SKYWORK_API_TOKEN is not configured", 500);
  }

  const response = await fetch(gatewayUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Skywork-Api-Token": env.SKYWORK_API_TOKEN
    },
    body: JSON.stringify(body)
  });

  let responseBody: unknown = null;
  try {
    responseBody = await response.json();
  } catch {
    // Keep the original HTTP status in the thrown error below.
  }

  const envelope = responseBody as { code?: number; message?: string; data?: unknown } | null;
  if (!response.ok || !envelope || envelope.code !== 0) {
    throw new MessageServiceError(
      envelope?.message || "failed to send email",
      response.status,
      envelope?.code
    );
  }

  return envelope.data;
}

export async function sendTemplateEmail(input: TemplateEmailInput) {
  const body = {
    template_id: input.templateId,
    sender_mode: input.senderMode ?? "auto",
    data: input.data,
    recipient: input.recipient ?? {}
  } as {
    template_id: string;
    locale?: string;
    sender_mode: "auto" | "public" | "custom_domain";
    data: Record<string, unknown>;
    recipient: { email?: string };
  };
  if (input.locale) {
    body.locale = input.locale;
  }
  return postMessage("/api/v1/website/message/email/template/send", body);
}

export async function sendEmailVerificationCode(input: SendEmailInput) {
  return sendTemplateEmail({
    templateId: "email_verification_code",
    locale: input.locale,
    data: {
      code: input.code,
      expires_in_minutes: input.expiresInMinutes,
      site_name: input.siteName ?? "Website"
    },
    recipient: {
      email: input.email
    }
  });
}
