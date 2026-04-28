import { describe, expect, it } from "vitest";
import { buildCreateCompanyInviteInput } from "./company-invites";

describe("buildCreateCompanyInviteInput", () => {
  it("includes inviteeEmail when provided", () => {
    expect(
      buildCreateCompanyInviteInput({
        allowedJoinTypes: "human",
        targetEnvironment: "simulation",
        inviteeEmail: " teammate@example.com ",
      }),
    ).toEqual({
      allowedJoinTypes: "human",
      targetEnvironment: "simulation",
      inviteeEmail: "teammate@example.com",
    });
  });

  it("omits inviteeEmail when it is empty", () => {
    expect(
      buildCreateCompanyInviteInput({
        allowedJoinTypes: "agent",
        inviteeEmail: "   ",
      }),
    ).toEqual({
      allowedJoinTypes: "agent",
    });
  });
});
