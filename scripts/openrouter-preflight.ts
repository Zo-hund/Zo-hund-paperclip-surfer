import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { preflightOpenRouter } from "./lib/openrouter-preflight.js";

try {
  const { values } = parseArgs({ options: {
    "company-id": { type: "string" }, "agent-id": { type: "string" },
    model: { type: "string" }, "key-file": { type: "string" },
    infer: { type: "boolean", default: false },
  } });
  if (!values["company-id"] || !values["agent-id"] || !values.model) {
    throw new Error("Missing arguments");
  }
  // This command is a separate process. Never inherit a production host-tools grant.
  process.env.PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS = "";
  const key = values["key-file"]
    ? await readFile(values["key-file"], "utf8")
    : process.env.OPENROUTER_API_KEY ?? "";
  const result = await preflightOpenRouter({
    companyId: values["company-id"], agentId: values["agent-id"],
    model: values.model, key, infer: values.infer,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.preflight.status === "fail" || result.manualRun === "failed" ? 1 : 0;
} catch {
  // Transport/filesystem/argument errors may include secrets. Do not echo them.
  console.error("OpenRouter probe failed. Supply --company-id, --agent-id, --model and a private --key-file (or OPENROUTER_API_KEY). Inference requires --infer. No production data was changed.");
  process.exitCode = 1;
}
