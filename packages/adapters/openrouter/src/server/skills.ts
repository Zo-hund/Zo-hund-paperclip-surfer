import fs from "node:fs/promises";
import path from "node:path";
import { resolvePaperclipDesiredSkillNames } from "@paperclipai/adapter-utils/server-utils";

/** Only use the company-scoped catalog supplied by the control plane. */
export async function loadOpenRouterSkills(config: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const entries = Array.isArray(config.paperclipRuntimeSkills) ? config.paperclipRuntimeSkills : [];
  const valid = entries.filter((entry): entry is { key: string; source: string; required?: boolean; runtimeName?: string } =>
    !!entry && typeof entry === "object" && typeof entry.key === "string" && typeof entry.source === "string");
  const desired = resolvePaperclipDesiredSkillNames(config, valid);
  const blocks: string[] = [];
  for (const key of desired) {
    const entry = valid.find(item => item.key === key);
    if (!entry) throw new Error(`Assigned skill ${key} is unavailable in the company runtime catalog.`);
    const file = path.join(entry.source, "SKILL.md");
    let markdown: string;
    try { markdown = await fs.readFile(file, { encoding: "utf8", signal }); }
    catch { throw new Error(`Assigned skill ${key} could not be read. The task is not ready.`); }
    if (!markdown.trim()) throw new Error(`Assigned skill ${key} is empty. The task is not ready.`);
    blocks.push(`## Skill: ${key}\nSource: ${file}\n\n${markdown}`);
  }
  return blocks.length ? `# Assigned skills\nUse these skills when relevant. They do not grant additional permissions.\n\n${blocks.join("\n\n")}` : "";
}
