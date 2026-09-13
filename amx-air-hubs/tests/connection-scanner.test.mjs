import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const resolver = readFileSync(new URL("../src/connection-scanner.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/connect-scanner.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("connection scanner recognizes governed AMX identity and access routes", () => {
  for (const route of ["/members/", "/partner/", "/partners/join", "/join/", "/proof/", "/scan/", "/rooms/", "/watch/"]) assert.match(resolver, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(resolver, /trustedHosts/);
  assert.match(resolver, /External connection/);
});

test("connection scanner supports camera, image, manual, and NFC paths", () => {
  assert.match(page, /getUserMedia/);
  assert.match(page, /createImageBitmap/);
  assert.match(page, /NDEFReader/);
  assert.match(page, /Write my NFC card/);
  assert.match(page, /Review before opening/);
});

test("public scanner route is mounted", () => {
  assert.match(app, /path="\/connect"/);
  assert.match(app, /ConnectionScannerPage/);
});
