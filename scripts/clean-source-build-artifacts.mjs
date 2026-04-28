#!/usr/bin/env node
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv.includes("--write") ? "write" : "check";
const artifactPattern = /\.(?:js|js\.map|d\.ts|d\.ts\.map)$/;
const sourceRoots = [
  "packages/shared/src",
  "packages/adapter-utils/src",
  "packages/adapters/claude-local/src",
  "packages/adapters/codex-local/src",
  "packages/adapters/cursor-local/src",
  "packages/adapters/gemini-local/src",
  "packages/adapters/hermes-advanced/src",
  "packages/adapters/hermes-local/src",
  "packages/adapters/openclaw-gateway/src",
  "packages/adapters/opencode-local/src",
  "packages/adapters/pi-local/src",
];

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function collectArtifacts(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      await collectArtifacts(fullPath, out);
      continue;
    }
    if (entry.isFile() && artifactPattern.test(entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}

const roots = [];
for (const relativeRoot of sourceRoots) {
  const absoluteRoot = path.resolve(repoRoot, relativeRoot);
  if (!absoluteRoot.startsWith(repoRoot + path.sep)) {
    throw new Error(`Refusing to scan outside repo: ${absoluteRoot}`);
  }
  if (await exists(absoluteRoot)) roots.push(absoluteRoot);
}

const artifacts = [];
for (const root of roots) {
  await collectArtifacts(root, artifacts);
}

if (mode === "write") {
  for (const artifact of artifacts) {
    if (!artifact.startsWith(repoRoot + path.sep)) {
      throw new Error(`Refusing to delete outside repo: ${artifact}`);
    }
    await rm(artifact, { force: true });
  }
  console.log(`Removed ${artifacts.length} generated source artifact(s).`);
} else if (artifacts.length > 0) {
  console.error("Generated source artifacts found:");
  for (const artifact of artifacts) {
    console.error(`- ${path.relative(repoRoot, artifact)}`);
  }
  console.error("Run `pnpm clean:source-artifacts` to remove them.");
  process.exit(1);
} else {
  console.log("No generated source artifacts found.");
}
