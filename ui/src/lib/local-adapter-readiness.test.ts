import { describe, expect, it } from "vitest";
import {
  DEFAULT_ONBOARDING_ADAPTER,
  LOCAL_ADAPTER_FALLBACK_ORDER,
  getAdapterLabel,
  getDefaultModelForAdapter,
} from "./local-adapter-readiness";

describe("local adapter readiness helpers", () => {
  it("uses the intended onboarding fallback order", () => {
    expect(LOCAL_ADAPTER_FALLBACK_ORDER.map((entry) => entry.type)).toEqual([
      "opencode_local",
      "codex_local",
      "gemini_local",
      "claude_local",
    ]);
    expect(DEFAULT_ONBOARDING_ADAPTER).toBe("opencode_local");
  });

  it("returns stable labels and default models", () => {
    expect(getAdapterLabel("opencode_local")).toBe("OpenCode");
    expect(getAdapterLabel("claude_local")).toBe("Claude Code");
    expect(getDefaultModelForAdapter("opencode_local")).toBe("");
    expect(getDefaultModelForAdapter("codex_local")).not.toBe("");
    expect(getDefaultModelForAdapter("gemini_local")).not.toBe("");
  });
});
