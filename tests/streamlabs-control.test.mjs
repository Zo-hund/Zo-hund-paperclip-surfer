import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("connects pod and stage controls to the local authenticated Streamlabs RPC API", () => {
  const control = read("src/StreamlabsControl.tsx");
  const stage = read("src/pages/stage.tsx");
  const pod = read("src/NexusBroadcastConsole.tsx");
  const worker = read("worker.js");
  assert.match(control, /127\.0\.0\.1:59650\/api/);
  assert.match(control, /TcpServerService/);
  assert.match(control, /makeSceneActive/);
  assert.match(control, /toggleStreaming/);
  assert.match(control, /toggleRecording/);
  assert.match(control, /window\.confirm/);
  assert.doesNotMatch(control, /localStorage|sessionStorage/);
  assert.match(stage, /<StreamlabsControl room=\{production\.room\}/);
  assert.match(pod, /<StreamlabsControl room=\{roomCode\}/);
  assert.match(worker, /http:\/\/127\.0\.0\.1:59650/);
});
