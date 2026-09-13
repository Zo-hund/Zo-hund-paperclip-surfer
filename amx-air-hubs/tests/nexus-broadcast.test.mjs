import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/nexus-broadcast.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const broadcast = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("builds a bounded Nexus podcast handoff to the Stage audio console", () => {
  assert.equal(
    broadcast.nexusStageHref(" nexus room ! ", "podcast"),
    "/stage?room=NEXUSROOM&format=podcast&console=audio&source=nexus",
  );
  assert.equal(broadcast.nexusViewerHref("nexus room"), "/watch/NEXUSROOM");
});

test("parses only approved room and format launch options", () => {
  assert.deepEqual(
    broadcast.stageLaunchConfig("?room=pod-42&format=podcast&console=audio&source=nexus"),
    { room: "POD-42", format: "podcast", openAudio: true, fromNexus: true },
  );
  assert.deepEqual(
    broadcast.stageLaunchConfig("?room=%3Cscript%3E&format=invalid"),
    { room: "SCRIPT", format: null, openAudio: false, fromNexus: false },
  );
});
