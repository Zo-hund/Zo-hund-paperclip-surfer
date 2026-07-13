import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);
const clientDir = new URL("../dist/client/", import.meta.url);
await mkdir(clientDir, { recursive: true });
for (const entry of await readdir(dist, { withFileTypes: true })) {
  if (entry.name === "server" || entry.name === "client") continue;
  await cp(new URL(`../dist/${entry.name}`, import.meta.url), new URL(`../dist/client/${entry.name}`, import.meta.url), { recursive: true });
}
await mkdir(new URL("../dist/server/", import.meta.url), { recursive: true });
const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");
await writeFile(new URL("../dist/server/index.js", import.meta.url), worker.replace('"__AMX_APP_HTML__"', JSON.stringify(html)));
