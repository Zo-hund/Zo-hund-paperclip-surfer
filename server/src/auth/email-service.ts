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

export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (process.env.RESEND_API_KEY) {
    return sendViaResend(input);
  }
  if (process.env.SMTP_HOST) {
    return sendViaSmtp(input);
  }
  // Dev fallback — print to console so the developer can click the link
  console.warn(
    [
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      `[Paperclip] EMAIL NOT SENT (no RESEND_API_KEY or SMTP_HOST)`,
      `  To: ${input.to}`,
      `  Subject: ${input.subject}`,
      `  Body: ${input.text}`,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
    ].join("\n"),
  );
}
