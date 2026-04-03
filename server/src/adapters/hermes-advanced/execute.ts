import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import { asString, buildPaperclipEnv, redactEnvForLogs } from "../utils.js";

/**
 * Hermes Advanced Adapter
 * 
 * Executes the Nous Research Hermes Agent as a backend.
 * It uses the internal Paperclip Hermes MCP server as a communication bridge.
 */

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, config, onLog, onMeta } = ctx;
  
  // Resolve paths — use import.meta.url for reliable root detection on all platforms
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, "../../../../"); // server/src/adapters/hermes-advanced → monorepo root
  const hermesDir = path.resolve(rootDir, "packages/hermes-agent");
  const pythonPath = path.join(hermesDir, ".venv", "Scripts", "python.exe");
  const scriptPath = path.join(hermesDir, "run_agent.py");
  const baseConfigPath = path.join(hermesDir, "cli-config.yaml");
  const mcpServerScript = path.resolve(rootDir, "server/src/services/agent-runtime/mcp/hermes-server.ts");

  // Create temporary config to inject Paperclip MCP bridge
  const fs = await import("node:fs");
  const os = await import("node:os");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-run-"));
  const tempConfigPath = path.join(tempDir, "cli-config.yaml");
  
  let configContent = "";
  try {
    if (fs.existsSync(baseConfigPath)) {
      configContent = fs.readFileSync(baseConfigPath, "utf-8");
    }
  } catch (e) {
    onLog?.("stderr", `Warning: Failed to read base config: ${e}\n`);
  }

  // Inject/Append Paperclip MCP server config
  const mcpSection = `
mcp_servers:
  paperclip:
    command: "npx"
    args: ["tsx", "${mcpServerScript.replace(/\\/g, "/")}"]
    env:
      PAPERCLIP_API_URL: "http://localhost:3100/api"
      AGENT_ID: "${agent.id}"
      COMPANY_ID: "${agent.companyId}"
`;
  fs.writeFileSync(tempConfigPath, configContent + "\n" + mcpSection);

  const query = asString(config.prompt, "How can I help you?");
  const model = asString(config.model, "");
  const baseUrl = asString(config.base_url, "");
  const apiKey = asString(config.api_key, "");
  const maxTurns = typeof config.max_turns === "number" ? config.max_turns : 10;
  const enabledToolsets = asString(config.enabled_toolsets, "web_tools,terminal_tools,file_tools,mcp-paperclip");
  const disabledToolsets = asString(config.disabled_toolsets, "");
  
  let systemPrompt = "";
  if (config.instructionsFilePath) {
    try {
      const fullPath = path.resolve(process.cwd(), asString(config.instructionsFilePath, ""));
      if (fs.existsSync(fullPath)) {
        systemPrompt = fs.readFileSync(fullPath, "utf-8");
      }
    } catch (e) {
      onLog?.("stderr", `Failed to read instructions from ${config.instructionsFilePath}: ${e}\n`);
    }
  }

  const env: Record<string, string> = { 
    ...process.env,
    ...buildPaperclipEnv(agent),
    PAPERCLIP_API_URL: "http://localhost:3100/api",
    AGENT_ID: agent.id,
    COMPANY_ID: agent.companyId,
    HERMES_CONFIG_PATH: tempConfigPath,
  };

  const commandArgs = [scriptPath, "--query", query];
  if (model) commandArgs.push("--model", model);
  if (baseUrl) commandArgs.push("--base_url", baseUrl);
  if (apiKey) commandArgs.push("--api_key", apiKey);
  if (maxTurns) commandArgs.push("--max_turns", maxTurns.toString());
  if (enabledToolsets) commandArgs.push("--enabled_toolsets", enabledToolsets);
  if (disabledToolsets) commandArgs.push("--disabled_toolsets", disabledToolsets);
  if (systemPrompt) commandArgs.push("--system_prompt", systemPrompt);

  if (onMeta) {
    await onMeta({
      adapterType: "hermes_advanced",
      command: pythonPath,
      cwd: hermesDir,
      commandArgs,
      env: redactEnvForLogs(env),
    });
  }

  return new Promise((resolve) => {
    const proc = spawn(pythonPath, commandArgs, {
      cwd: hermesDir,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      const chunk = data.toString();
      stdout += chunk;
      onLog?.("stdout", chunk);
    });

    proc.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      onLog?.("stderr", chunk);
    });

    proc.on("close", (code, signal) => {
      // Cleanup temp config
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        onLog?.("stderr", `Warning: Failed to cleanup temp directory ${tempDir}: ${err}\n`);
      }

      if (code !== 0 && code !== null) {
        resolve({
          exitCode: code,
          signal: signal ?? null,
          timedOut: false,
          errorMessage: `Hermes Agent failed with code ${code}. Stderr: ${stderr.slice(-500)}`,
        });
      } else {
        resolve({
          exitCode: code ?? 0,
          signal: signal ?? null,
          timedOut: false,
          resultJson: { stdout, stderr },
        });
      }
    });

    proc.on("error", (err) => {
      // Cleanup temp config
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}

      resolve({
        exitCode: -1,
        signal: null,
        timedOut: false,
        errorMessage: `Failed to launch Hermes Agent: ${err.message}`,
      });
    });
  });
}
