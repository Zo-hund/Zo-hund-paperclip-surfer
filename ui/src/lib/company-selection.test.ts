import { describe, expect, it } from "vitest";
import { shouldSyncCompanySelectionFromRoute } from "./company-selection";

describe("shouldSyncCompanySelectionFromRoute", () => {
  it("does not resync when selection already matches the route", () => {
    expect(
      shouldSyncCompanySelectionFromRoute({
        selectionSource: "route_sync",
        selectedCompanyId: "pap",
        routeCompanyId: "pap",
      }),
    ).toBe(false);
  });

  it("syncs to the route company even after a manual switch (URL is authoritative)", () => {
    expect(
      shouldSyncCompanySelectionFromRoute({
        selectionSource: "manual",
        selectedCompanyId: "pap",
        routeCompanyId: "ret",
      }),
    ).toBe(true);
  });

  it("syncs back to the route company for non-manual mismatches", () => {
    expect(
      shouldSyncCompanySelectionFromRoute({
        selectionSource: "route_sync",
        selectedCompanyId: "pap",
        routeCompanyId: "ret",
      }),
    ).toBe(true);
  });

  it("syncs when selection is null and the route names a company", () => {
    expect(
      shouldSyncCompanySelectionFromRoute({
        selectionSource: "bootstrap",
        selectedCompanyId: null,
        routeCompanyId: "ret",
      }),
    ).toBe(true);
  });
});
