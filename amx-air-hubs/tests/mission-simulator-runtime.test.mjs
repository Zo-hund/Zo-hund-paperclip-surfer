import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/mission-world/simulator.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const simulator = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const plan = "Configure the required system, test the injected event, review safety evidence, improve weak results, and request human approval.";

test("complete client configurations clear the score and safety deployment gates", () => {
  for (const scenario of Object.values(simulator.SIMULATOR_SCENARIOS)) {
    const configuration = { role: scenario.roles[0], toolIds: [...scenario.requiredTools], safeguardIds: scenario.safeguards.map((entry) => entry.id), plan };
    const result = simulator.runMissionSimulation(scenario, configuration, "solo", 1);
    assert.equal(result.deploymentEligible, true, `${scenario.id} should be eligible`);
    assert.ok(result.score >= 70, `${scenario.id} should meet the weighted threshold`);
    assert.equal(result.criticalFailures.length, 0);
  }
});

test("critical safeguards block deployment regardless of the remaining configuration", () => {
  for (const scenario of Object.values(simulator.SIMULATOR_SCENARIOS)) {
    const critical = scenario.safeguards.find((entry) => entry.critical);
    const configuration = { role: scenario.roles[0], toolIds: scenario.tools.map((entry) => entry.id), safeguardIds: scenario.safeguards.filter((entry) => entry.id !== critical.id).map((entry) => entry.id), plan };
    const result = simulator.runMissionSimulation(scenario, configuration, "teams", 1);
    assert.equal(result.deploymentEligible, false, `${scenario.id} must fail without ${critical.label}`);
    assert.ok(result.criticalFailures.some((failure) => failure.includes(critical.label)));
  }
});

test("missing outcome capabilities and unhandled events cannot pass on aggregate score", () => {
  for (const scenario of Object.values(simulator.SIMULATOR_SCENARIOS)) {
    const event = scenario.events[0];
    const omitted = event.responseTool || scenario.requiredTools[0];
    const configuration = { role: scenario.roles[0], toolIds: scenario.requiredTools.filter((id) => id !== omitted), safeguardIds: scenario.safeguards.map((entry) => entry.id), plan };
    const result = simulator.runMissionSimulation(scenario, configuration, "teams", 1);
    assert.equal(result.deploymentEligible, false, `${scenario.id} must fail with an outcome gap`);
    assert.ok(result.consequences.length > 0);
  }
});
