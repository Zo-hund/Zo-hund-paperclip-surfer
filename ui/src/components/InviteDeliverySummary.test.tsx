// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InviteDeliverySummary } from "./InviteDeliverySummary";

describe("InviteDeliverySummary", () => {
  it("renders delivery metadata when an invite email was attempted", () => {
    const html = renderToStaticMarkup(
      <InviteDeliverySummary
        delivery={{
          attempted: true,
          accepted: true,
          recipient: "teammate@example.com",
          provider: "resend",
          messageId: "email-123",
          subject: "You're invited to join Acme Labs",
        }}
      />,
    );

    expect(html).toContain("teammate@example.com");
    expect(html).toContain("Accepted by Resend");
    expect(html).toContain("email-123");
    expect(html).toContain("Search this subject in your mailbox");
    expect(html).toContain("You&#x27;re invited to join Acme Labs");
  });

  it("renders nothing for link-only invite creation", () => {
    const html = renderToStaticMarkup(
      <InviteDeliverySummary delivery={{ attempted: false }} />,
    );

    expect(html).toBe("");
  });
});
