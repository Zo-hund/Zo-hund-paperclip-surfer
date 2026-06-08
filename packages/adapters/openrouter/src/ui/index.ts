import type { CreateConfigValues, TranscriptEntry } from "@paperclipai/adapter-utils";

function parseEnvVars(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    env[key] = value;
  }
  return env;
}

function parseEnvBindings(bindings: unknown): Record<string, unknown> {
  if (typeof bindings !== "object" || bindings === null || Array.isArray(bindings)) return {};
  const env: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(bindings)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (typeof raw === "string") {
      env[key] = { type: "plain", value: raw };
      continue;
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const rec = raw as Record<string, unknown>;
    if (rec.type === "plain" && typeof rec.value === "string") {
      env[key] = { type: "plain", value: rec.value };
      continue;
    }
    if (rec.type === "secret_ref" && typeof rec.secretId === "string") {
      env[key] = {
        type: "secret_ref",
        secretId: rec.secretId,
        ...(typeof rec.version === "number" || rec.version === "latest"
          ? { version: rec.version }
          : {}),
      };
    }
  }
  return env;
}

export function parseStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.trim();
  if (!trimmed) {
    return [];
  }

  // 1. Turn status
  if (trimmed.startsWith("[OpenRouter Turn ")) {
    return [{ kind: "system", ts, text: trimmed }];
  }

  // 2. Tool call
  if (trimmed.startsWith("[Tool Call] Executing ")) {
    const match = trimmed.match(/^\[Tool Call\] Executing (\w+) with args: (.*)$/);
    if (match) {
      const name = match[1];
      let input: unknown = {};
      try {
        input = JSON.parse(match[2]);
      } catch {
        input = match[2];
      }
      return [{ kind: "tool_call", ts, name, input }];
    }
  }

  // 3. Tool result
  if (trimmed.startsWith("[Tool Result] ")) {
    const isError = trimmed.includes("[Tool Result] Error:");
    const content = trimmed.replace(/^\[Tool Result\] (Error:\s*)?/, "");
    return [{
      kind: "tool_result",
      ts,
      toolUseId: "openrouter-tool",
      content,
      isError,
    }];
  }

  // Standard output is the assistant's textual response/thoughts
  return [{ kind: "assistant", ts, text: line }];
}

export function buildAdapterConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.cwd) ac.cwd = v.cwd;
  if (v.instructionsFilePath) ac.instructionsFilePath = v.instructionsFilePath;
  if (v.promptTemplate) ac.promptTemplate = v.promptTemplate;
  if (v.model) ac.model = v.model;

  const env = parseEnvBindings(v.envBindings);
  const legacy = parseEnvVars(v.envVars);
  for (const [key, value] of Object.entries(legacy)) {
    if (!Object.prototype.hasOwnProperty.call(env, key)) {
      env[key] = { type: "plain", value };
    }
  }
  if (Object.keys(env).length > 0) ac.env = env;

  return ac;
}
