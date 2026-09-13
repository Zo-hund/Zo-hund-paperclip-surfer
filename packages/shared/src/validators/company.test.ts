import { describe, expect, it } from "vitest";
import {
  createCompanySchema,
  updateCompanyBrandingSchema,
  updateCompanySchema,
} from "./company.js";
import { portabilityCompanyManifestEntrySchema } from "./company-portability.js";

describe("company schemas with AMX branding compatibility", () => {
  it("strips brandColor and attachmentMaxBytes from a create payload", () => {
    const parsed = createCompanySchema.parse({
      name: "Acme",
      brandColor: "#123456",
      attachmentMaxBytes: 25_000_000,
    });

    expect(parsed).not.toHaveProperty("brandColor");
    expect(parsed).not.toHaveProperty("attachmentMaxBytes");
    expect(parsed.name).toBe("Acme");
  });

  it("preserves AMX brandColor and strips attachmentMaxBytes from an update payload", () => {
    const parsed = updateCompanySchema.parse({
      description: "Updated",
      brandColor: "#123456",
      attachmentMaxBytes: 25_000_000,
    });

    expect(parsed.brandColor).toBe("#123456");
    expect(parsed).not.toHaveProperty("attachmentMaxBytes");
    expect(parsed.description).toBe("Updated");
  });

  it("accepts AMX brandColor on the strict branding schema", () => {
    const result = updateCompanyBrandingSchema.safeParse({
      name: "Acme",
      brandColor: "#123456",
    });

    expect(result.success).toBe(true);
  });

  it("still accepts the remaining branding fields", () => {
    const result = updateCompanyBrandingSchema.safeParse({
      name: "Acme",
      description: null,
      logoAssetId: "11111111-1111-4111-8111-111111111111",
    });

    expect(result.success).toBe(true);
  });

  it("requires at least one branding field", () => {
    expect(updateCompanyBrandingSchema.safeParse({}).success).toBe(false);
  });
});

describe("portability company manifest tolerance", () => {
  it("retains AMX branding in legacy manifests while ignoring the retired attachment limit", () => {
    const parsed = portabilityCompanyManifestEntrySchema.parse({
      path: "company.md",
      name: "Acme",
      description: null,
      brandColor: "#5c5fff",
      logoPath: null,
      attachmentMaxBytes: 25_000_000,
      requireBoardApprovalForNewAgents: false,
    });

    expect(parsed.brandColor).toBe("#5c5fff");
    expect(parsed).not.toHaveProperty("attachmentMaxBytes");
    expect(parsed.name).toBe("Acme");
  });
});
