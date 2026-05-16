#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (args.length === 0) {
  process.exit(0);
}

for (const rel of args) {
  const target = path.resolve(process.cwd(), rel);
  fs.rmSync(target, { recursive: true, force: true });
}
