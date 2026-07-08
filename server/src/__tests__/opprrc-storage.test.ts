import { describe, expect, it } from "vitest";
import { assertIssueReadyForOpprcDelivery } from "../services/opprrc-storage.js";
import { HttpError } from "../errors.js";

describe("assertIssueReadyForOpprcDelivery", () => {
  it("passes when the issue is in the opprrc lifecycle stage", () => {
    expect(() => assertIssueReadyForOpprcDelivery({ lifecycleStage: "opprrc" })).not.toThrow();
  });

  it("throws a 409 conflict when the issue is in a different stage", () => {
    try {
      assertIssueReadyForOpprcDelivery({ lifecycleStage: "live" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(409);
    }
  });

  it("throws a 409 conflict when the issue has no lifecycle stage yet", () => {
    try {
      assertIssueReadyForOpprcDelivery({ lifecycleStage: null });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(409);
    }
  });
});
