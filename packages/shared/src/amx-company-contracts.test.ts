import { describe, expect, it } from "vitest";
import { updateCompanyBrandingSchema, updateCompanySchema } from "./validators/company.js";

describe("AMX company contracts", () => {
  it("retains an explicit private directory setting without introducing an omitted setting", () => {
    expect(updateCompanySchema.parse({ isPublic: false, tagline: null })).toMatchObject({ isPublic: false, tagline: null });
    expect(updateCompanySchema.parse({ name: "AMX" })).not.toHaveProperty("isPublic");
  });
  it("permits a color-only branding change and clearing a color", () => {
    expect(updateCompanyBrandingSchema.parse({ brandColor: "#123456" })).toEqual({ brandColor: "#123456" });
    expect(updateCompanyBrandingSchema.parse({ brandColor: null })).toEqual({ brandColor: null });
  });
  it("rejects invalid colors, long public copy and agent visibility mutations through branding", () => {
    expect(updateCompanySchema.safeParse({ brandColor: "url(unsafe)" }).success).toBe(false);
    expect(updateCompanySchema.safeParse({ tagline: "x".repeat(201) }).success).toBe(false);
    expect(updateCompanyBrandingSchema.safeParse({ isPublic: true }).success).toBe(false);
  });
});
