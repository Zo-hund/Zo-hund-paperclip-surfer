import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmailService } from "../services/email.js";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: sendMock,
    },
  })),
}));

describe("createEmailService", () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });

  it("sends invite emails with invite and onboarding links", async () => {
    const service = createEmailService({
      resendApiKey: "re_test",
      emailFrom: "Paperclip <invite@example.com>",
      emailReplyTo: "help@example.com",
    } as any);

    const result = await service.sendCompanyInviteEmail({
      email: "teammate@example.com",
      companyName: "Acme Labs",
      inviteUrl: "https://paperclip.example.com/invite/token-123",
      onboardingTextUrl: "https://paperclip.example.com/api/invites/token-123/onboarding.txt",
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "teammate@example.com",
        subject: expect.stringContaining("Acme Labs"),
        text: expect.stringContaining("/invite/token-123"),
        html: expect.stringContaining("/api/invites/token-123/onboarding.txt"),
      }),
    );
    expect(result).toEqual({
      provider: "resend",
      accepted: true,
      messageId: "email-1",
      recipient: "teammate@example.com",
      subject: "You're invited to join Acme Labs",
    });
  });

  it("rejects invite email sending when Resend is not configured", async () => {
    const service = createEmailService({} as any);

    await expect(
      service.sendCompanyInviteEmail({
        email: "teammate@example.com",
        inviteUrl: "https://paperclip.example.com/invite/token-123",
      }),
    ).rejects.toThrow("Resend email is not configured");
  });
});
