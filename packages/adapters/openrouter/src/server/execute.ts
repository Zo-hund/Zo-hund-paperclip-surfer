import fs from "node:fs/promises";
import path from "node:path";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asBoolean,
  asNumber,
  asString,
  asStringArray,
  buildPaperclipEnv,
  ensureAbsoluteDirectory,
  parseObject,
  redactEnvForLogs,
  renderTemplate,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";

const tools = [
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command inside the workspace working directory.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            "description": "The command string to execute in the workspace."
          }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the entire content of a file from the workspace filesystem.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Relative path to the file inside the workspace."
          }
        },
        required: ["filePath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write or overwrite content to a file in the workspace filesystem.",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Relative path to the file inside the workspace."
          },
          content: {
            type: "string",
            description: "The text content to write to the file."
          }
        },
        required: ["filePath", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and subdirectories inside a directory in the workspace.",
      parameters: {
        type: "object",
        properties: {
          dirPath: {
            type: "string",
            description: "Relative path to the directory (use '.' for root)."
          }
        },
        required: ["dirPath"]
      }
    }
  }
];

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, onSpawn, authToken } = ctx;

  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.",
  );
  const model = asString(config.model, "anthropic/claude-3.5-sonnet").trim();
  const configuredCwd = asString(config.cwd, "");
  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const cwd = workspaceCwd || configuredCwd || process.cwd();
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });

  const envConfig = parseObject(config.env);
  const apiKey = asString(envConfig.OPENROUTER_API_KEY, "").trim() || process.env.OPENROUTER_API_KEY || "";

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY in agent environment configuration.");
  }

  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  if (authToken) {
    env.PAPERCLIP_API_KEY = authToken;
  }

  // Load memories and instructions prefix
  let memoryPrefix = "";
  const memoryFilePath = asString(context.paperclipMemoryFilePath, "");
  if (memoryFilePath) {
    try {
      memoryPrefix = await fs.readFile(memoryFilePath, "utf8");
    } catch (err) {
      // ignore
    }
  }

  let instructionsPrefix = "";
  const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
  if (instructionsFilePath) {
    try {
      instructionsPrefix = await fs.readFile(instructionsFilePath, "utf8");
    } catch (err) {
      // ignore
    }
  }

  const systemPrompt = [
    "You are a helpful AI coding agent working in a local workspace environment.",
    instructionsPrefix,
    memoryPrefix,
  ].filter(Boolean).join("\n\n");

  // Load session conversation history
  const runtimeSessionParams = parseObject(runtime.sessionParams);
  const previousMessages = Array.isArray(runtimeSessionParams.messages) ? runtimeSessionParams.messages : [];
  
  const messages = [...previousMessages];
  
  if (messages.length === 0) {
    messages.push({
      role: "system",
      content: systemPrompt,
    });

    const templateData = {
      agentId: agent.id,
      companyId: agent.companyId,
      runId,
      company: { id: agent.companyId },
      agent,
      run: { id: runId, source: "on_demand" },
      context,
    };
    const renderedPrompt = renderTemplate(promptTemplate, templateData);
    messages.push({
      role: "user",
      content: renderedPrompt,
    });
  } else {
    // If resuming, inject system prompt update in case memories/instructions changed
    messages[0] = {
      role: "system",
      content: systemPrompt,
    };
  }

  if (onMeta) {
    await onMeta({
      adapterType: "openrouter",
      command: "http-fetch",
      cwd,
      commandNotes: ["Invoking OpenRouter completions API via direct HTTP fetch", `Model: ${model}`],
      commandArgs: ["https://openrouter.ai/api/v1/chat/completions"],
      env: redactEnvForLogs(env),
      prompt: systemPrompt,
      context,
    });
  }

  let inputTokens = 0;
  let outputTokens = 0;
  const maxTurns = 20;
  let turn = 0;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "HTTP-Referer": "https://paperclip.ing",
    "X-Title": "Paperclip Orchestrator",
  };

  while (turn < maxTurns) {
    turn++;
    await onLog("stdout", `[OpenRouter Turn ${turn}/${maxTurns}] Sending request to model ${model}...\n`);

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: "auto",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter API error: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as any;
    if (data.usage) {
      inputTokens += data.usage.prompt_tokens || 0;
      outputTokens += data.usage.completion_tokens || 0;
    }

    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error("OpenRouter API returned an empty choices array.");
    }

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    if (assistantMessage.content) {
      await onLog("stdout", `\n${assistantMessage.content}\n`);
    }

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      for (const call of assistantMessage.tool_calls) {
        const toolName = call.function.name;
        const toolArgs = JSON.parse(call.function.arguments);
        await onLog("stdout", `\n[Tool Call] Executing ${toolName} with args: ${JSON.stringify(toolArgs)}\n`);

        let result = "";
        let isError = false;

        try {
          if (toolName === "run_command") {
            const cmdResult = await runChildProcess(runId, "powershell", ["-Command", toolArgs.command], {
              cwd,
              env,
              timeoutSec: 0,
              graceSec: 15,
              onLog,
            });
            result = cmdResult.stdout + (cmdResult.stderr ? `\nError:\n${cmdResult.stderr}` : "");
            if (cmdResult.exitCode !== 0) isError = true;
          } else if (toolName === "read_file") {
            const fullPath = path.resolve(cwd, toolArgs.filePath);
            result = await fs.readFile(fullPath, "utf8");
          } else if (toolName === "write_file") {
            const fullPath = path.resolve(cwd, toolArgs.filePath);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, toolArgs.content, "utf8");
            result = `File successfully written to ${toolArgs.filePath}`;
          } else if (toolName === "list_dir") {
            const fullPath = path.resolve(cwd, toolArgs.dirPath);
            const items = await fs.readdir(fullPath, { withFileTypes: true });
            result = items.map((item) => `${item.isDirectory() ? "[DIR]" : "[FILE]"} ${item.name}`).join("\n");
          } else {
            result = `Unknown tool: ${toolName}`;
            isError = true;
          }
        } catch (err) {
          result = err instanceof Error ? err.message : String(err);
          isError = true;
        }

        const previewText = result.slice(0, 500) + (result.length > 500 ? "..." : "");
        await onLog("stdout", `[Tool Result] ${isError ? "Error: " : ""}${previewText}\n`);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: toolName,
          content: result,
        });
      }
    } else {
      // Completed conversation turn
      break;
    }
  }

  const lastMsg = messages[messages.length - 1];

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    errorMessage: null,
    usage: {
      inputTokens,
      outputTokens,
    },
    sessionParams: {
      messages,
      cwd,
    },
    sessionDisplayId: `openrouter-${messages.length}-turns`,
    provider: "openrouter",
    model,
    summary: typeof lastMsg?.content === "string" ? lastMsg.content : "Run finished.",
  };
}
