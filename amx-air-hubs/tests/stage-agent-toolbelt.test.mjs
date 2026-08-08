import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const toolbelt = readFileSync(new URL("../src/stage-agent-toolbelt.ts", import.meta.url), "utf8");
const livekitPod = readFileSync(new URL("../src/LiveKitPod.tsx", import.meta.url), "utf8");
const stage = readFileSync(new URL("../src/pages/stage.tsx", import.meta.url), "utf8");
const agent = readFileSync(new URL("../../voice-agent/agent.py", import.meta.url), "utf8");

test("production toolbelt gates consequential actions and audits executions", () => {
  for (const action of ["camera.take", "screen.route", "media.load", "cue.fire", "stream.start", "stream.stop", "robot.inspect"]) {
    assert.match(toolbelt, new RegExp(`"${action.replace(".", "\\.")}"`));
  }
  assert.match(toolbelt, /approvalActions\.has\(command\.action\) && !command\.operatorApproved/);
  assert.match(toolbelt, /url\.startsWith\("https:\/\/"\)/);
  assert.match(toolbelt, /action: `agent\.\$\{command\.action\}`/);
});

test("LiveKit accepts production RPC only from an agent and Stage applies synchronized state", () => {
  assert.match(livekitPod, /registerRpcMethod\("production_control"/);
  assert.match(livekitPod, /if \(!caller\?\.isAgent\)/);
  assert.match(livekitPod, /normalizeStageAgentCommand\(parsed, safeRoom\)/);
  assert.match(stage, /applyStageAgentCommand\(production\.state, command\)/);
  assert.match(stage, /onProductionCommand=\{executeAgentProductionCommand\}/);
});

test("voice agent exposes governed live production tools", () => {
  for (const tool of ["control_camera", "route_stage_screen", "control_stage_media", "control_stage_audio", "fire_stage_cue", "set_stage_look", "control_public_stream", "request_robot_inspection"]) {
    assert.match(agent, new RegExp(`async def ${tool}\\(`));
  }
  assert.match(agent, /Never claim a production action happened unless the tool returns executed/);
  assert.match(agent, /_is_amx_operator/);
});
