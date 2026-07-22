import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const json = (path) => read(path).then(JSON.parse);
const missions = await json("src/mission-world/missions.json");
const learning = await read("src/mission-world/learning-catalog.ts");
const progress = await read("src/mission-world/progress-store.ts");
const gamification = await read("src/mission-world/gamification.ts");
const engine = await read("src/mission-world/mission-engine.ts");
const multiplayer = await read("src/mission-world/multiplayer.ts");
const xr = await read("src/mission-world/xr-capabilities.ts");
const proof = await read("src/mission-world/opprrc.ts");
const simulator = await read("src/mission-world/simulator.ts");
const world = await read("src/MissionWorld.tsx");
const routes = await read("src/App.tsx");
const runway = await read("src/pages/core.tsx");

test("Mission World is a protected native route launched from the Mission Runway", () => {
  assert.match(routes, /path="\/missions\/world" element={<RequireMember>/);
  assert.match(routes, /import\("\.\/MissionWorld"\)/);
  assert.match(runway, /to="\/missions\/world"/);
  assert.doesNotMatch(world, /cdn\.jsdelivr|importmap|iframe/);
});

test("learner layer contains five six-checkpoint modules", () => {
  assert.equal(missions.length, 5);
  for (const moduleId of ["ai", "xr", "robotics", "automation", "builder"]) {
    assert.match(learning, new RegExp(`${moduleId}: \\[([\\s\\S]*?)\\n  \\]`));
  }
  assert.equal((learning.match(/lesson\("/g) || []).length, 30);
  for (const title of ["What AI is", "Build a simple AI assistant", "AR vs VR vs MR", "Build an XR scene", "Program a mission robot", "Build an automation pipeline", "Save and publish a world"]) assert.match(learning, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("mission JSON preserves rewards, modes, objectives, and evidence", () => {
  const expected = [["AI 101", 100, "AI Apprentice"], ["XR Foundations", 120, "Reality Shifter"], ["Robotics", 140, "Robot Wrangler"], ["Automations", 130, "Flow Architect"], ["World Builder", 160, "World Builder"]];
  expected.forEach(([title, xp, badge], index) => {
    assert.equal(missions[index].title, title);
    assert.equal(missions[index].xp, xp);
    assert.equal(missions[index].badge, badge);
    assert.deepEqual(missions[index].modes, ["web", "ar", "vr", "mr"]);
    assert.ok(missions[index].objectives.length >= 4);
    assert.ok(missions[index].evidence.length >= 3);
  });
});

test("platform modules own normalized state, progression, runtime, multiplayer, and XR", () => {
  assert.match(progress, /normalizeMissionWorldProgress/);
  assert.match(progress, /completeLesson/);
  assert.match(progress, /recordAttempt/);
  assert.match(gamification, /"Explorer", "Creator", "Designer", "Developer", "Engineer", "World Architect"/);
  assert.match(gamification, /world-architect-kit/);
  assert.match(engine, /allLessonsComplete/);
  assert.match(engine, /formatMissionTime/);
  assert.match(multiplayer, /"individual", "team", "school", "organization", "community", "seasonal"/);
  assert.match(multiplayer, /Connect this mission to a live Skill Pod/);
  assert.match(xr, /supports\("immersive-vr"\)/);
  assert.match(xr, /supports\("immersive-ar"\)/);
});

test("unique completion applies bonuses and issues lesson-scoped OPPRRC evidence", () => {
  assert.match(world, /if \(completed\)/);
  assert.match(gamification, /first \? 50 : 0/);
  assert.match(gamification, /mastery \? 250 : 0/);
  assert.match(gamification, /mastery \? 100 : 0/);
  assert.match(proof, /createProofRecord\(missionWorldAsMission/);
  assert.match(proof, /lesson:\$\{lessonId\}/);
  assert.match(proof, /mode:\$\{mode\}/);
  assert.match(proof, /canvas\.toDataURL\("image\/jpeg", 0\.62\)/);
});

test("Three.js capstones are gated by lessons and use real scene interaction", () => {
  assert.match(world, /new THREE\.WebGLRenderer/);
  assert.match(world, /preserveDrawingBuffer: true/);
  assert.match(world, /raycaster\.intersectObjects\(portalMeshes/);
  assert.match(world, /raycaster\.intersectObject\(floor/);
  assert.match(world, /allLessonsComplete\(activeWorld, progress\)/);
  assert.match(world, /activeId === "builder" && capstoneUnlocked/);
  assert.match(world, /builtCount >= 3/);
});

test("capstones are real client simulators rather than answer-choice trivia", () => {
  assert.equal((simulator.match(/client: "/g) || []).length, 5);
  for (const client of ["Northside Community Network", "Regional Career Collaborative", "East Hall Community Center", "AMX XR Event Operations", "Neighborhood Learning Lab"]) assert.match(simulator, new RegExp(client));
  assert.match(simulator, /budget: 90/);
  assert.match(simulator, /timeLimit: 75/);
  assert.match(simulator, /ProfessionalRole/);
  assert.match(world, /Assign responsibility/);
  assert.match(world, /Run simulation/);
  assert.doesNotMatch(world, /activeWorld\.activity === "choice"/);
});

test("weighted scoring cannot bypass critical safety failures", () => {
  assert.match(simulator, /outcomeQuality \* \.30/);
  assert.match(simulator, /technicalAccuracy \* \.20/);
  assert.match(simulator, /safety \* \.15/);
  assert.match(simulator, /efficiency \* \.10/);
  assert.match(simulator, /creativity \* \.10/);
  assert.match(simulator, /teamwork \* \.10/);
  assert.match(simulator, /evidenceQuality \* \.05/);
  assert.match(simulator, /entry\.critical && !configuration\.safeguardIds\.includes/);
  assert.match(simulator, /score >= 70 && criticalFailures\.length === 0 && requiredCoverage === 1 && eventHandled/);
});

test("runs inject consequences, persist improvement evidence, and require approval", () => {
  assert.match(simulator, /events\[\(Math\.max\(1, run\) - 1\) % scenario\.events\.length\]/);
  assert.match(simulator, /The configured system could not recover/);
  assert.match(progress, /recordSimulationRun/);
  assert.match(progress, /bestScore: Math\.max/);
  assert.match(progress, /approveSimulation/);
  assert.match(world, /Approve at human Pit Stop/);
  for (const field of ["role:", "score:", "tool:", "safety:", "event:", "approval:"]) assert.match(proof, new RegExp(field));
});
