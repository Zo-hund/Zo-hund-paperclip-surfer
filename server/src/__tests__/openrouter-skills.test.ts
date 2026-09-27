import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadOpenRouterSkills } from "../../../packages/adapters/openrouter/src/server/skills.js";
afterEach(() => vi.restoreAllMocks());
describe("OpenRouter assigned skills", () => {
  const entries = [
    { key: "core/paperclip", source: "/skills/paperclip", required: true },
    { key: "core/memory", source: "/skills/memory" },
    { key: "other/unused", source: "/skills/unused" },
  ];
  it("loads required and selected skills but excludes unassigned catalog entries", async () => {
    const read = vi.spyOn(fs, "readFile").mockResolvedValue("Skill instructions");
    const text = await loadOpenRouterSkills({ paperclipRuntimeSkills: entries, paperclipSkillSync: { desiredSkills: ["core/memory"] } });
    expect(read).toHaveBeenCalledTimes(2);
    expect(text).toContain("core/paperclip"); expect(text).toContain("core/memory"); expect(text).not.toContain("other/unused");
  });
  it("fails before inference if assigned instructions are missing", async () => {
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("ENOENT"));
    await expect(loadOpenRouterSkills({ paperclipRuntimeSkills: entries })).rejects.toThrow("could not be read");
  });
  it("does not silently ignore an unknown selected skill", async () => {
    await expect(loadOpenRouterSkills({ paperclipSkillSync: { desiredSkills: ["missing"] } })).rejects.toThrow("unavailable");
  });
});
