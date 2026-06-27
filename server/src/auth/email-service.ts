/**
 * Email service for Paperclip.
 *
 * Priority order:
 *   1. RESEND_API_KEY  → Resend HTTP API (no SDK needed)
 *   2. SMTP_HOST       → nodemailer (if installed)
 *   3. fallback        → logs URL to console (dev/local_trusted only)
 */

const FROM_ADDRESS =
  process.env.PAPERCLIP_EMAIL_FROM ?? "noreply@paperclip.local";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendViaResend(input: SendEmailInput): Promise<void> {
  const key = process.env.RESEND_API_KEY!;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

async function sendViaSmtp(input: SendEmailInput): Promise<void> {
  // Dynamic import via variable to avoid TS2307 when nodemailer is not installed.
  // At runtime this will throw ENOENT which we surface with a friendly message.
  const pkg = "nodemailer";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodemailer: any = await import(pkg).catch(() => null);
  if (!nodemailer) {
    throw new Error(
      "nodemailer is not installed. Run: pnpm --filter @paperclipai/server add nodemailer",
    );
  }
  const transporter = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
        : undefined,
  });
  await transporter.sendMail({
    from: FROM_ADDRESS,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}

/** True when a real delivery transport (Resend or SMTP) is configured. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
}

/**
 * Sends an email. Returns true when it was actually dispatched via a configured
 * transport, false when no transport is configured (the body is logged instead
 * so callers can surface "email not delivered" to the user rather than failing
 * silently).
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  if (process.env.RESEND_API_KEY) {
    await sendViaResend(input);
    return true;
  }
  if (process.env.SMTP_HOST) {
    await sendViaSmtp(input);
    return true;
  }
  // Dev fallback — print to console so the developer can click the link
  console.warn(
    [
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      `[AMX Air Hubs] EMAIL NOT SENT (no RESEND_API_KEY or SMTP_HOST)`,
      `  To: ${input.to}`,
      `  Subject: ${input.subject}`,
      `  Body: ${input.text}`,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
    ].join("\n"),
  );
  return false;
}
