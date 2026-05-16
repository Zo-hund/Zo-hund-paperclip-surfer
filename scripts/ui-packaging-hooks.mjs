#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.resolve(scriptDir, "..", "ui");
const packageJsonPath = path.join(uiDir, "package.json");
const packageDevPath = path.join(uiDir, "package.dev.json");

if (mode === "prepack") {
  fs.rmSync(packageDevPath, { force: true });
  fs.copyFileSync(packageJsonPath, packageDevPath);
  process.exit(0);
}

if (mode === "postpack") {
  if (fs.existsSync(packageDevPath)) {
    fs.renameSync(packageDevPath, packageJsonPath);
  }
  process.exit(0);
}

console.error("Usage: node scripts/ui-packaging-hooks.mjs <prepack|postpack>");
process.exit(1);
