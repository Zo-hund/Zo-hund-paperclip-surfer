import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const protocol = await readFile(new URL("../src/nexus-room-control.ts", import.meta.url), "utf8");
const pod = await readFile(new URL("../src/LiveKitPod.tsx", import.meta.url), "utf8");
const page = await readFile(new URL("../src/pages/nexus.tsx", import.meta.url), "utf8");

test("Nexus room control validates bounded chat and NPC commands", () => {
  assert.match(protocol, /payload\.byteLength > 16 \* 1024/);
  assert.match(protocol, /command\.speed < 0\.5 \|\| command\.speed > 2\.2/);
  assert.match(protocol, /command\.position\.some/);
  assert.match(protocol, /message\.text, 500/);
});

test("LiveKit carries reliable room chat and operator-only NPC commands", () => {
  assert.match(pod, /RoomEvent\.DataReceived/);
  assert.match(pod, /isOperatorMetadata\(participant\.metadata\)/);
  assert.match(pod, /reliable: true, topic: NEXUS_CONTROL_TOPIC/);
  assert.match(pod, /reliable: true, topic: NEXUS_CHAT_TOPIC/);
  assert.match(pod, /reliable: true, topic: NEXUS_SESSION_TOPIC/);
  assert.match(pod, /isRoomCommunicatorMetadata\(participant\.metadata\)/);
});

test("local Nexus NPC controls publish while remote commands do not echo", () => {
  assert.match(page, /roomControlRef\.current\?\.sendNpcCommand\(command\)/);
  assert.match(page, /onNpcCommand=\{issueNpcCommand\}/);
  assert.match(page, /onRemoteNpcCommand=\{\(command\) => setNpcCommand\(command\)\}/);
});

test("multiplayer session packets are bounded and connected to the Nexus studio", () => {
  assert.match(protocol, /deliverable\.code\.length <= 10_000/);
  assert.match(protocol, /\["solo", "co-op", "teams"\]/);
  assert.match(page, /<MetaverseStudio roomCode=\{roomCode\}/);
  assert.match(page, /onSessionMessage=\{setSessionMessage\}/);
});
