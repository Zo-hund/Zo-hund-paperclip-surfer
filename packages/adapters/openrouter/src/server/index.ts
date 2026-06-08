export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";

export async function listModels(): Promise<Array<{ id: string; label: string }>> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "HTTP-Referer": "https://amx-air-hubs.cc",
        "X-Title": "AMX Air Hubs Orchestrator",
      }
    });
    if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
    const json = await res.json() as any;
    if (Array.isArray(json.data)) {
      return json.data.map((m: any) => ({
        id: m.id,
        label: m.name ? `${m.name} (${m.id})` : m.id,
      }));
    }
  } catch (err) {
    // Ignore and return fallback
  }
  return [
    { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet (anthropic/claude-3.5-sonnet)" },
    { id: "openai/gpt-4o", label: "GPT-4o (openai/gpt-4o)" },
    { id: "meta-llama/llama-3-70b-instruct", label: "Llama 3 70B (meta-llama/llama-3-70b-instruct)" },
    { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5 (google/gemini-flash-1.5)" },
    { id: "deepseek/deepseek-chat", label: "DeepSeek Chat (deepseek/deepseek-chat)" },
  ];
}

import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    const obj = parseObject(raw);
    if (!obj.messages) return null;
    return {
      messages: obj.messages,
      cwd: asString(obj.cwd, ""),
    };
  },
  serialize(params) {
    const obj = parseObject(params);
    return {
      messages: obj.messages || [],
      cwd: asString(obj.cwd, ""),
    };
  },
  getDisplayId(params) {
    const obj = parseObject(params);
    const msgs = Array.isArray(obj.messages) ? obj.messages : [];
    return `openrouter-${msgs.length}-turns`;
  },
};
