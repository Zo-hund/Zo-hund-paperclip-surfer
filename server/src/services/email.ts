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
  };
}

export type { EmailDeliveryResult, EmailService };
