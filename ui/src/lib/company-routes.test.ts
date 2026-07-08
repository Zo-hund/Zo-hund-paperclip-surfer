import { describe, expect, it } from "vitest";
import {
  applyCompanyPrefix,
  extractCompanyPrefixFromPath,
  isBoardPathWithoutPrefix,
} from "./company-routes";

describe("company route helpers", () => {
  it("treats dispatch console pages as board routes that need the selected company prefix", () => {
    expect(isBoardPathWithoutPrefix("/dispatch/remote-work")).toBe(true);
    expect(extractCompanyPrefixFromPath("/dispatch/remote-work")).toBeNull();
    expect(applyCompanyPrefix("/dispatch/remote-work", "PAP")).toBe("/PAP/dispatch/remote-work");
  });

  it("does not treat a company whose prefix collides with a legacy reserved word (e.g. AMX) as a board route", () => {
    // "amx" used to be reserved for the dispatch-console pages; now that those pages live
    // under "dispatch/*", a company prefix of "AMX" resolves correctly as a real prefix.
    expect(isBoardPathWithoutPrefix("/amx/inbox/mine")).toBe(false);
    expect(extractCompanyPrefixFromPath("/amx/inbox/mine")).toBe("AMX");
    expect(applyCompanyPrefix("/inbox/mine", "AMX")).toBe("/AMX/inbox/mine");
  });
});
