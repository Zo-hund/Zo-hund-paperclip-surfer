import { Resend } from "resend";
import type { Config } from "../config.js";
import { logger } from "../middleware/logger.js";

type EmailContent = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type AuthEmailInput = {
  email: string | null | undefined;
  name?: string | null | undefined;
  url: string;
};

type CompanyInviteEmailInput = {
  email: string | null | undefined;
  companyName?: string | null | undefined;
  inviteUrl: string;
  onboardingTextUrl?: string | null | undefined;
};

type ClientWorkOrderEmailInput = {
  email: string | null | undefined;
  clientName?: string | null | undefined;
  companyName?: string | null | undefined;
  issueIdentifier: string;
  issueTitle: string;
  stageLabel: string;
  statusSummary: string;
  intro?: string | null | undefined;
  nextStep?: string | null | undefined;
  customMessage?: string | null | undefined;
  trackedHours: number;
  timeCardLines: string[];
};

type EmailDeliveryResult = {
  provider: "resend";
  accepted: boolean;
  messageId: string | null;
  recipient: string;
  subject: string;
};

type EmailService = ReturnType<typeof createEmailService>;
type SendOptions = {
  required?: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function displayName(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "there";
}

function verificationEmailTemplate(input: AuthEmailInput): EmailContent {
  const greetingName = escapeHtml(displayName(input.name));
  const safeUrl = escapeHtml(input.url);
  return {
    to: input.email ?? "",
    subject: "Verify your email for Paperclip",
    text: [
      `Hi ${displayName(input.name)},`,
      "",
      "Verify your email address to continue using Paperclip:",
      input.url,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: [
      "<div style=\"font-family: Arial, sans-serif; line-height: 1.6; color: #111827;\">",
      `<p>Hi ${greetingName},</p>`,
      "<p>Verify your email address to continue using Paperclip.</p>",
      `<p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;">Verify email</a></p>`,
      `<p style="word-break:break-all;"><a href="${safeUrl}">${safeUrl}</a></p>`,
      "<p>If you did not request this, you can ignore this email.</p>",
      "</div>",
    ].join(""),
  };
}

function passwordResetEmailTemplate(input: AuthEmailInput): EmailContent {
  const greetingName = escapeHtml(displayName(input.name));
  const safeUrl = escapeHtml(input.url);
  return {
    to: input.email ?? "",
    subject: "Reset your Paperclip password",
    text: [
      `Hi ${displayName(input.name)},`,
      "",
      "Use this link to reset your Paperclip password:",
      input.url,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: [
      "<div style=\"font-family: Arial, sans-serif; line-height: 1.6; color: #111827;\">",
      `<p>Hi ${greetingName},</p>`,
      "<p>Use this link to reset your Paperclip password.</p>",
      `<p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;">Reset password</a></p>`,
      `<p style="word-break:break-all;"><a href="${safeUrl}">${safeUrl}</a></p>`,
      "<p>If you did not request this, you can ignore this email.</p>",
      "</div>",
    ].join(""),
  };
}

function companyInviteEmailTemplate(input: CompanyInviteEmailInput): EmailContent {
  const companyLabel = input.companyName?.trim() || "a Paperclip company";
  const safeCompanyLabel = escapeHtml(companyLabel);
  const safeInviteUrl = escapeHtml(input.inviteUrl);
  const safeOnboardingUrl = input.onboardingTextUrl ? escapeHtml(input.onboardingTextUrl) : null;
  return {
    to: input.email ?? "",
    subject: `You're invited to join ${companyLabel}`,
    text: [
      `You've been invited to join ${companyLabel} in Paperclip.`,
      "",
      "Accept the invite:",
      input.inviteUrl,
      ...(input.onboardingTextUrl
        ? ["", "Onboarding instructions:", input.onboardingTextUrl]
        : []),
      "",
      "If you were not expecting this invitation, you can ignore this email.",
    ].join("\n"),
    html: [
      "<div style=\"font-family: Arial, sans-serif; line-height: 1.6; color: #111827;\">",
      `<p>You've been invited to join <strong>${safeCompanyLabel}</strong> in Paperclip.</p>`,
      `<p><a href="${safeInviteUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;">Accept invite</a></p>`,
      `<p style="word-break:break-all;"><a href="${safeInviteUrl}">${safeInviteUrl}</a></p>`,
      ...(safeOnboardingUrl
        ? [
            "<p>Onboarding instructions:</p>",
            `<p style="word-break:break-all;"><a href="${safeOnboardingUrl}">${safeOnboardingUrl}</a></p>`,
          ]
        : []),
      "<p>If you were not expecting this invitation, you can ignore this email.</p>",
      "</div>",
    ].join(""),
  };
}

function clientWorkOrderUpdateEmailTemplate(input: ClientWorkOrderEmailInput): EmailContent {
  const greetingName = escapeHtml(displayName(input.clientName));
  const safeCompanyName = escapeHtml(input.companyName?.trim() || "AMX Air Hubs");
  const safeIssueIdentifier = escapeHtml(input.issueIdentifier);
  const safeIssueTitle = escapeHtml(input.issueTitle);
  const safeStageLabel = escapeHtml(input.stageLabel);
  const safeStatusSummary = escapeHtml(input.statusSummary);
  const safeIntro = escapeHtml(input.intro?.trim() || "Here is your latest microservice work-order update.");
  const safeNextStep = escapeHtml(input.nextStep?.trim() || "Reply to this email if you want us to adjust scope, sequencing, or delivery timing.");
  const safeCustomMessage = input.customMessage?.trim() ? escapeHtml(input.customMessage.trim()) : null;
  const timeCardLines = input.timeCardLines.length > 0 ? input.timeCardLines : ["No time cards recorded yet."];

  return {
    to: input.email ?? "",
    subject: `${input.issueIdentifier} · ${input.stageLabel} update`,
    text: [
      `Hi ${displayName(input.clientName)},`,
      "",
      safeIntro,
      "",
      `${input.issueIdentifier}: ${input.issueTitle}`,
      `Stage: ${input.stageLabel}`,
      `Status: ${input.statusSummary}`,
      `Tracked hours: ${input.trackedHours.toFixed(1)}`,
      "",
      "Time cards:",
      ...timeCardLines,
      ...(safeCustomMessage ? ["", input.customMessage!.trim()] : []),
      "",
      `Next step: ${input.nextStep?.trim() || "Reply to this email if you want us to adjust scope, sequencing, or delivery timing."}`,
      "",
      `${safeCompanyName} · AMX Air Hubs`,
    ].join("\n"),
    html: [
      '<div style="font-family:Arial,sans-serif;line-height:1.65;color:#0f172a;background:#f8fafc;padding:24px;">',
      '<div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;">',
      '<div style="padding:28px 32px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:#f8fafc;">',
      '<p style="margin:0 0 8px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;opacity:0.8;">AMX Air Hubs Client Update</p>',
      `<h1 style="margin:0;font-size:28px;line-height:1.15;">${safeIssueIdentifier}</h1>`,
      `<p style="margin:8px 0 0;font-size:15px;opacity:0.88;">${safeIssueTitle}</p>`,
      "</div>",
      '<div style="padding:28px 32px;">',
      `<p style="margin:0 0 16px;font-size:16px;">Hi ${greetingName},</p>`,
      `<p style="margin:0 0 20px;font-size:15px;color:#334155;">${safeIntro}</p>`,
      '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 24px;">',
      `<div style="padding:14px 16px;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#64748b;">Stage</div><div style="margin-top:6px;font-size:16px;font-weight:700;color:#0f172a;">${safeStageLabel}</div></div>`,
      `<div style="padding:14px 16px;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#64748b;">Tracked Hours</div><div style="margin-top:6px;font-size:16px;font-weight:700;color:#0f172a;">${input.trackedHours.toFixed(1)}h</div></div>`,
      `<div style="padding:14px 16px;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#64748b;">Status</div><div style="margin-top:6px;font-size:16px;font-weight:700;color:#0f172a;">${safeStatusSummary}</div></div>`,
      "</div>",
      '<div style="margin:0 0 24px;padding:20px;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;">',
      '<p style="margin:0 0 12px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#64748b;">Work Order Tracking</p>',
      '<ul style="margin:0;padding-left:20px;color:#334155;font-size:14px;">',
      ...timeCardLines.map((line) => `<li style="margin:0 0 8px;">${escapeHtml(line)}</li>`),
      "</ul>",
      "</div>",
      ...(safeCustomMessage
        ? [`<div style="margin:0 0 20px;padding:18px 20px;border-radius:16px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;"><p style="margin:0;font-size:14px;">${safeCustomMessage}</p></div>`]
        : []),
      `<p style="margin:0 0 18px;font-size:14px;color:#334155;"><strong>Next step:</strong> ${safeNextStep}</p>`,
      `<p style="margin:0;font-size:13px;color:#64748b;">Sent by ${safeCompanyName} via AMX Air Hubs.</p>`,
      "</div></div></div>",
    ].join(""),
  };
}

export function createEmailService(config: Config) {
  const resendApiKey = config.resendApiKey?.trim();
  const from = config.emailFrom?.trim();
  const replyTo = config.emailReplyTo?.trim();
  const resend = resendApiKey ? new Resend(resendApiKey) : null;
  const enabled = Boolean(resend && from);

  async function send(content: EmailContent, options: SendOptions = {}): Promise<EmailDeliveryResult> {
    const to = content.to.trim();
    if (!to) {
      if (options.required) {
        throw new Error("Recipient email is required");
      }
      logger.warn({ subject: content.subject }, "Email skipped because no recipient email was provided");
      return {
        provider: "resend",
        accepted: false,
        messageId: null,
        recipient: "",
        subject: content.subject,
      };
    }
    if (!enabled || !resend || !from) {
      if (options.required) {
        throw new Error("Resend email is not configured");
      }
      logger.warn(
        {
          to,
          subject: content.subject,
          resendConfigured: Boolean(resendApiKey),
          fromConfigured: Boolean(from),
        },
        "Email delivery skipped because Resend is not configured",
      );
      return {
        provider: "resend",
        accepted: false,
        messageId: null,
        recipient: to,
        subject: content.subject,
      };
    }

    const response = await resend.emails.send({
      from,
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      ...(replyTo ? { replyTo } : {}),
    });

    if (response.error) {
      logger.error({ to, subject: content.subject, error: response.error }, "Resend email delivery failed");
      throw new Error(response.error.message || "Failed to send email with Resend");
    }

    logger.info(
      { to, subject: content.subject, emailId: response.data?.id ?? null },
      "Resend email sent",
    );
    return {
      provider: "resend",
      accepted: true,
      messageId: response.data?.id ?? null,
      recipient: to,
      subject: content.subject,
    };
  }

  return {
    enabled,
    provider: enabled ? "resend" : "disabled",
    async sendVerificationEmail(input: AuthEmailInput): Promise<EmailDeliveryResult> {
      return send(verificationEmailTemplate(input));
    },
    async sendPasswordResetEmail(input: AuthEmailInput): Promise<EmailDeliveryResult> {
      return send(passwordResetEmailTemplate(input));
    },
    async sendCompanyInviteEmail(input: CompanyInviteEmailInput): Promise<EmailDeliveryResult> {
      return send(companyInviteEmailTemplate(input), { required: true });
    },
    async sendClientWorkOrderUpdateEmail(input: ClientWorkOrderEmailInput): Promise<EmailDeliveryResult> {
      return send(clientWorkOrderUpdateEmailTemplate(input), { required: true });
    },
  };
}

export type { EmailDeliveryResult, EmailService };
