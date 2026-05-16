import { describe, expect, it } from "vitest";
import {
  applyCompanyPrefix,
  extractCompanyPrefixFromPath,
  isBoardPathWithoutPrefix,
} from "./company-routes";

describe("company-routes board path detection", () => {
  it("treats pit-stop as a board path without a company prefix", () => {
    expect(isBoardPathWithoutPrefix("/pit-stop")).toBe(true);
    expect(extractCompanyPrefixFromPath("/pit-stop")).toBeNull();
  });

  it("applies the active company prefix to pit-stop links", () => {
    expect(applyCompanyPrefix("/pit-stop", "AMXA")).toBe("/AMXA/pit-stop");
  });
});
