import { describe, expect, it } from "vitest";
import {
  applyCompanyPrefix,
  extractCompanyPrefixFromPath,
  isBoardPathWithoutPrefix,
} from "./company-routes";

describe("company route helpers", () => {
  it("treats AMX pages as board routes that need the selected company prefix", () => {
    expect(isBoardPathWithoutPrefix("/amx/remote-work")).toBe(true);
    expect(extractCompanyPrefixFromPath("/amx/remote-work")).toBeNull();
    expect(applyCompanyPrefix("/amx/remote-work", "PAP")).toBe("/PAP/amx/remote-work");
  });
});
