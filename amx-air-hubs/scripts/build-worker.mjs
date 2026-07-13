import { copyFile, cp, mkdir, readdir } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);
const staticDir = new URL("../dist/static/", import.meta.url);
await mkdir(staticDir, { recursive: true });
for (const entry of await readdir(dist, { withFileTypes: true })) {
  if (entry.name === "server" || entry.name === "static") continue;
  await cp(new URL(`../dist/${entry.name}`, import.meta.url), new URL(`../dist/static/${entry.name}`, import.meta.url), { recursive: true });
}
await mkdir(new URL("../dist/server/", import.meta.url), { recursive: true });
await copyFile(new URL("../worker.js", import.meta.url), new URL("../dist/server/index.js", import.meta.url));
