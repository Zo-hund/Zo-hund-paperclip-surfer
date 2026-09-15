import fs from "node:fs/promises";
import path from "node:path";
import { resolveOpenRouterKey, openRouterErrorMessage, hasOpenRouterHostTools } from "./credentials.js";
import { buildOpenRouterWakeEnv, buildOpenRouterTaskPrompt } from "./task-context.js";
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

class OpenRouterRunTimeoutError extends Error {
  constructor() {
    super("OpenRouter run exceeded its configured timeout. No fallback key was used.");
  }
}

export function resolveShellCommand(command: string, platform: NodeJS.Platform = process.platform) {
  return platform === "win32"
    ? { executable: "powershell", args: ["-NoProfile", "-NonInteractive", "-Command", command] }
    : { executable: "/bin/sh", args: ["-c", command] };
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const timeoutSec = asNumber(ctx.config.timeoutSec, 120);
  const deadline = Number.isFinite(timeoutSec) && timeoutSec > 0 ? Date.now() + timeoutSec * 1000 : null;
  const controller = new AbortController();
  // One deadline covers setup, every completion (including its body), and tools.
  // Explicit zero retains the shared adapter contract: no run timeout.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleDeadline = () => {
    if (deadline === null) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) controller.abort();
    else timer = setTimeout(scheduleDeadline, Math.min(remaining, 2_147_483_647));
  };
  scheduleDeadline();
  const checkDeadline = () => {
    if (controller.signal.aborted || (deadline !== null && Date.now() >= deadline)) {
      throw new OpenRouterRunTimeoutError();
    }
  };
  try {
    return await executeRun(ctx, deadline === null ? undefined : controller.signal, checkDeadline, () => {
      checkDeadline();
      return deadline === null ? 0 : Math.max(0.001, (deadline - Date.now()) / 1000);
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function executeRun(
  ctx: AdapterExecutionContext,
  signal: AbortSignal | undefined,
  checkDeadline: () => void,
  remainingTimeoutSec: () => number,
): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, onSpawn, authToken } = ctx;

  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.",
  );
  const model = asString(config.model, "openai/gpt-4o-mini").trim();
  const configuredCwd = asString(config.cwd, "");
  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const cwd = workspaceCwd || configuredCwd || process.cwd();

  const envConfig = parseObject(config.env);
  const apiKey = resolveOpenRouterKey(agent.companyId, config);
  const hostToolsEnabled = hasOpenRouterHostTools(agent.companyId);
  if (hostToolsEnabled) await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
  checkDeadline();

  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  Object.assign(env, buildPaperclipEnv(agent));
  env.PAPERCLIP_RUN_ID = runId;
  for (const key of ["PAPERCLIP_TASK_ID", "PAPERCLIP_WAKE_REASON", "PAPERCLIP_WAKE_COMMENT_ID", "PAPERCLIP_APPROVAL_ID", "PAPERCLIP_APPROVAL_STATUS", "PAPERCLIP_LINKED_ISSUE_IDS"]) {
    env[key] = "";
  }
  Object.assign(env, buildOpenRouterWakeEnv(context));
  if (env.PAPERCLIP_TASK_ID && !hostToolsEnabled) {
    throw new Error("This assigned task requires an isolated worker or company-authorized host tools. The task is not complete.");
  }
  if (authToken) {
    env.PAPERCLIP_API_KEY = authToken;
  }

  // Load memories and instructions prefix
  let memoryPrefix = "";
  const memoryFilePath = asString(context.paperclipMemoryFilePath, "");
  if (hostToolsEnabled && memoryFilePath) {
    try {
      memoryPrefix = await fs.readFile(memoryFilePath, { encoding: "utf8", signal });
    } catch (err) {
      // ignore
    }
  }
  checkDeadline();

  let instructionsPrefix = "";
  const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
  if (hostToolsEnabled && instructionsFilePath) {
    try {
      instructionsPrefix = await fs.readFile(instructionsFilePath, { encoding: "utf8", signal });
    } catch (err) {
      // ignore
    }
  }
  checkDeadline();

  const runModeNote = asString(context.paperclipRunModeNote, "").trim();

  const systemPrompt = [
    runModeNote,
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

  } else {
    // If resuming, inject system prompt update in case memories/instructions changed
    messages[0] = {
      role: "system",
      content: systemPrompt,
    };
  }
  // A resumed conversation must receive this wake's assignment too.
  const renderedPrompt = renderTemplate(promptTemplate, {
    agentId: agent.id, companyId: agent.companyId, runId,
    company: { id: agent.companyId }, agent,
    run: { id: runId, source: "on_demand" }, context,
  });
  messages.push({
    role: "user",
    content: [renderedPrompt, hostToolsEnabled ? buildOpenRouterTaskPrompt(context) : ""].filter(Boolean).join("\n\n"),
  });

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
  let completed = false;
  let runFailure: string | null = null;
  let turn = 0;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "HTTP-Referer": "https://paperclip.ing",
    "X-Title": "Paperclip Orchestrator",
  };

  conversation: while (turn < maxTurns) {
    checkDeadline();
    turn++;
    await onLog("stdout", `[OpenRouter Turn ${turn}/${maxTurns}] Sending request to model ${model}...\n`);
    checkDeadline();

    let res: Response;
    try {
      res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers,
        redirect: "error",
        signal,
        body: JSON.stringify({
          model,
          messages,
          ...(hostToolsEnabled ? { tools, tool_choice: "auto" } : {}),
        }),
      });
    } catch {
      checkDeadline();
      throw new Error("OpenRouter request could not complete. Check connectivity and the configured timeout. No fallback key was used.");
    }
    checkDeadline();

    if (!res.ok) {
      // Never persist arbitrary provider response bodies in run logs.
      throw new Error(openRouterErrorMessage(res.status));
    }

    let data: any;
    try { data = await res.json(); } catch {
      checkDeadline();
      throw new Error("OpenRouter returned an invalid or incomplete response. No fallback key was used.");
    }
    checkDeadline();
    if (data?.error) {
      // Some gateways return a provider error inside an HTTP 200 envelope.
      const status = Number(data.error.code);
      throw new Error(openRouterErrorMessage(Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502));
    }
    if (data?.usage) {
      inputTokens += data.usage.prompt_tokens || 0;
      outputTokens += data.usage.completion_tokens || 0;
    }

    const choice = data?.choices?.[0];
    if (!choice) {
      throw new Error("OpenRouter API returned an empty choices array.");
    }

    const assistantMessage = choice.message;
    if (!assistantMessage || typeof assistantMessage !== "object") {
      throw new Error("OpenRouter returned an invalid assistant message.");
    }
    messages.push(assistantMessage);

    if (assistantMessage.content) {
      await onLog("stdout", `\n${assistantMessage.content}\n`);
    }

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      if (!hostToolsEnabled) {
        throw new Error("Host tools are unavailable for this company. Use an isolated worker for tenant coding tasks.");
      }
      for (const call of assistantMessage.tool_calls) {
        checkDeadline();
        const toolName = call.function.name;
        const toolArgs = JSON.parse(call.function.arguments);
        await onLog("stdout", `\n[Tool Call] Executing ${toolName} with args: ${JSON.stringify(toolArgs)}\n`);
        checkDeadline();

        let result = "";
        let isError = false;

        try {
          if (toolName === "run_command") {
            const shell = resolveShellCommand(toolArgs.command);
            const cmdResult = await runChildProcess(runId, shell.executable, shell.args, {
              cwd,
              env,
              timeoutSec: remainingTimeoutSec(),
              graceSec: 15,
              onLog,
              onSpawn,
            });
            if (cmdResult.timedOut) {
              throw new OpenRouterRunTimeoutError();
            }
            result = cmdResult.stdout + (cmdResult.stderr ? `\nError:\n${cmdResult.stderr}` : "");
            if (cmdResult.exitCode !== 0) isError = true;
          } else if (toolName === "read_file") {
            const fullPath = path.resolve(cwd, toolArgs.filePath);
            result = await fs.readFile(fullPath, { encoding: "utf8", signal });
          } else if (toolName === "write_file") {
            const fullPath = path.resolve(cwd, toolArgs.filePath);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            checkDeadline();
            await fs.writeFile(fullPath, toolArgs.content, { encoding: "utf8", signal });
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
          if (err instanceof OpenRouterRunTimeoutError) throw err;
          checkDeadline();
          result = err instanceof Error ? err.message : String(err);
          isError = true;
        }
        checkDeadline();

        const previewText = result.slice(0, 500) + (result.length > 500 ? "..." : "");
        await onLog("stdout", `[Tool Result] ${isError ? "Error: " : ""}${previewText}\n`);

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: toolName,
          content: result,
        });
        if (isError) {
          runFailure = `OpenRouter tool ${toolName} failed. Inspect the tool result before retrying; the task is not complete.`;
          break conversation;
        }
      }
    } else {
      // Completed conversation turn
      completed = true;
      break;
    }
  }
  checkDeadline();

  const lastMsg = messages[messages.length - 1];
  if (!completed && !runFailure) {
    runFailure = `OpenRouter reached its ${maxTurns}-turn limit without completing. The task is not complete.`;
  }

  return {
    exitCode: runFailure ? 1 : 0,
    signal: null,
    timedOut: false,
    errorMessage: runFailure,
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
    summary: runFailure ?? (typeof lastMsg?.content === "string" ? lastMsg.content : "Run finished."),
  };
}
