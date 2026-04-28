import { describe, expect, it } from "vitest";
import { createCompanyInviteSchema } from "./access.js";

describe("createCompanyInviteSchema", () => {
  it("defaults targetEnvironment to simulation", () => {
    expect(
      createCompanyInviteSchema.parse({
        allowedJoinTypes: "human",
      }),
    ).toMatchObject({
      allowedJoinTypes: "human",
      targetEnvironment: "simulation",
    });
  });

  it("accepts an explicit live targetEnvironment", () => {
    expect(
      createCompanyInviteSchema.parse({
        allowedJoinTypes: "agent",
        targetEnvironment: "live",
      }),
    ).toMatchObject({
      allowedJoinTypes: "agent",
      targetEnvironment: "live",
    });
  });
});
