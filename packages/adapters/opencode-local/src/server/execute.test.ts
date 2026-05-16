import { describe, expect, it } from "vitest";
import { classifyOpenCodeRunContext, planOpenCodeExecution } from "./execute.js";

describe("classifyOpenCodeRunContext", () => {
  it("classifies timer heartbeats as routine", () => {
    expect(
      classifyOpenCodeRunContext({
        wakeSource: "timer",
        wakeReason: "heartbeat_tick",
      }),
    ).toBe("routine");
  });

  it("classifies comment wakes as commentary", () => {
    expect(
      classifyOpenCodeRunContext({
        wakeReason: "issue_comment_mentioned",
        wakeCommentId: "comment-1",
      }),
    ).toBe("commentary");
  });

  it("classifies assignment wakes as tasking", () => {
    expect(
      classifyOpenCodeRunContext({
        wakeReason: "issue_assigned",
      }),
    ).toBe("tasking");
  });
});

describe("planOpenCodeExecution", () => {
  it("uses compact resume strategy for resumed routine wakes", () => {
    expect(
      planOpenCodeExecution({
        context: { wakeSource: "timer", wakeReason: "heartbeat_tick" },
        hasSession: true,
        configuredVariant: "",
        hasBootstrapPrompt: true,
        hasSessionHandoff: false,
      }),
    ).toEqual({
      runClass: "routine",
      promptStrategy: "compact_resume",
      includeInstructions: false,
      includeBootstrapPrompt: false,
      effectiveVariant: "low",
      optimizationNotes: [
        'Applied adaptive OpenCode variant "low" for routine wake.',
        "Skipped repeated instructions/bootstrap for resumed low-risk wake.",
      ],
    });
  });

  it("keeps instructions but skips bootstrap after session rotation on low-risk wakes", () => {
    expect(
      planOpenCodeExecution({
        context: { wakeReason: "issue_comment_mentioned", wakeCommentId: "comment-1" },
        hasSession: false,
        configuredVariant: "",
        hasBootstrapPrompt: true,
        hasSessionHandoff: true,
      }),
    ).toEqual({
      runClass: "commentary",
      promptStrategy: "handoff_resume",
      includeInstructions: true,
      includeBootstrapPrompt: false,
      effectiveVariant: "low",
      optimizationNotes: [
        'Applied adaptive OpenCode variant "low" for commentary wake.',
        "Used handoff-first prompt assembly after session rotation for low-risk wake.",
      ],
    });
  });

  it("preserves full bootstrap for tasking wakes", () => {
    expect(
      planOpenCodeExecution({
        context: { wakeReason: "issue_assigned" },
        hasSession: false,
        configuredVariant: "high",
        hasBootstrapPrompt: true,
        hasSessionHandoff: false,
      }),
    ).toEqual({
      runClass: "tasking",
      promptStrategy: "full_bootstrap",
      includeInstructions: true,
      includeBootstrapPrompt: true,
      effectiveVariant: "high",
      optimizationNotes: [],
    });
  });
});
