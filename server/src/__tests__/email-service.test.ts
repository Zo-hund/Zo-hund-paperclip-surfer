import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isEmailConfigured, sendEmail } from "../auth/email-service.js";

const ORIGINAL = { ...process.env };

describe("email-service config detection", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL };
    vi.restoreAllMocks();
  });

  it("isEmailConfigured is false with no transport", () => {
    expect(isEmailConfigured()).toBe(false);
  });

  it("isEmailConfigured is true with RESEND_API_KEY", () => {
    process.env.RESEND_API_KEY = "re_test";
    expect(isEmailConfigured()).toBe(true);
  });

  it("isEmailConfigured is true with SMTP_HOST", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    expect(isEmailConfigured()).toBe(true);
  });

  it("sendEmail returns false (and does not throw) when no transport is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const delivered = await sendEmail({
      to: "x@example.com",
      subject: "s",
      text: "t",
      html: "<p>t</p>",
    });
    expect(delivered).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("sendEmail returns true when Resend accepts the message", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const delivered = await sendEmail({
      to: "x@example.com",
      subject: "s",
      text: "t",
      html: "<p>t</p>",
    });
    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }));
  });
});
