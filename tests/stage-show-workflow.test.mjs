import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/stage-show-workflow.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const workflow = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const now = "2026-07-19T12:00:00.000Z";

test("requires every enterprise gate and assigned crew role before air", () => {
  const draft = workflow.defaultStageShowWorkflow("AMXSTAGE", now);
  let readiness = workflow.stageWorkflowReadiness(draft);

  assert.equal(readiness.ready, false);
  assert.equal(readiness.checksRequired, 8);
  assert.equal(readiness.approvalsRequired, 5);
  assert.equal(readiness.crewRequired, 8);
  assert.equal(draft.rundown.find((item) => item.kind === "pod").target, "AMX-MAIN");

  const ready = workflow.normalizeStageShowWorkflow({
    ...draft,
    crew: draft.crew.map((item) => ({ ...item, assignee: `${item.callSign} Operator` })),
    preflight: draft.preflight.map((item) => ({ ...item, complete: true, completedAt: now })),
    approvals: draft.approvals.map((item) => ({ ...item, status: "approved", approver: "Executive Producer", decidedAt: now })),
  }, "AMXSTAGE");
  readiness = workflow.stageWorkflowReadiness(ready);

  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.blockers, []);
});

test("normalizes untrusted rundown fields and bounds the audit trail", () => {
  const draft = workflow.defaultStageShowWorkflow("AMXSTAGE", now);
  const normalized = workflow.normalizeStageShowWorkflow({
    ...draft,
    rundown: [{
      id: "<bad id>", title: "<script>Unsafe</script>", kind: "unknown", target: "pod 7!!",
      durationSec: 999_999, owner: "Director", cue: "unknown", shot: "unknown", status: "unknown",
    }],
    activity: Array.from({ length: 200 }, (_, index) => ({ id: `event-${index}`, at: now, actor: "Operator", action: "cue", detail: `Entry ${index}` })),
  }, "AMXSTAGE");

  assert.equal(normalized.rundown[0].id, "badid");
  assert.equal(normalized.rundown[0].title.includes("<"), false);
  assert.equal(normalized.rundown[0].target, "POD7");
  assert.equal(normalized.rundown[0].durationSec, 14_400);
  assert.equal(normalized.rundown[0].cue, "speaker");
  assert.equal(normalized.activity.length, 160);
});

test("taking a rundown item closes the previous live segment and records evidence", () => {
  const draft = workflow.defaultStageShowWorkflow("POD7", now);
  const first = workflow.takeStageRundownItem(draft, "run-2", "Director", "2026-07-19T12:01:00.000Z");
  const second = workflow.takeStageRundownItem(first, "run-3", "Director", "2026-07-19T12:01:30.000Z");

  assert.equal(second.status, "on-air");
  assert.equal(second.phase, "live");
  assert.equal(second.currentItemId, "run-3");
  assert.equal(second.rundown.find((item) => item.id === "run-2").status, "complete");
  assert.equal(second.rundown.find((item) => item.id === "run-3").status, "live");
  assert.equal(second.activity.at(-1).action, "rundown.take");
});

test("exports a production report with readiness and completion evidence", () => {
  const draft = workflow.defaultStageShowWorkflow("AMXSTAGE", now);
  const completed = workflow.completeStageRundownItem(
    workflow.takeStageRundownItem(draft, "run-1", "Director", now),
    "run-1",
    "Director",
    "2026-07-19T12:15:00.000Z",
  );
  const report = workflow.stageWorkflowReport(completed, { room: "AMXSTAGE" });

  assert.equal(report.schema, "amx.stage.production-report.v1");
  assert.equal(report.completion.rundown.complete, 1);
  assert.equal(report.context.room, "AMXSTAGE");
  assert.ok(report.production.plannedDurationSec > 0);
});
