import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("member WebXR venues", () => {
  test("protects the venue route and grants production writes only to operators", async () => {
    const [app, page] = await Promise.all([read("src/App.tsx"), read("src/pages/stage-venue.tsx")]);
    assert.match(app, /path="\/venues\/:venueId" element={<RequireMember>/);
    assert.match(page, /membership_role === "operator"/);
    assert.match(page, /useStageProduction\(room, \{ readOnly: !isOperator \}\)/);
    assert.match(page, /\["theater", "arena", "expo-hall"\]/);
  });

  test("supports native immersive sessions and Quest locomotion", async () => {
    const world = await read("src/StageVenueWorld.tsx");
    assert.match(world, /renderer\.xr\.enabled = true/);
    assert.match(world, /"immersive-vr"/);
    assert.match(world, /"immersive-ar"/);
    assert.match(world, /requiredFeatures: \["local-floor"\]/);
    assert.match(world, /"hand-tracking"/);
    assert.match(world, /getController\(index\)/);
    assert.match(world, /snap-turns/);
    assert.match(world, /squeezestart/);
    assert.match(world, /VenueOperatorConsole/);
    assert.match(world, /resolveVenueMovement/);
    assert.match(world, /ControllerLaser_/);
    assert.match(world, /TrackedController_/);
    assert.match(world, /controller\.visible = true/);
    assert.match(world, /getControllerGrip\(index\)/);
    assert.match(world, /grip\.visible = !source\.hand && !xrConsole\.group\.visible/);
    assert.match(world, /intersectObject\(xrConsole\.group\.children\[0\], false\)/);
  });

  test("connects operator camera, agent, and human-team production controls", async () => {
    const [page, world, controls] = await Promise.all([read("src/pages/stage-venue.tsx"), read("src/StageVenueWorld.tsx"), read("src/stage-venue-production.ts")]);
    assert.match(page, /clientType=\{isOperator \? "operator" : "venue-member"\}/);
    assert.match(page, /sendNpcCommand\(next\)/);
    assert.match(page, /onRemoteNpcCommand=\{setNpcCommand\}/);
    assert.match(world, /ProductionCameraRig/);
    assert.match(world, /followTargetRef/);
    assert.match(controls, /kind: "crew"/);
    assert.match(controls, /resolveVenueMovement/);
    assert.match(controls, /venueCommandFromVoice/);
    assert.match(controls, /phrase\.includes\("agent"\)/);
    assert.match(page, /webkitSpeechRecognition/);
    assert.match(page, /Voice control listening for one production command/);
  });

  test("bounds and throttles shared member poses", async () => {
    const presence = await read("src/stage-venue-presence.ts");
    assert.match(presence, /bounded\(value\.position\[0\], -28, 28\)/);
    assert.match(presence, /slice\(-48\)/);
    assert.match(presence, /now - lastPublishRef\.current < 100/);
    assert.match(presence, /type: "broadcast", event: "pose"/);
    assert.match(presence, /new BroadcastChannel/);
  });

  test("requests authenticated member media credentials", async () => {
    const [page, pod, worker, controls] = await Promise.all([read("src/pages/stage-venue.tsx"), read("src/LiveKitPod.tsx"), read("worker.js"), read("src/nexus-room-control.ts")]);
    assert.match(page, /"operator" : "venue-member"/);
    assert.match(pod, /clientType\?: "operator" \| "venue-member"/);
    assert.match(worker, /publicLiveKitRoomAllowed\(env, room\)/);
    assert.match(worker, /clientType = "venue-member"/);
    assert.match(controls, /value\.clientType === "venue-member"/);
  });
});
