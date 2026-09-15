import { describe, expect, it } from "vitest";
import { buildMemoryPrompt } from "../services/agent-runtime/memory-prompt.js";

describe("operator opt-in memory capture", () => {
  it.each([undefined, false, "true", 1, {}])("retains read-only memory without authorizing writes for %s", (memoryCapture) => {
    expect(buildMemoryPrompt({ memorySection: "Saved factual context\n", memoryCapture, experimentSection: "Current experiment" }))
      .toBe("Saved factual context\nCurrent experiment");
  });
  it("adds nothing to a default empty memory context", () => {
    expect(buildMemoryPrompt({ memorySection: "" })).toBe("");
  });
  it("uses global scope and no projectId when no verified project exists", () => {
    const prompt = buildMemoryPrompt({ memorySection: "", memoryCapture: true });
    expect(prompt).toContain('"scope":"global"');
    expect(prompt).not.toContain('"projectId"');
    expect(prompt).toContain("POST /api/agents/me/memories");
    expect(prompt).toContain("structured JSON serialization");
  });
  it("uses exactly the verified project and preserves existing memory", () => {
    const prompt = buildMemoryPrompt({ memorySection: "Existing learning\n", memoryCapture: true, verifiedProjectId: "project-verified" });
    expect(prompt).toContain('"scope":"project","projectId":"project-verified"');
    expect(prompt.startsWith("Existing learning\n")).toBe(true);
    expect(prompt).toContain("do not substitute company, agent, or issue IDs");
  });
});
