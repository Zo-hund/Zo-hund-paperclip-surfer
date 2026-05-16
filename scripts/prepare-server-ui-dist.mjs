#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const uiDist = path.join(repoRoot, "ui", "dist");
const serverUiDist = path.join(repoRoot, "server", "ui-dist");

console.log("  -> Building @paperclipai/ui...");
const build = spawnSync("pnpm", ["--dir", repoRoot, "--filter", "@paperclipai/ui", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const indexHtml = path.join(uiDist, "index.html");
if (!fs.existsSync(indexHtml)) {
  console.error(`Error: UI build output missing at ${indexHtml}`);
  process.exit(1);
}

fs.rmSync(serverUiDist, { recursive: true, force: true });
fs.cpSync(uiDist, serverUiDist, { recursive: true });
console.log("  -> Copied ui/dist to server/ui-dist");
